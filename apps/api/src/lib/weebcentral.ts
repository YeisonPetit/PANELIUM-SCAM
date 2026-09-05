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

export async function searchWeebCentral(query: string, genre?: string, page = 1) {
  try {
    const cleanQ = query ? query.trim() : '';
    const cleanGenre = genre && genre.toUpperCase() !== 'ALL' ? genre.trim() : '';
    const limit = 32;
    const offset = (page - 1) * limit;

    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
      sort: cleanQ ? 'Best Match' : 'Popularity',
      order: 'Descending',
      official: 'Any',
      anime: 'Any',
      adult: 'Any',
      display_mode: 'Full Display',
    });

    if (cleanQ) params.set('text', cleanQ);
    if (cleanGenre) params.set('included_tag', cleanGenre);

    const res = await fetch(`https://weebcentral.com/search/data?${params.toString()}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'HX-Request': 'true',
      },
    });

    if (!res.ok) {
      throw new Error(`WeebCentral search response status ${res.status}`);
    }

    const html = await res.text();
    const items: Array<{ id: string; title: string; coverUrl: string; author: string; lastChapter: string }> = [];
    const articles = html.split('<article class="bg-base-300').slice(1);

    for (const art of articles) {
      const idMatch = art.match(/\/series\/([^"]+)/);
      const id = idMatch ? idMatch[1] : '';

      const titleMatch =
        art.match(/<a[^>]*class="[^"]*link[^"]*"[^>]*>([^<]+)<\/a>/) ||
        art.match(/class="[^"]*text-ellipsis[^"]*"[^>]*>([^<]+)</) ||
        art.match(/alt="([^"]+)"/);
      const title = titleMatch ? titleMatch[1].replace(/\s*cover$/i, '').trim() : '';

      const imgMatch = art.match(/srcset="([^"]+)"/) || art.match(/src="([^"]+)"/);
      const coverUrl = imgMatch ? imgMatch[1] : '';

      if (id && title) {
        items.push({ id, title, coverUrl, author: 'Unknown', lastChapter: '' });
      }
    }

    return {
      results: items,
      hasNextPage: items.length === limit,
      currentPage: page,
    };
  } catch (error) {
    console.error('Error searching WeebCentral:', error);
    // Fallback to Consumet search
    try {
      const fallback = await weeb.search(query || (genre && genre !== 'ALL' ? genre : 'solo leveling'), page);
      return {
        results: fallback.results.map((r) => ({
          id: r.id,
          title: getString(r.title),
          coverUrl: getString(r.image),
          author: 'Unknown',
          lastChapter: '',
        })),
        hasNextPage: fallback.hasNextPage || false,
        currentPage: page,
      };
    } catch {
      return { results: [], hasNextPage: false, currentPage: page };
    }
  }
}

/**
 * Extrae el número real de capítulo/episodio soportando temporadas (S1, S2, Season 3, etc.)
 * y numeración decimal (ej. 106.5, Ch. 12.5).
 */
export function parseChapterNumber(title: string): number {
  if (!title) return 0;
  const cleanStr = title.trim();

  // 1. Buscar coincidencia explícita de Capítulo / Episodio / Ch. (ignora prefijos de temporada previos)
  // Ejemplos: "S2 - Episode 106.5", "Season 2 Chapter 45", "Chapter 186", "Episode 12"
  const explicitMatch = cleanStr.match(/(?:(?:Chapter|Episode|Ep|Ch|Capitulo|Cap)\.?\s*[:#-]?\s*)(\d+(\.\d+)?)/i);
  if (explicitMatch) {
    return parseFloat(explicitMatch[1]);
  }

  // 2. Si tiene prefijo de Temporada (ej: "S2 - 106", "Season 1 - 40"), removerlo antes de buscar dígitos
  const withoutSeason = cleanStr.replace(/^(?:Season|S)\s*\d+\s*[-:]?\s*/i, '');
  const numberMatch = withoutSeason.match(/(\d+(\.\d+)?)/);
  if (numberMatch) {
    return parseFloat(numberMatch[1]);
  }

  // 3. Fallback: primer número encontrado en el texto
  const fallback = cleanStr.match(/(\d+(\.\d+)?)/);
  return fallback ? parseFloat(fallback[1]) : 0;
}

export async function importWeebCentralSeries(seriesId: string, targetSeriesId?: string) {
  try {
    const details = await weeb.fetchMangaInfo(seriesId);
    if (!details) {
      throw new Error('Series details not found on WeebCentral');
    }

    const titleStr = getString(details.title);
    const slug = slugify(titleStr);

    // 1. Create or update Series in DB
    // Buscar primero por targetSeriesId (si se pasó), luego por sourceUrl, y finalmente por slug
    let series = targetSeriesId
      ? await prisma.series.findUnique({
          where: { id: targetSeriesId },
          include: { genres: true },
        })
      : null;

    if (!series) {
      series = await prisma.series.findFirst({
        where: { sourceUrl: `weebcentral:${seriesId}` },
        include: { genres: true },
      });
    }

    if (!series) {
      series = await prisma.series.findUnique({
        where: { slug },
        include: { genres: true },
      });
    }

    if (!series) {
      series = await prisma.series.create({
        data: {
          title: titleStr,
          slug,
          description: getString(details.description) || 'No description available.',
          cover: getString(details.image) || '',
          status: details.status === 'Completed' ? 'COMPLETED' : 'ONGOING',
          type: 'MANHWA',
          releaseYear: new Date().getFullYear(),
          author: getString(details.author) || 'Unknown',
          artist: getString(details.author) || 'Unknown',
          sourceUrl: `weebcentral:${seriesId}`,
        },
        include: { genres: true },
      });
    } else if (series.sourceUrl !== `weebcentral:${seriesId}`) {
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
        select: { id: true, number: true, sourceUrl: true },
      });

      const existingSourceUrls = new Set(
        existingChapters.map((c) => c.sourceUrl).filter((url): url is string => Boolean(url))
      );
      const existingNumbers = new Set(existingChapters.map((c) => c.number));

      // Procesar capítulos en orden cronológico (de más antiguo a más reciente)
      // Consumet suele devolverlos de más reciente a más antiguo, así que los invertimos
      const rawChapters = [...details.chapters].reverse();

      for (let idx = 0; idx < rawChapters.length; idx++) {
        const chap = rawChapters[idx];
        const chapTitle = getString(chap.title);
        const chapId = chap.id;

        // Si el capítulo ya fue importado con su sourceUrl exacto, verificar si necesita actualizar su número
        if (chapId && existingSourceUrls.has(chapId)) {
          continue;
        }

        let parsedNumber = parseChapterNumber(chapTitle);

        // Si el número calculado ya existe para otro capítulo de esta serie (ej: reinicio de temporada 1..80 y luego 1..106),
        // o si es 0 en un capítulo no prólogo, calcular número único secuencial
        if (existingNumbers.has(parsedNumber)) {
          // Si el título indica S2 / Season 2 y el número colisiona, calcular el siguiente float disponible
          let candidate = parsedNumber;
          while (existingNumbers.has(candidate)) {
            candidate = parseFloat((candidate + 0.01).toFixed(2));
          }
          parsedNumber = candidate;
        }

        await prisma.chapter.create({
          data: {
            seriesId: series.id,
            number: parsedNumber,
            title: chapTitle,
            sourceUrl: chapId || undefined,
          },
        });

        if (chapId) existingSourceUrls.add(chapId);
        existingNumbers.add(parsedNumber);
        newChaptersCount++;
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
