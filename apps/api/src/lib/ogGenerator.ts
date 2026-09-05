import sharp from 'sharp';
import { prisma } from './prisma';

interface OgCardOptions {
  title: string;
  description: string;
  badgeText?: string;
  ratingText?: string;
  statusText?: string;
  buttonText?: string;
}

/**
 * Fetch remote image buffer with anti-blocking browser headers
 */
async function fetchCoverBuffer(url?: string): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const isWeeb = url.includes('weebcentral') || url.includes('temp.compsci88.com') || url.includes('fmcdn');
    const referer = isWeeb ? 'https://weebcentral.com/' : 'https://mangadex.org/';

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': referer,
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    clearTimeout(timeout);
    if (!res.ok) {
      console.warn(`[OG Image] Failed to fetch cover from ${url}: Status ${res.status}`);
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err: any) {
    console.warn(`[OG Image] Error fetching cover (${url}):`, err.message);
    return null;
  }
}

/**
 * Escape XML special characters
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Wrap text into multiple SVG lines
 */
function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
      if (lines.length >= maxLines - 1) {
        break;
      }
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  if (lines.length >= maxLines && words.length > 0) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/\.{3}$/, '') + '...';
  }

  return lines;
}

/**
 * Generate base SVG for the Yellow Neo-Brutalist Card
 */
export function buildCardSvg(opts: OgCardOptions): string {
  const badge = escapeXml((opts.badgeText || 'TRENDING MANHWA').toUpperCase());
  const rawTitle = opts.title.length > 26 ? opts.title.slice(0, 24) + '...' : opts.title;
  const title = escapeXml(rawTitle);

  const descLines = wrapText(
    opts.description ||
      'Read top trending manhwas, mangas, and webtoons with high-speed continuous scroll reader.',
    40,
    3
  ).map((line) => escapeXml(line));

  const rating = escapeXml(opts.ratingText || '4.97 (185 reviews)');
  const status = escapeXml(opts.statusText || 'FREE / HD READ');
  const button = escapeXml(opts.buttonText || 'Read Now →');

  const FONT_FAMILY = "DejaVu Sans, 'Open Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

  return `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <!-- Yellow Background Frame -->
  <rect width="1200" height="630" fill="#FFC700" />

  <!-- Hard Drop Shadow of main Card -->
  <rect x="80" y="65" width="1040" height="500" rx="30" fill="#000000" />

  <!-- Main White Card -->
  <rect x="68" y="53" width="1040" height="500" rx="30" fill="#FFFFFF" stroke="#000000" stroke-width="5" />

  <!-- Left Content Column -->
  <g transform="translate(110, 95)">
    <!-- Badge Pill -->
    <rect x="0" y="0" width="${Math.max(130, badge.length * 9.5 + 24)}" height="32" rx="8" fill="#000000" />
    <text x="12" y="21" fill="#FFFFFF" font-family="${FONT_FAMILY}" font-weight="900" font-size="12" letter-spacing="1">${badge}</text>

    <!-- Series Title -->
    <text x="0" y="88" fill="#000000" font-family="${FONT_FAMILY}" font-weight="900" font-size="42" letter-spacing="-1">${title}</text>

    <!-- Description Lines -->
    <g transform="translate(0, 128)">
      ${descLines
        .map(
          (line, i) =>
            `<text x="0" y="${i * 24}" fill="#4B5563" font-family="${FONT_FAMILY}" font-weight="500" font-size="16">${line}</text>`
        )
        .join('\n')}
    </g>

    <!-- Divider Line -->
    <line x1="0" y1="216" x2="490" y2="216" stroke="#E5E7EB" stroke-width="3" stroke-linecap="round" />

    <!-- Rating / Social proof -->
    <g transform="translate(0, 252)">
      <text x="0" y="0" font-size="16">⭐</text>
      <text x="26" y="-1" fill="#1F2937" font-family="${FONT_FAMILY}" font-weight="800" font-size="15">${rating}</text>
    </g>

    <!-- Bottom Actions: Status/Price & Black Button -->
    <g transform="translate(0, 312)">
      <text x="0" y="28" fill="#000000" font-family="${FONT_FAMILY}" font-weight="900" font-size="24">${status}</text>
      
      <!-- Black Button -->
      <rect x="300" y="0" width="190" height="48" rx="14" fill="#000000" />
      <text x="395" y="30" fill="#FFFFFF" font-family="${FONT_FAMILY}" font-weight="900" font-size="16" text-anchor="middle">${button}</text>
    </g>
  </g>

  <!-- Right Artwork Placeholder Box (if no cover) -->
  <rect x="660" y="80" width="410" height="470" rx="22" fill="#12131A" stroke="#000000" stroke-width="4" />
  <text x="865" y="325" fill="#f43f5e" font-family="${FONT_FAMILY}" font-weight="900" font-size="26" text-anchor="middle">PANELIUM</text>
</svg>`;
}

/**
 * Composite cover buffer onto the base SVG image with rounded corners
 */
async function createFinalOgImage(baseSvg: string, rawCoverBuffer: Buffer | null): Promise<Buffer> {
  const baseImage = sharp(Buffer.from(baseSvg));

  if (!rawCoverBuffer) {
    return baseImage.png().toBuffer();
  }

  try {
    const COVER_WIDTH = 410;
    const COVER_HEIGHT = 470;
    const RADIUS = 22;

    // Rounded rectangle mask for the artwork
    const roundedMask = Buffer.from(
      `<svg width="${COVER_WIDTH}" height="${COVER_HEIGHT}"><rect width="${COVER_WIDTH}" height="${COVER_HEIGHT}" rx="${RADIUS}" fill="#fff" /></svg>`
    );

    // Resize and crop the cover image to exact dimensions
    const processedCover = await sharp(rawCoverBuffer)
      .resize(COVER_WIDTH, COVER_HEIGHT, { fit: 'cover', position: 'center' })
      .composite([{ input: roundedMask, blend: 'dest-in' }])
      .png()
      .toBuffer();

    // Sharp border overlay for the cover
    const borderOverlay = Buffer.from(
      `<svg width="${COVER_WIDTH}" height="${COVER_HEIGHT}"><rect width="${COVER_WIDTH}" height="${COVER_HEIGHT}" rx="${RADIUS}" fill="none" stroke="#000000" stroke-width="4" /></svg>`
    );

    return baseImage
      .composite([
        { input: processedCover, top: 80, left: 660 },
        { input: borderOverlay, top: 80, left: 660 },
      ])
      .png()
      .toBuffer();
  } catch (err: any) {
    console.warn('[OG Image] Error compositing cover:', err.message);
    return baseImage.png().toBuffer();
  }
}

/**
 * Generate Open Graph PNG Buffer for a given Series
 */
export async function generateSeriesOgImage(slug: string): Promise<Buffer> {
  const series = await prisma.series.findUnique({
    where: { slug },
    include: {
      chapters: {
        select: { id: true, number: true },
        orderBy: { number: 'desc' },
        take: 1,
      },
    },
  });

  if (!series) {
    const fallbackSvg = buildCardSvg({
      title: 'Panelium Scan',
      description: 'Read top trending manhwas, mangas, and webtoons with high-speed continuous scroll reader.',
      badgeText: 'ONLINE READER',
      statusText: 'FREE / NO ADS',
      buttonText: 'Explore Now →',
    });
    return createFinalOgImage(fallbackSvg, null);
  }

  const latestChap = series.chapters[0];
  const coverBuffer = await fetchCoverBuffer(series.cover);

  const svg = buildCardSvg({
    title: series.title,
    description: series.description || `Read ${series.title} manhwa online in high definition for free on Panelium.`,
    badgeText: latestChap ? `CHAPTER ${latestChap.number} OUT` : `${series.type || 'MANHWA'}`,
    ratingText: '4.98 (24.5k reads)',
    statusText: 'FREE / HD READ',
    buttonText: 'Read Free →',
  });

  return createFinalOgImage(svg, coverBuffer);
}

/**
 * Generate Open Graph PNG Buffer for a specific Chapter
 */
export async function generateChapterOgImage(slug: string, chapterNumber: number): Promise<Buffer> {
  const series = await prisma.series.findFirst({
    where: { OR: [{ slug }, { id: slug }] },
  });

  if (!series) {
    return generateSeriesOgImage(slug);
  }

  const coverBuffer = await fetchCoverBuffer(series.cover);

  const svg = buildCardSvg({
    title: series.title,
    description: `Read ${series.title} Chapter ${chapterNumber} online in high quality with continuous webtoon scroll.`,
    badgeText: `NEW RELEASE · CH. ${chapterNumber}`,
    ratingText: `⭐ 4.99 · Chapter ${chapterNumber}`,
    statusText: `READ CH. ${chapterNumber}`,
    buttonText: 'Start Reading →',
  });

  return createFinalOgImage(svg, coverBuffer);
}
