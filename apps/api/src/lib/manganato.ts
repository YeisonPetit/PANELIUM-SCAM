import * as cheerio from 'cheerio';
import { PrismaClient } from '@prisma/client';
import { redis } from './redis';

const prisma = new PrismaClient();

const MANGANATO_BASE = 'https://manganato.com';
const CHAP_MANGANATO_BASE = 'https://chapmanganato.to'; // Chapters often use this

export interface ManganatoSearchResult {
  id: string; // The URL slug
  title: string;
  coverUrl: string;
  author: string;
  lastChapter: string;
}

export async function searchManganato(query: string): Promise<ManganatoSearchResult[]> {
  try {
    const searchUrl = `${MANGANATO_BASE}/search/story/${query.replace(/[\s-]+/g, '_').toLowerCase()}`;
    const res = await fetch(searchUrl);
    if (!res.ok) throw new Error(`Manganato search failed: ${res.statusText}`);
    
    const html = await res.text();
    const $ = cheerio.load(html);
    const results: ManganatoSearchResult[] = [];

    $('.search-story-item').each((i, el) => {
      const linkEl = $(el).find('a.item-img');
      const href = linkEl.attr('href') || '';
      const coverUrl = linkEl.find('img').attr('src') || '';
      
      const title = $(el).find('.item-title').text().trim();
      const author = $(el).find('.item-author').text().trim();
      const lastChapter = $(el).find('.item-chapter').first().text().trim();

      // Extract ID from URL (e.g. https://manganato.com/manga-dr980474 -> manga-dr980474)
      const idMatch = href.match(/\/([^\/]+)$/);
      const id = idMatch ? idMatch[1] : '';

      if (id && title) {
        results.push({
          id,
          title,
          coverUrl,
          author,
          lastChapter
        });
      }
    });

    return results;
  } catch (error) {
    console.error('Error searching Manganato:', error);
    return [];
  }
}

export interface ManganatoSeriesDetails {
  title: string;
  description: string;
  coverUrl: string;
  author: string;
  status: string;
  genres: string[];
  chapters: {
    id: string; // chapter URL slug
    title: string;
    number: number;
    url: string;
  }[];
}

export async function getManganatoSeries(seriesId: string): Promise<ManganatoSeriesDetails | null> {
  try {
    // Some series are on manganato.com, some on chapmanganato.to
    // Let's try chapmanganato first as it's more common for series pages
    let url = `${CHAP_MANGANATO_BASE}/${seriesId}`;
    let res = await fetch(url);
    
    if (!res.ok) {
      url = `${MANGANATO_BASE}/${seriesId}`;
      res = await fetch(url);
      if (!res.ok) throw new Error(`Manganato series fetch failed: ${res.statusText}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const title = $('.story-info-right h1').text().trim();
    const coverUrl = $('.info-image img').attr('src') || '';
    const description = $('#panel-story-info-description').text().replace('Description :', '').trim();
    
    let author = 'Unknown';
    let status = 'ONGOING';
    const genres: string[] = [];

    $('.variations-tableInfo tbody tr').each((i, el) => {
      const label = $(el).find('.info-alternative').text().trim().toLowerCase();
      const value = $(el).find('.table-value');
      
      if (label.includes('author')) {
        author = value.text().trim();
      } else if (label.includes('status')) {
        status = value.text().trim().toUpperCase() === 'COMPLETED' ? 'COMPLETED' : 'ONGOING';
      } else if (label.includes('genres')) {
        value.find('a').each((_, a) => { genres.push($(a).text().trim()); });
      }
    });

    const chapters: ManganatoSeriesDetails['chapters'] = [];
    $('.row-content-chapter li').each((i, el) => {
      const a = $(el).find('a');
      const chapTitle = a.text().trim();
      const chapUrl = a.attr('href') || '';
      
      // Try to extract chapter number
      const numMatch = chapTitle.match(/Chapter (\d+(\.\d+)?)/i) || chapUrl.match(/chapter-(\d+(\.\d+)?)/i);
      const number = numMatch ? parseFloat(numMatch[1]) : (10000 - i); // fallback if no number

      // Extract chapter ID
      const chapIdMatch = chapUrl.match(/\/([^\/]+)$/);
      const chapId = chapIdMatch ? chapIdMatch[1] : '';

      if (chapId) {
        chapters.push({
          id: chapId,
          title: chapTitle,
          number,
          url: chapUrl
        });
      }
    });

    // Reverse to get chronological order (1, 2, 3...)
    chapters.reverse();

    return {
      title,
      description,
      coverUrl,
      author,
      status,
      genres,
      chapters
    };

  } catch (error) {
    console.error('Error fetching Manganato series:', error);
    return null;
  }
}

export async function getManganatoChapterPages(chapterUrl: string): Promise<string[]> {
  try {
    const res = await fetch(chapterUrl, {
      headers: {
        'Referer': MANGANATO_BASE
      }
    });
    if (!res.ok) throw new Error(`Manganato chapter fetch failed: ${res.statusText}`);

    const html = await res.text();
    const $ = cheerio.load(html);
    const pages: string[] = [];

    $('.container-chapter-reader img').each((i, el) => {
      const src = $(el).attr('src');
      if (src) pages.push(src);
    });

    return pages;
  } catch (error) {
    console.error('Error fetching Manganato chapter pages:', error);
    return [];
  }
}

// Helper to convert string to slug
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function importManganatoSeries(seriesId: string) {
  try {
    const details = await getManganatoSeries(seriesId);
    if (!details) {
      throw new Error('Series details not found on Manganato');
    }

    const slug = slugify(details.title);

    // 1. Create or update Series in DB
    let series = await prisma.series.findUnique({
      where: { slug },
      include: { genres: true },
    });

    if (!series) {
      series = await prisma.series.create({
        data: {
          title: details.title,
          slug,
          description: details.description,
          cover: details.coverUrl,
          status: details.status as any,
          type: 'MANHWA', // Manganato has mostly manhwa/manga, we'll default to MANHWA
          releaseYear: new Date().getFullYear(),
          author: details.author,
          artist: details.author,
          sourceUrl: `${CHAP_MANGANATO_BASE}/${seriesId}`, // Save the source URL for reference
        },
        include: { genres: true },
      });
    }

    // Assign genres
    for (const genreName of details.genres) {
      const genreSlug = slugify(genreName);
      let genre = await prisma.genre.findUnique({ where: { slug: genreSlug } });
      if (!genre) {
        genre = await prisma.genre.create({
          data: { name: genreName, slug: genreSlug },
        });
      }
      await prisma.seriesGenre.upsert({
        where: { seriesId_genreId: { seriesId: series.id, genreId: genre.id } },
        update: {},
        create: { seriesId: series.id, genreId: genre.id },
      });
    }

    // 2. Create chapters in DB
    for (const chap of details.chapters) {
      let chapterRecord = await prisma.chapter.findFirst({
        where: { seriesId: series.id, number: chap.number },
      });

      if (!chapterRecord) {
        await prisma.chapter.create({
          data: {
            seriesId: series.id,
            number: chap.number,
            title: chap.title,
            sourceUrl: chap.url, // Save the chapter URL for lazy loading pages later
          },
        });
      }
    }

    // Invalidate Redis cache for series catalog
    await redis.del('api:series:all');

    return { ...series, chapterCount: details.chapters.length };
  } catch (err) {
    console.error('Error importing Manganato series:', err);
    throw err;
  }
}
