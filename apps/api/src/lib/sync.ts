import { PrismaClient } from '@prisma/client';
import { importWeebCentralSeries } from './weebcentral';

const prisma = new PrismaClient();

// In minutes
const SYNC_INTERVAL = 30;

export async function syncAllSeries() {
  console.log('[Background Sync] Starting update check for all series...');
  try {
    // Find series that have a WeebCentral sourceUrl tag
    const weebSeries = await prisma.series.findMany({
      where: {
        sourceUrl: {
          startsWith: 'weebcentral:'
        }
      }
    });

    // Also find series that DON'T have a sourceUrl yet but have chapters with sourceUrl (the WeebCentral chapter ID)
    // We can infer the series ID from the chapter's sourceUrl by querying WeebCentral
    const noSourceSeries = await prisma.series.findMany({
      where: { sourceUrl: null },
      include: {
        chapters: {
          where: { sourceUrl: { not: null } },
          take: 1
        }
      }
    });

    console.log(`[Background Sync] Found ${weebSeries.length} tagged WeebCentral series + ${noSourceSeries.length} untagged series to check.`);

    // Sync tagged series
    for (const series of weebSeries) {
      const weebId = series.sourceUrl!.replace('weebcentral:', '');
      console.log(`[Background Sync] Syncing "${series.title}" (ID: ${weebId})...`);
      try {
        const result = await importWeebCentralSeries(weebId);
        console.log(`[Background Sync] Synced "${series.title}". Chapters: ${result.chapterCount}`);
      } catch (err) {
        console.error(`[Background Sync] Failed to sync "${series.title}":`, err);
      }
    }

    // For untagged series with chapters, try to get the WeebCentral ID from the chapter's sourceUrl
    for (const series of noSourceSeries) {
      if (series.chapters.length === 0) continue;
      const chap = series.chapters[0];
      if (!chap.sourceUrl) continue;

      // The chapter's sourceUrl IS the WeebCentral chapter ID. We can use it to fetch chapter pages,
      // but to sync the series we need the series ID. 
      // Use the existing import by querying WeebCentral search.
      console.log(`[Background Sync] Attempting to identify "${series.title}" via WeebCentral search...`);
      try {
        const { searchWeebCentral } = await import('./weebcentral');
        const results = await searchWeebCentral(series.title);
        if (results.length > 0) {
          const weebId = results[0].id;
          const result = await importWeebCentralSeries(weebId);
          // Store the WeebCentral ID for future syncs
          await prisma.series.update({
            where: { id: series.id },
            data: { sourceUrl: `weebcentral:${weebId}` }
          });
          console.log(`[Background Sync] Identified and tagged "${series.title}" as WeebCentral ID: ${weebId}. Chapters: ${result.chapterCount}`);
        }
      } catch (err) {
        console.error(`[Background Sync] Failed to identify "${series.title}":`, err);
      }
    }

    console.log('[Background Sync] Completed synchronization checks successfully.');
  } catch (error) {
    console.error('[Background Sync] Error during background synchronization loop:', error);
  }
}

export function startBackgroundSync() {
  // Run once immediately on startup
  setTimeout(() => {
    syncAllSeries().catch(err => console.error('[Background Sync] Initial run error:', err));
  }, 10000); // 10 second delay on startup to let DB/Server warm up

  // Schedule periodic checks
  setInterval(() => {
    syncAllSeries().catch(err => console.error('[Background Sync] Scheduler check error:', err));
  }, SYNC_INTERVAL * 60 * 1000);
}
