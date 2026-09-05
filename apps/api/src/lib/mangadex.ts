import { prisma } from './prisma';
import { redis } from './redis';
import { SeriesStatus, SeriesType } from '@prisma/client';

const MANGADEX_API_BASE = 'https://api.mangadex.org';
const MANGADEX_UPLOADS_BASE = 'https://uploads.mangadex.org';

export interface MangaDexSearchResult {
  id: string;
  title: string;
  description: string;
  coverUrl: string;
  status: string;
  type: string;
  releaseYear: number;
  author: string;
  artist: string;
  genres: string[];
  lastChapter?: string;
}

const MANGADEX_GENRE_TAG_MAP: Record<string, string> = {
  action: '391b0423-d847-456f-aff0-8b0cfc03066b',
  adventure: '87cc87cd-a395-47af-b27a-93258283bbc6',
  comedy: '4d32cc48-9f00-4cca-9b5a-a839f0764984',
  drama: 'b9af3a63-f03e-4ba3-b89c-6e67c3f863e4',
  fantasy: 'cdc58593-87dd-415e-bbc0-2ec27bf404cc',
  horror: 'cdad7e68-07dd-4270-a080-1452a81757fb',
  isekai: 'ace04997-f6bd-4329-8b0e-ad888c934f9c',
  'martial arts': '799c43e2-50d4-4941-9dd8-e6c6a3d8d648',
  mystery: 'ee963cdd-085e-450f-9694-1a3b1a8f9d0c',
  psychological: '3b60b75c-a2d7-4860-ab56-05f391bb889c',
  reincarnation: '0bc90acb-ccc1-44ca-a34a-b9f3a73259d0',
  romance: '423e2eae-a7a2-4a8b-ac03-a8351462d71d',
  'sci-fi': '256c8bd9-4904-4360-bf4f-508a76d67183',
  'slice of life': 'e5301a23-ebd9-49dd-a0cb-2add944c7fe9',
  supernatural: 'eabc5b4c-6aff-42f3-b657-3e90cbd00b75',
  thriller: '07251805-a27e-4d59-b488-f0bfbec15168',
  tragedy: 'f8f62932-27da-44e9-7073-110b7d8ee12f',
  historical: '33771934-028e-4cb3-8744-691e866a923e',
  monsters: '36fd93ea-e8b8-445e-b836-358f02b3d33d',
  magic: 'a1f53773-c69a-4ce8-9bf7-4d3e145f68a4',
};

// Search titles on MangaDex
export async function searchMangaDex(
  query: string,
  genre?: string,
  page = 1,
  limit = 32
): Promise<{ results: MangaDexSearchResult[]; hasNextPage: boolean; currentPage: number }> {
  try {
    const url = new URL(`${MANGADEX_API_BASE}/manga`);
    url.searchParams.set('limit', limit.toString());
    const offset = (page - 1) * limit;
    url.searchParams.set('offset', offset.toString());
    // Include cover art AND author/artist relationships
    url.searchParams.append('includes[]', 'cover_art');
    url.searchParams.append('includes[]', 'author');
    url.searchParams.append('includes[]', 'artist');
    // Allow all content ratings so no manhwa gets hidden
    url.searchParams.append('contentRating[]', 'safe');
    url.searchParams.append('contentRating[]', 'suggestive');
    url.searchParams.append('contentRating[]', 'erotica');

    if (genre && typeof genre === 'string' && genre.toUpperCase() !== 'ALL') {
      const tagId = MANGADEX_GENRE_TAG_MAP[genre.toLowerCase().trim()];
      if (tagId) {
        url.searchParams.append('includedTags[]', tagId);
      }
    }

    if (query.trim()) {
      url.searchParams.set('title', query.trim());
    } else {
      // Default view: sort popular manhwas first
      url.searchParams.set('order[followedCount]', 'desc');
    }

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`MangaDex API error: ${res.statusText}`);

    const json = await res.json();
    const data = json.data || [];

    const results = data.map((manga: any) => {
      const attrs = manga.attributes || {};

      // Title: prefer Spanish > English > romanized Japanese > any available
      const title =
        attrs.title?.es ||
        attrs.title?.en ||
        attrs.title?.ja ||
        attrs.title?.['ja-ro'] ||
        attrs.title?.ko ||
        attrs.title?.['ko-ro'] ||
        Object.values(attrs.title || {})[0] ||
        'Untitled';

      // Description: prefer Spanish > English > any
      const description =
        (attrs.description?.es || attrs.description?.['es-la'] || attrs.description?.en ||
        Object.values(attrs.description || {})[0] ||
        'No description available.') as string;

      // Cover art file
      const coverRel = manga.relationships?.find((r: any) => r.type === 'cover_art');
      const fileName = coverRel?.attributes?.fileName;
      const coverUrl = fileName
        ? `${MANGADEX_UPLOADS_BASE}/covers/${manga.id}/${fileName}.512.jpg`
        : 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80';

      // Author/Artist from relationships
      const authorRel = manga.relationships?.find((r: any) => r.type === 'author');
      const artistRel = manga.relationships?.find((r: any) => r.type === 'artist');
      const author = authorRel?.attributes?.name || 'Unknown';
      const artist = artistRel?.attributes?.name || author;

      const statusMap: Record<string, string> = {
        ongoing: 'ONGOING',
        completed: 'COMPLETED',
        hiatus: 'HIATUS',
        cancelled: 'HIATUS',
      };

      const originalLang = attrs.originalLanguage || 'ko';
      const type =
        originalLang === 'ko' ? 'MANHWA'
        : originalLang === 'ja' ? 'MANGA'
        : 'WEBTOON';

      const tags = (attrs.tags || [])
        .map((t: any) => t.attributes?.name?.en)
        .filter(Boolean)
        .filter((tag: string) => !['Long Strip', 'Web Comic', 'Full Color', 'Adaptation'].includes(tag))
        .slice(0, 4);

      // availableTranslatedLanguages tells us which languages have readable chapters
      const availableLangs: string[] = attrs.availableTranslatedLanguages || [];
      const hasReadableChapters = availableLangs.length > 0;

      return {
        id: manga.id,
        title,
        description,
        coverUrl,
        status: statusMap[attrs.status] || 'ONGOING',
        type,
        releaseYear: attrs.year || new Date().getFullYear(),
        author,
        artist,
        genres: tags.length ? tags : ['Action', 'Fantasy'],
        lastChapter: attrs.lastChapter || undefined,
        availableLangs,
        hasReadableChapters,
      };
    });

    return {
      results,
      hasNextPage: results.length === limit,
      currentPage: page,
    };
  } catch (err) {
    console.error('Failed to search MangaDex:', err);
    return { results: [], hasNextPage: false, currentPage: page };
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

// Import series & top chapters from MangaDex into local PostgreSQL database
export async function importMangaDexSeries(
  mangaDexId: string,
  preferredLang: string[] = ['es', 'es-la', 'en']
) {
  try {
    // 1. Fetch full manga details
    const res = await fetch(
      `${MANGADEX_API_BASE}/manga/${mangaDexId}?includes[]=cover_art&includes[]=author&includes[]=artist`
    );
    if (!res.ok) throw new Error(`MangaDex fetch error: ${res.statusText}`);

    const json = await res.json();
    const manga = json.data;
    const attrs = manga.attributes;

    const title =
      attrs.title?.en ||
      attrs.title?.es ||
      Object.values(attrs.title || {})[0] ||
      'Untitled Series';

    let slug = slugify(title);
    if (!slug) slug = `mangadex-${mangaDexId.slice(0, 8)}`;

    const description =
      attrs.description?.en ||
      attrs.description?.es ||
      Object.values(attrs.description || {})[0] ||
      'No description available.';

    const coverRel = manga.relationships?.find((r: any) => r.type === 'cover_art');
    const fileName = coverRel?.attributes?.fileName;
    const cover = fileName
      ? `${MANGADEX_UPLOADS_BASE}/covers/${manga.id}/${fileName}.512.jpg`
      : 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80';

    const authorRel = manga.relationships?.find((r: any) => r.type === 'author');
    const artistRel = manga.relationships?.find((r: any) => r.type === 'artist');
    const author = authorRel?.attributes?.name || 'MangaDex Author';
    const artist = artistRel?.attributes?.name || author;

    const originalLang = attrs.originalLanguage || 'ko';
    const type: SeriesType =
      originalLang === 'ko' ? SeriesType.MANHWA : originalLang === 'ja' ? SeriesType.MANGA : SeriesType.WEBTOON;

    const statusMap: Record<string, SeriesStatus> = {
      ongoing: SeriesStatus.ONGOING,
      completed: SeriesStatus.COMPLETED,
      hiatus: SeriesStatus.HIATUS,
    };
    const status = statusMap[attrs.status] || SeriesStatus.ONGOING;

    // Check if series already exists by slug or title
    let series = await prisma.series.findFirst({
      where: { OR: [{ slug }, { title }] },
    });

    if (!series) {
      series = await prisma.series.create({
        data: {
          title,
          slug,
          description,
          cover,
          banner: cover,
          status,
          type,
          releaseYear: attrs.year || new Date().getFullYear(),
          author,
          artist,
          sourceUrl: `mangadex:${mangaDexId}`,
        },
      });
    } else if (!series.sourceUrl) {
      // Only backfill sourceUrl if it's empty — don't overwrite another source's ID
      series = await prisma.series.update({
        where: { id: series.id },
        data: { sourceUrl: `mangadex:${mangaDexId}` },
      });
    }



    // Process Genres
    const tagNames = (attrs.tags || [])
      .map((t: any) => t.attributes?.name?.en)
      .filter(Boolean);

    for (const genreName of tagNames) {
      const genreSlug = slugify(genreName);
      if (!genreSlug) continue;

      const genre = await prisma.genre.upsert({
        where: { slug: genreSlug },
        update: {},
        create: { name: genreName, slug: genreSlug },
      });

      await prisma.seriesGenre.upsert({
        where: {
          seriesId_genreId: {
            seriesId: series.id,
            genreId: genre.id,
          },
        },
        update: {},
        create: { seriesId: series.id, genreId: genre.id },
      });
    }

    // 2. Fetch chapter feed for preferred language - loop to get ALL chapters
    // Auto-fallback: if preferred language has no chapters, try English then all languages
    const fallbackOrder: string[][] = [
      preferredLang,
      preferredLang.includes('en') ? [] : ['en'],
      [], // empty = no lang filter (all languages)
    ].filter((l, i) => i === 0 || l.join() !== preferredLang.join());

    let offset = 0;
    let totalChapters = 0;
    let hasMore = true;
    const chaptersToCreate: Array<{ mangadexId: string; number: number; title: string }> = [];
    let usedLangs = preferredLang;

    // Try each language set until we find real (non-external) chapters
    for (const langs of fallbackOrder) {
      const langQ = langs.map((l) => `translatedLanguage[]=${l}`).join('&');
      // Get a sample of first few chapters to check if they are readable
      const checkRes = await fetch(`${MANGADEX_API_BASE}/manga/${mangaDexId}/feed?limit=5&offset=0&${langQ}`);
      if (!checkRes.ok) continue;
      const checkJson = await checkRes.json();
      const sampleChaps = (checkJson.data || []) as any[];
      // A language is valid only if at least one chapter has pages and is not external
      const hasRealChapters = sampleChaps.some(
        (ch: any) => ch.attributes?.externalUrl === null && (ch.attributes?.pages || 0) > 0
      );
      if (hasRealChapters) {
        usedLangs = langs;
        totalChapters = checkJson.total || 0;
        console.log(`[Import] Using language(s): ${JSON.stringify(langs)} (total chapters: ${totalChapters})`);
        break;
      }
    }

    const langParams = usedLangs.map((l) => `translatedLanguage[]=${l}`).join('&');
    offset = 0;
    hasMore = totalChapters > 0;

    while (hasMore) {
      const feedRes = await fetch(
        `${MANGADEX_API_BASE}/manga/${mangaDexId}/feed?limit=500&offset=${offset}&order[chapter]=asc&${langParams}`
      );
      if (!feedRes.ok) break;

      const feedJson = await feedRes.json();
      const chaptersData = feedJson.data || [];
      totalChapters = feedJson.total || 0;

      for (const chap of chaptersData) {
        const chapAttrs = chap.attributes;
        
        // Skip external chapters (e.g. webnovel links) or chapters with no pages
        if (chapAttrs.externalUrl !== null || chapAttrs.pages === 0) {
          continue;
        }

        const chapNum = parseFloat(chapAttrs.chapter || '1');
        const chapTitle = chapAttrs.title ? `Chapter ${chapNum}: ${chapAttrs.title}` : `Chapter ${chapNum}`;

        chaptersToCreate.push({
          mangadexId: chap.id,
          number: chapNum,
          title: chapTitle,
        });
      }

      offset += chaptersData.length;
      if (chaptersData.length === 0 || offset >= totalChapters) {
        hasMore = false;
      }
    }

    // Deduplicate chapters by chapter number
    const uniqueChapters = new Map<number, { mangadexId: string; title: string }>();
    for (const c of chaptersToCreate) {
      if (!uniqueChapters.has(c.number)) {
        uniqueChapters.set(c.number, { mangadexId: c.mangadexId, title: c.title });
      }
    }

    // Create all chapters in DB (very fast since we don't fetch page image lists yet)
    for (const [chapNum, chapInfo] of uniqueChapters.entries()) {
      let chapterRecord = await prisma.chapter.findFirst({
        where: { seriesId: series.id, number: chapNum },
      });

      if (!chapterRecord) {
        await prisma.chapter.create({
          data: {
            seriesId: series.id,
            number: chapNum,
            title: chapInfo.title,
            mangadexId: chapInfo.mangadexId,
          },
        });
      }
    }

    // Invalidate Redis cache for series catalog
    await redis.del('api:series:all');

    return { ...series, chapterCount: uniqueChapters.size, importedLang: usedLangs };
  } catch (err) {
    console.error('Error importing MangaDex series:', err);
    throw err;
  }
}
