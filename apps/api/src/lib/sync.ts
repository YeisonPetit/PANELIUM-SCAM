import { PrismaClient } from '@prisma/client';
import { importWeebCentralSeries, searchWeebCentral } from './weebcentral';

const prisma = new PrismaClient();

// Configuración de lotes y reposo inteligente
const BATCH_SIZE = 20;                     // 20 manhwas por lote
const BATCH_INTERVAL_MS = 2 * 60 * 1000;   // 2 minutos entre cada lote durante la sincronización
const REST_AFTER_FULL_CYCLE_MS = 60 * 60 * 1000; // 60 minutos (1 hora) de reposo TOTAL tras revisar el 100%
const DELAY_BETWEEN_SERIES_MS = 400;       // 400ms de pausa entre manhwas para no saturar WeebCentral

let isSyncRunning = false;
let currentCursor = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sincroniza un único manhwa con WeebCentral.
 * Si no tiene el ID guardado, lo busca por título, lo enlaza en la BD y sincroniza.
 */
async function syncSingleSeries(series: { id: string; title: string; sourceUrl: string | null }): Promise<void> {
  let weebId: string | null = null;

  if (series.sourceUrl && series.sourceUrl.startsWith('weebcentral:')) {
    weebId = series.sourceUrl.replace('weebcentral:', '').trim();
  }

  // Si aún no tiene el ID de WeebCentral, buscarlo por título
  if (!weebId) {
    try {
      console.log(`[Background Sync] Buscando en WeebCentral "${series.title}"...`);
      const searchResults = await searchWeebCentral(series.title);
      if (searchResults && searchResults.length > 0) {
        weebId = searchResults[0].id;
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

  // Sincronizar capítulos con WeebCentral
  try {
    const result = await importWeebCentralSeries(weebId);
    const addedText = (result as any).newChaptersCount > 0 
      ? ` (+${(result as any).newChaptersCount} capítulos NUEVOS)`
      : '';
    console.log(`[Background Sync] Sincronizado "${series.title}". Total: ${result.chapterCount} caps${addedText}`);
  } catch (err) {
    console.error(`[Background Sync] Falló sincronización de "${series.title}" (ID: ${weebId}):`, err);
  }
}

/**
 * Ejecuta un lote y programa el siguiente paso (siguiente lote o reposo prolongado).
 */
async function runBatchCycle(): Promise<void> {
  if (isSyncRunning) {
    console.log('[Background Sync] Lote previo aún en ejecución, esperando...');
    return;
  }

  isSyncRunning = true;
  let nextDelay = BATCH_INTERVAL_MS;

  try {
    const totalCount = await prisma.series.count();
    if (totalCount === 0) {
      isSyncRunning = false;
      setTimeout(runBatchCycle, REST_AFTER_FULL_CYCLE_MS);
      return;
    }

    if (currentCursor >= totalCount) {
      currentCursor = 0;
    }

    const batch = await prisma.series.findMany({
      skip: currentCursor,
      take: BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
      select: { id: true, title: true, sourceUrl: true },
    });

    const startIdx = currentCursor + 1;
    const endIdx = currentCursor + batch.length;
    console.log(`[Background Sync] ─── Procesando Lote: ${startIdx}-${endIdx} de ${totalCount} manhwas ───`);

    for (const series of batch) {
      await syncSingleSeries(series);
      await sleep(DELAY_BETWEEN_SERIES_MS);
    }

    currentCursor += batch.length;

    // ¿Llegamos al final del catálogo completo?
    if (currentCursor >= totalCount) {
      const restMinutes = Math.round(REST_AFTER_FULL_CYCLE_MS / 60000);
      console.log(`[Background Sync] 🏁 ¡100% COMPLETADO! Se evaluaron todas las ${totalCount} series.`);
      console.log(`[Background Sync] 💤 Entrando en REPOSO TOTAL durante ${restMinutes} minutos para cuidar recursos del servidor y la API...`);
      currentCursor = 0;
      nextDelay = REST_AFTER_FULL_CYCLE_MS; // Pausa larga (ej. 1 hora)
    } else {
      nextDelay = BATCH_INTERVAL_MS; // Pausa corta de 2 minutos para el siguiente lote
    }
  } catch (error) {
    console.error('[Background Sync] Error durante la ejecución del lote:', error);
    nextDelay = BATCH_INTERVAL_MS;
  } finally {
    isSyncRunning = false;
    // Programar la siguiente ejecución de forma segura y dinámica
    setTimeout(() => {
      runBatchCycle().catch((err) => console.error('[Background Sync] Error en ciclo programado:', err));
    }, nextDelay);
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
 * Inicializa el worker en segundo plano con inicio diferido.
 */
export function startBackgroundSync(): void {
  const restMins = Math.round(REST_AFTER_FULL_CYCLE_MS / 60000);
  console.log(`[Background Sync] Sistema iniciado. Lotes de ${BATCH_SIZE} cada ${BATCH_INTERVAL_MS / 60000} min -> Reposo de ${restMins} min al terminar el 100%.`);

  // Iniciar el primer lote 5 segundos tras encender el servidor
  setTimeout(() => {
    runBatchCycle().catch((err) => console.error('[Background Sync] Error en inicio del worker:', err));
  }, 5000);
}
