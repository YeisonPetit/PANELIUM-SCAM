import { MANGA } from '@consumet/extensions';
import { PrismaClient } from '@prisma/client';
import { redis } from './redis';

const prisma = new PrismaClient();
const weeb = new MANGA.WeebCentral();

// Helper to convert string to slug
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Helper to extract string from Consumet's union types
function getString(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val) && val.length > 0) return getString(val[0]);
  if (typeof val === 'object') {
    return val.en || val.romaji || val.english || val.native || Object.values(val)[0] || '';
  }
  return String(val);
}

export async function searchWeebCentral(query: string) {
  try {
    const res = await weeb.search(query);
    return res.results.map(r => ({
      id: r.id,
      title: getString(r.title),
      coverUrl: getString(r.image),
      author: 'Unknown', // WeebCentral search might not return author
      lastChapter: ''
    }));
  } catch (error) {
    console.error('Error searching WeebCentral:', error);
    return [];
  }
}

export async function importWeebCentralSeries(seriesId: string) {
  try {
    const details = await weeb.fetchMangaInfo(seriesId);
    if (!details) {
      throw new Error('Series details not found on WeebCentral');
    }

    const titleStr = getString(details.title);
    const slug = slugify(titleStr);

    // 1. Create or update Series in DB
    let series = await prisma.series.findUnique({
      where: { slug },
      include: { genres: true },
    });

    if (!series) {
      series = await prisma.series.create({
        data: {
          title: titleStr,
          slug,
          description: getString(details.description) || 'No description available.',
          cover: getString(details.image) || '',
          status: details.status === 'Completed' ? 'COMPLETED' : 'ONGOING',
          type: 'MANHWA', // Assuming mostly manhwa for this use case
          releaseYear: new Date().getFullYear(),
          author: getString(details.author) || 'Unknown',
          artist: getString(details.author) || 'Unknown',
          sourceUrl: `weebcentral:${seriesId}`,
        },
        include: { genres: true },
      });
    } else if (!series.sourceUrl) {
      series = await prisma.series.update({
        where: { id: series.id },
        data: { sourceUrl: `weebcentral:${seriesId}` },
        include: { genres: true },
      });
    }


    // Assign genres
    if (details.genres && series) {
      for (const genreName of details.genres) {
        const genreStr = getString(genreName);
        if (!genreStr) continue;
        const genreSlug = slugify(genreStr);
        let genre = await prisma.genre.findUnique({ where: { slug: genreSlug } });
        if (!genre) {
          genre = await prisma.genre.create({
            data: { name: genreStr, slug: genreSlug },
          });
        }
        await prisma.seriesGenre.upsert({
          where: { seriesId_genreId: { seriesId: series.id, genreId: genre.id } },
          update: {},
          create: { seriesId: series.id, genreId: genre.id },
        });
      }
    }

    // 2. Create chapters in DB
    let newChaptersCount = 0;
    if (details.chapters && series) {
      const existingChapters = await prisma.chapter.findMany({
        where: { seriesId: series.id },
        select: { number: true },
      });
      const existingNumbers = new Set(existingChapters.map((c) => c.number));

      for (const chap of details.chapters) {
        const chapTitle = getString(chap.title);
        const numMatch = chapTitle.match(/(?:Chapter|Episode|Ch\.?)?\s*(\d+(\.\d+)?)/i);
        const number = numMatch ? parseFloat(numMatch[1]) : 0;

        if (!existingNumbers.has(number)) {
          await prisma.chapter.create({
            data: {
              seriesId: series.id,
              number,
              title: chapTitle,
              sourceUrl: chap.id, // Store the WeebCentral chapter ID for lazy loading
            },
          });
          existingNumbers.add(number);
          newChaptersCount++;
        }
      }
    }

    // Invalidate Redis cache if new chapters were added or cache exists
    try {
      const keys = await redis.keys('api:series:*');
      if (keys && keys.length > 0) {
        await redis.del(...keys);
      }
      await redis.del('api:series:all');
    } catch (cacheErr) {
      // Redis optional cache clear fallback
    }

    return { ...series, chapterCount: details.chapters?.length || 0, newChaptersCount };
  } catch (err) {
    console.error('Error importing WeebCentral series:', err);
    throw err;
  }
}

export async function getWeebCentralChapterPages(chapterId: string): Promise<{ url: string, referer: string }[]> {
  try {
    const pages = await weeb.fetchChapterPages(chapterId);
    return pages.map(p => ({
      url: p.img,
      referer: typeof p.headerForImage === 'string' ? p.headerForImage : (p.headerForImage as any)?.Referer || 'https://weebcentral.com',
    }));
  } catch (error) {
    console.error('Error fetching WeebCentral chapter pages:', error);
    return [];
  }
}
