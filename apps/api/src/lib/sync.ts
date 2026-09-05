import { prisma } from './prisma';
import { importWeebCentralSeries, searchWeebCentral } from './weebcentral';

// Configuración de cadencia continua y segura
const DELAY_BETWEEN_SERIES_MS = 1500;             // 1.5 segundos entre cada manhwa (0.66 req/seg, seguro contra Cloudflare)
const REST_AFTER_FULL_CYCLE_MS = 3 * 60 * 1000;   // 3 minutos de reposo tras completar la vuelta de todo el catálogo

let isSyncRunning = false;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanTitle(str: string): string {
  return str
    .replace(/[\u2018\u2019']/g, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTokens(str: string): string[] {
  return cleanTitle(str)
    .toLowerCase()
    .split(' ')
    .filter((w) => w.length > 2 && !['the', 'and', 'for', 'with', 'from'].includes(w));
}

function calculateSimilarity(targetTitle: string, candidateTitle: string): number {
  const tokA = new Set(getTokens(targetTitle));
  const tokB = new Set(getTokens(candidateTitle));
  if (tokA.size === 0 || tokB.size === 0) return 0;

  let matches = 0;
  for (const t of tokA) {
    if (tokB.has(t)) matches++;
  }

  // Si el título objetivo tiene más de 1 palabra clave, requerir al menos 2 coincidencias
  if (tokA.size > 1 && matches < 2) return 0;

  const targetCoverage = matches / tokA.size;
  const unionSize = new Set([...tokA, ...tokB]).size;
  const jaccard = matches / unionSize;

  return (targetCoverage + jaccard) / 2;
}

/**
 * Búsqueda inteligente con reintentos difusos para emparejar títulos con WeebCentral
 * aun cuando contengan apóstrofes, caracteres especiales o pequeñas variaciones.
 */
async function smartSearchWeebCentral(targetTitle: string): Promise<string | null> {
  const q1 = cleanTitle(targetTitle);
  const q2 = targetTitle.trim();
  const q3 = q1.replace(/^(the|a|an|my)\s+/i, '');
  const tokens = getTokens(targetTitle);
  const q4 = tokens.slice(0, 3).join(' ');

  // Ventana deslizante de 2 palabras (ej: 'undercover professor', 'white tower', 'disaster class')
  const pairs: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    pairs.push(`${tokens[i]} ${tokens[i + 1]}`);
  }

  // Tokens individuales largos (> 5 letras)
  const singles = tokens.filter((t) => t.length >= 6);

  const queries = [...new Set([q1, q2, q3, q4, ...pairs, ...singles])].filter(
    (q) => q && q.length >= 3
  );

  for (const q of queries) {
    try {
      const searchRes = await searchWeebCentral(q);
      const searchResults = searchRes.results || [];
      if (searchResults.length > 0) {
        // 1. Buscar coincidencia de alta confianza (similitud >= 50%)
        for (const item of searchResults) {
          const sim = calculateSimilarity(targetTitle, item.title);
          if (sim >= 0.5) {
            return item.id;
          }
        }
        // 2. Coincidencia media (similitud >= 40%)
        const first = searchResults[0];
        const firstSim = calculateSimilarity(targetTitle, first.title);
        if (firstSim >= 0.4) {
          return first.id;
        }
      }
    } catch {
      // Intentar con la siguiente consulta
    }
  }
  return null;
}

/**
 * Sincroniza un único manhwa con WeebCentral.
 * Si no tiene el ID guardado, lo busca inteligentemente por título, lo enlaza en la BD y sincroniza.
 */
async function syncSingleSeries(series: { id: string; title: string; sourceUrl: string | null }): Promise<void> {
  let weebId: string | null = null;

  if (series.sourceUrl && series.sourceUrl.startsWith('weebcentral:')) {
    weebId = series.sourceUrl.replace('weebcentral:', '').trim();
  }

  // Si aún no tiene el ID de WeebCentral, buscarlo inteligentemente
  if (!weebId) {
    try {
      console.log(`[Background Sync] Buscando en WeebCentral "${series.title}"...`);
      const matchedId = await smartSearchWeebCentral(series.title);
      if (matchedId) {
        weebId = matchedId;
        // Guardar el ID en la BD para todas las futuras sincronizaciones
        await prisma.series.update({
          where: { id: series.id },
          data: { sourceUrl: `weebcentral:${weebId}` },
        });
        console.log(`[Background Sync] Enlazado "${series.title}" con WeebCentral ID: ${weebId}`);
      } else {
        console.warn(`[Background Sync] No se encontró coincidencia en WeebCentral para "${series.title}".`);
        return;
      }
    } catch (err) {
      console.error(`[Background Sync] Error de búsqueda para "${series.title}":`, err);
      return;
    }
  }

  // Sincronizar capítulos con WeebCentral vinculando a la serie de la BD
  try {
    const result = await importWeebCentralSeries(weebId, series.id);
    const addedText = (result as any).newChaptersCount > 0 
      ? ` 🚀 (+${(result as any).newChaptersCount} capítulos NUEVOS)`
      : '';
    console.log(`[Background Sync] Sincronizado "${series.title}". Total: ${result.chapterCount} caps${addedText}`);
  } catch (err) {
    console.error(`[Background Sync] Falló sincronización de "${series.title}" (ID: ${weebId}):`, err);
  }
}

/**
 * Ejecuta un ciclo continuo de sincronización:
 * Recorre todas las series con cadencia suave y constante (1 cada 1.5s),
 * priorizando series ONGOING, y luego toma una breve pausa de 3 minutos antes del siguiente ciclo.
 */
async function runContinuousCycle(): Promise<void> {
  if (isSyncRunning) {
    return;
  }

  isSyncRunning = true;

  try {
    // Obtener todas las series ordenadas: ONGOING primero, luego por orden de creación
    const allSeries = await prisma.series.findMany({
      orderBy: [
        { status: 'asc' },      // ONGOING antes que COMPLETED
        { createdAt: 'asc' },
      ],
      select: { id: true, title: true, sourceUrl: true, status: true },
    });

    const total = allSeries.length;
    if (total === 0) {
      isSyncRunning = false;
      setTimeout(runContinuousCycle, REST_AFTER_FULL_CYCLE_MS);
      return;
    }

    console.log(`[Background Sync] 🔄 Iniciando ciclo continuo de actualización para ${total} manhwas (cadencia: 1 cada ${DELAY_BETWEEN_SERIES_MS / 1000}s)...`);

    for (let i = 0; i < total; i++) {
      const s = allSeries[i];
      console.log(`[Background Sync] [${i + 1}/${total}] [${s.status}] Sincronizando "${s.title}"...`);
      await syncSingleSeries(s);
      await sleep(DELAY_BETWEEN_SERIES_MS);
    }

    const restMins = Math.round(REST_AFTER_FULL_CYCLE_MS / 60000);
    console.log(`[Background Sync] 🏁 ¡Ciclo completado! Se revisaron las ${total} series.`);
    console.log(`[Background Sync] ☕ Pausa de ${restMins} minutos antes de reiniciar el siguiente ciclo...`);
  } catch (error) {
    console.error('[Background Sync] Error durante el ciclo de sincronización:', error);
  } finally {
    isSyncRunning = false;
    setTimeout(() => {
      runContinuousCycle().catch((err) => console.error('[Background Sync] Error en ciclo programado:', err));
    }, REST_AFTER_FULL_CYCLE_MS);
  }
}

/**
 * Sincronización manual bajo demanda de todas las series (para panel de administración)
 */
export async function syncAllSeries(): Promise<void> {
  console.log('[Background Sync] Sincronización manual total iniciada...');
  const allSeries = await prisma.series.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, title: true, sourceUrl: true },
  });

  console.log(`[Background Sync] Sincronizando ${allSeries.length} series...`);
  for (let i = 0; i < allSeries.length; i++) {
    const s = allSeries[i];
    console.log(`[Background Sync] [${i + 1}/${allSeries.length}] Sincronizando "${s.title}"...`);
    await syncSingleSeries(s);
    await sleep(DELAY_BETWEEN_SERIES_MS);
  }
  console.log('[Background Sync] Sincronización manual total finalizada.');
}

/**
 * Audita una serie específica comparando sus capítulos locales con la fuente remota.
 */
export async function auditSingleSeries(seriesId: string): Promise<{
  seriesId: string;
  title: string;
  slug: string;
  cover: string;
  sourceUrl: string | null;
  localChapterCount: number;
  latestLocalChapter: number;
  remoteChapterCount: number;
  latestRemoteChapter: number;
  isOutdated: boolean;
  missingChaptersCount: number;
  error?: string;
}> {
  const series = await prisma.series.findUnique({
    where: { id: seriesId },
    include: {
      chapters: {
        select: { id: true, number: true },
        orderBy: { number: 'desc' },
      },
    },
  });

  if (!series) {
    throw new Error('Series not found');
  }

  const localChapterCount = series.chapters.length;
  const latestLocalChapter = series.chapters.length > 0 ? series.chapters[0].number : 0;

  let weebId: string | null = null;
  if (series.sourceUrl && series.sourceUrl.startsWith('weebcentral:')) {
    weebId = series.sourceUrl.replace('weebcentral:', '').trim();
  }

  if (!weebId) {
    weebId = await smartSearchWeebCentral(series.title);
    if (weebId) {
      await prisma.series.update({
        where: { id: series.id },
        data: { sourceUrl: `weebcentral:${weebId}` },
      });
    }
  }

  if (!weebId) {
    return {
      seriesId: series.id,
      title: series.title,
      slug: series.slug,
      cover: series.cover,
      sourceUrl: null,
      localChapterCount,
      latestLocalChapter,
      remoteChapterCount: localChapterCount,
      latestRemoteChapter: latestLocalChapter,
      isOutdated: false,
      missingChaptersCount: 0,
      error: 'Unlinked (No match found on provider)',
    };
  }

  try {
    const { MANGA } = await import('@consumet/extensions');
    const weeb = new MANGA.WeebCentral();
    const details = await weeb.fetchMangaInfo(weebId);

    const remoteChapters = details?.chapters || [];
    const remoteChapterCount = remoteChapters.length;

    // Calcular el número más alto disponible en la fuente remota
    let latestRemoteChapter = latestLocalChapter;
    if (remoteChapters.length > 0) {
      for (const ch of remoteChapters) {
        const titleMatch = (ch.title || '').match(/(?:chapter|ch\.?)\s*(\d+(\.\d+)?)/i);
        const num = titleMatch ? parseFloat(titleMatch[1]) : (typeof ch.number === 'number' ? ch.number : 0);
        if (num > latestRemoteChapter) {
          latestRemoteChapter = num;
        }
      }
    }

    const missingChaptersCount = Math.max(0, remoteChapterCount - localChapterCount);
    const isOutdated = missingChaptersCount > 0 || latestRemoteChapter > latestLocalChapter;

    return {
      seriesId: series.id,
      title: series.title,
      slug: series.slug,
      cover: series.cover,
      sourceUrl: `weebcentral:${weebId}`,
      localChapterCount,
      latestLocalChapter,
      remoteChapterCount,
      latestRemoteChapter,
      isOutdated,
      missingChaptersCount,
    };
  } catch (err: any) {
    return {
      seriesId: series.id,
      title: series.title,
      slug: series.slug,
      cover: series.cover,
      sourceUrl: `weebcentral:${weebId}`,
      localChapterCount,
      latestLocalChapter,
      remoteChapterCount: localChapterCount,
      latestRemoteChapter: latestLocalChapter,
      isOutdated: false,
      missingChaptersCount: 0,
      error: err.message || 'Provider fetch failed',
    };
  }
}

/**
 * Audita todas las series del catálogo secuencialmente
 */
export async function auditAllSeries(): Promise<{
  totalSeries: number;
  totalUpToDate: number;
  totalOutdated: number;
  totalUnlinked: number;
  results: Array<Awaited<ReturnType<typeof auditSingleSeries>>>;
}> {
  const allSeries = await prisma.series.findMany({
    select: { id: true },
    orderBy: { title: 'asc' },
  });

  const results: Array<Awaited<ReturnType<typeof auditSingleSeries>>> = [];
  let totalUpToDate = 0;
  let totalOutdated = 0;
  let totalUnlinked = 0;

  for (const s of allSeries) {
    try {
      const res = await auditSingleSeries(s.id);
      results.push(res);
      if (res.error && res.error.includes('Unlinked')) {
        totalUnlinked++;
      } else if (res.isOutdated) {
        totalOutdated++;
      } else {
        totalUpToDate++;
      }
      await sleep(400); // 400ms entre peticiones de auditoría
    } catch {
      // ignore
    }
  }

  return {
    totalSeries: allSeries.length,
    totalUpToDate,
    totalOutdated,
    totalUnlinked,
    results,
  };
}

/**
 * Sincroniza forzosamente una serie específica
 */
export async function forceSyncSeries(seriesId: string): Promise<{
  success: boolean;
  seriesTitle: string;
  newChaptersCount: number;
  totalChapters: number;
}> {
  const series = await prisma.series.findUnique({
    where: { id: seriesId },
    select: { id: true, title: true, sourceUrl: true },
  });

  if (!series) {
    throw new Error('Series not found');
  }

  let weebId: string | null = null;
  if (series.sourceUrl && series.sourceUrl.startsWith('weebcentral:')) {
    weebId = series.sourceUrl.replace('weebcentral:', '').trim();
  }

  if (!weebId) {
    weebId = await smartSearchWeebCentral(series.title);
    if (weebId) {
      await prisma.series.update({
        where: { id: series.id },
        data: { sourceUrl: `weebcentral:${weebId}` },
      });
    }
  }

  if (!weebId) {
    throw new Error(`Could not link "${series.title}" with WeebCentral provider.`);
  }

  const result = await importWeebCentralSeries(weebId, series.id);
  return {
    success: true,
    seriesTitle: series.title,
    newChaptersCount: (result as any).newChaptersCount || 0,
    totalChapters: result.chapterCount || 0,
  };
}

/**
 * Inicializa el worker en segundo plano con inicio diferido.
 */
export function startBackgroundSync(): void {
  const restMins = Math.round(REST_AFTER_FULL_CYCLE_MS / 60000);
  console.log(`[Background Sync] ⚡ Sistema de sincronización continua iniciado (1 manhwa c/${DELAY_BETWEEN_SERIES_MS / 1000}s -> reposo de ${restMins} min por ciclo).`);

  // Iniciar el primer ciclo 5 segundos tras encender el servidor
  setTimeout(() => {
    runContinuousCycle().catch((err) => console.error('[Background Sync] Error en inicio del worker:', err));
  }, 5000);
}

