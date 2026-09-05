import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faRotate,
  faMagnifyingGlass,
  faCircleCheck,
  faTriangleExclamation,
  faBolt,
  faLayerGroup,
  faCircleNotch,
} from '@fortawesome/free-solid-svg-icons';

export interface CatalogSeriesItem {
  id: string;
  title: string;
  slug: string;
  cover: string;
  status: string;
  type: string;
  sourceUrl: string | null;
  localChapterCount: number;
  latestLocalChapter: number;
  createdAt: string;
}

export interface AuditResult {
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
}

interface SyncAuditorProps {
  onOpenSeries?: (slug: string) => void;
}

export const SyncAuditor: React.FC<SyncAuditorProps> = ({ onOpenSeries }) => {
  const { token } = useAuth();
  const [catalog, setCatalog] = useState<CatalogSeriesItem[]>([]);
  const [auditMap, setAuditMap] = useState<Record<string, AuditResult>>({});
  const [loadingCatalog, setLoadingCatalog] = useState<boolean>(true);
  const [isAuditingAll, setIsAuditingAll] = useState<boolean>(false);
  const [auditingId, setAuditingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [batchSyncProgress, setBatchSyncProgress] = useState<{ current: number; total: number; title: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filter, setFilter] = useState<'all' | 'outdated' | 'uptodate' | 'unlinked'>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchCatalogStatus = useCallback(async () => {
    if (!token) return;
    setLoadingCatalog(true);
    try {
      const res = await fetch('/api/sync/catalog-status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCatalog(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load sync catalog:', err);
    } finally {
      setLoadingCatalog(false);
    }
  }, [token]);

  useEffect(() => {
    fetchCatalogStatus();
  }, [fetchCatalogStatus]);

  // Audit Single Series
  const handleAuditSingle = async (seriesId: string) => {
    if (!token || auditingId || isAuditingAll) return;
    setAuditingId(seriesId);
    try {
      const res = await fetch('/api/sync/audit-single', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ seriesId }),
      });
      if (res.ok) {
        const result: AuditResult = await res.json();
        setAuditMap((prev) => ({ ...prev, [seriesId]: result }));
        if (result.isOutdated) {
          showToast(`⚠️ "${result.title}" has ${result.missingChaptersCount} missing chapters!`);
        } else if (result.error) {
          showToast(`⚠️ ${result.title}: ${result.error}`);
        } else {
          showToast(`✅ "${result.title}" is up to date.`);
        }
      }
    } catch (err) {
      console.error('Audit single failed:', err);
    } finally {
      setAuditingId(null);
    }
  };

  // Audit All Series
  const handleAuditAll = async () => {
    if (!token || isAuditingAll) return;
    setIsAuditingAll(true);
    showToast('🔍 Scanning all series with remote provider...');

    try {
      const res = await fetch('/api/sync/audit-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        const newMap: Record<string, AuditResult> = {};
        for (const item of data.results || []) {
          newMap[item.seriesId] = item;
        }
        setAuditMap(newMap);
        showToast(`Audit finished! Found ${data.totalOutdated} outdated series.`);
      }
    } catch (err) {
      console.error('Audit all failed:', err);
      showToast('❌ Audit failed to complete.');
    } finally {
      setIsAuditingAll(false);
    }
  };

  // Force Sync Single Series
  const handleForceSyncSingle = async (seriesId: string) => {
    if (!token || syncingId) return;
    setSyncingId(seriesId);
    try {
      const res = await fetch('/api/sync/force-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ seriesId }),
      });

      if (res.ok) {
        const data = await res.json();
        showToast(`🚀 Synced "${data.seriesTitle}"! Added +${data.newChaptersCount} new chapters (Total: ${data.totalChapters}).`);
        // Refresh this item's audit state & catalog count
        await handleAuditSingle(seriesId);
        fetchCatalogStatus();
      } else {
        const errJson = await res.json().catch(() => ({}));
        showToast(`❌ Sync error: ${errJson.error || 'Failed'}`);
      }
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setSyncingId(null);
    }
  };

  // Sync All Outdated Series
  const handleSyncAllOutdated = async () => {
    const outdatedList = Object.values(auditMap).filter((a) => a.isOutdated);
    if (!token || outdatedList.length === 0 || batchSyncProgress) return;

    setBatchSyncProgress({ current: 0, total: outdatedList.length, title: '' });

    for (let i = 0; i < outdatedList.length; i++) {
      const item = outdatedList[i];
      setBatchSyncProgress({ current: i + 1, total: outdatedList.length, title: item.title });
      try {
        await fetch('/api/sync/force-sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ seriesId: item.seriesId }),
        });
      } catch (err) {
        console.error(`Batch sync error for ${item.title}:`, err);
      }
    }

    setBatchSyncProgress(null);
    showToast(`✅ Successfully synced all ${outdatedList.length} outdated series!`);
    await fetchCatalogStatus();
    handleAuditAll();
  };

  // Calculate Metrics
  const totalCount = catalog.length;
  const auditedCount = Object.keys(auditMap).length;
  const outdatedCount = Object.values(auditMap).filter((a) => a.isOutdated).length;
  const upToDateCount = Object.values(auditMap).filter((a) => !a.isOutdated && !a.error).length;
  const unlinkedCount = catalog.filter((c) => !c.sourceUrl || auditMap[c.id]?.error?.includes('Unlinked')).length;

  // Filter Catalog
  const filteredCatalog = catalog.filter((item) => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    const audit = auditMap[item.id];
    if (filter === 'outdated') return audit?.isOutdated;
    if (filter === 'uptodate') return audit && !audit.isOutdated && !audit.error;
    if (filter === 'unlinked') return !item.sourceUrl || audit?.error?.includes('Unlinked');
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Toast notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-16 right-4 z-50 bg-[#1E1F2A] border border-rose-500/40 text-white px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-xl text-xs font-bold flex items-center gap-2"
          >
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass rounded-2xl p-4 border border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-lg">
            <FontAwesomeIcon icon={faLayerGroup} />
          </div>
          <div>
            <p className="text-2xl font-black text-white">{totalCount}</p>
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Total in Database</p>
          </div>
        </div>

        <div className="glass rounded-2xl p-4 border border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-lg">
            <FontAwesomeIcon icon={faTriangleExclamation} />
          </div>
          <div>
            <p className="text-2xl font-black text-amber-300">{outdatedCount}</p>
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Outdated Series</p>
          </div>
        </div>

        <div className="glass rounded-2xl p-4 border border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-lg">
            <FontAwesomeIcon icon={faCircleCheck} />
          </div>
          <div>
            <p className="text-2xl font-black text-emerald-300">{upToDateCount}</p>
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Verified Up to Date</p>
          </div>
        </div>

        <div className="glass rounded-2xl p-4 border border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center text-lg">
            <FontAwesomeIcon icon={faRotate} className={isAuditingAll ? 'animate-spin' : ''} />
          </div>
          <div>
            <p className="text-2xl font-black text-purple-300">{auditedCount} / {totalCount}</p>
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Audited Series</p>
          </div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="glass rounded-2xl p-4 border border-white/10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Audit All Button */}
          <button
            onClick={handleAuditAll}
            disabled={isAuditingAll || Boolean(batchSyncProgress)}
            className={`px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 shadow-glow ${
              isAuditingAll
                ? 'bg-purple-600 text-white opacity-80 cursor-wait'
                : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white'
            }`}
          >
            <FontAwesomeIcon icon={isAuditingAll ? faCircleNotch : faMagnifyingGlass} className={isAuditingAll ? 'animate-spin' : ''} />
            {isAuditingAll ? 'Scanning All Provider Chapters...' : 'Scan & Audit All Manhwas'}
          </button>

          {/* Sync All Outdated Button */}
          {outdatedCount > 0 && (
            <button
              onClick={handleSyncAllOutdated}
              disabled={Boolean(batchSyncProgress) || isAuditingAll}
              className={`px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(244,63,94,0.4)] ${
                batchSyncProgress
                  ? 'bg-rose-600 text-white opacity-80 cursor-wait'
                  : 'bg-rose-500 hover:bg-rose-400 text-white'
              }`}
            >
              <FontAwesomeIcon icon={batchSyncProgress ? faCircleNotch : faBolt} className={batchSyncProgress ? 'animate-spin' : ''} />
              {batchSyncProgress
                ? `Syncing [${batchSyncProgress.current}/${batchSyncProgress.total}] ${batchSyncProgress.title}...`
                : `Sync All Outdated (${outdatedCount})`}
            </button>
          )}

          <button
            onClick={fetchCatalogStatus}
            className="px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-bold border border-white/10 transition-all flex items-center gap-1.5"
            title="Refresh database catalog"
          >
            <FontAwesomeIcon icon={faRotate} />
            Refresh List
          </button>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Filter Pills */}
          <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10 text-[11px] font-bold">
            <button
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                filter === 'all' ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              All ({totalCount})
            </button>
            <button
              onClick={() => setFilter('outdated')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                filter === 'outdated' ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40' : 'text-gray-400 hover:text-amber-300'
              }`}
            >
              Outdated ({outdatedCount})
            </button>
            <button
              onClick={() => setFilter('uptodate')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                filter === 'uptodate' ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40' : 'text-gray-400 hover:text-emerald-300'
              }`}
            >
              Up to Date ({upToDateCount})
            </button>
            <button
              onClick={() => setFilter('unlinked')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                filter === 'unlinked' ? 'bg-purple-500/30 text-purple-300 border border-purple-500/40' : 'text-gray-400 hover:text-purple-300'
              }`}
            >
              Unlinked ({unlinkedCount})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 sm:w-48">
            <FontAwesomeIcon icon={faMagnifyingGlass} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search manhwa..."
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-rose-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Batch Sync Progress Bar */}
      {batchSyncProgress && (
        <div className="glass rounded-2xl p-4 border border-rose-500/30 bg-rose-500/5 animate-pulse">
          <div className="flex items-center justify-between text-xs font-bold text-white mb-2">
            <span>Syncing outdated series: {batchSyncProgress.title}</span>
            <span>{batchSyncProgress.current} / {batchSyncProgress.total}</span>
          </div>
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-rose-500 to-purple-600 transition-all duration-300"
              style={{ width: `${(batchSyncProgress.current / batchSyncProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Series Table / Cards Grid */}
      {loadingCatalog ? (
        <div className="py-20 text-center text-gray-400">
          <FontAwesomeIcon icon={faCircleNotch} className="text-3xl animate-spin text-rose-500 mb-3" />
          <p className="text-sm font-bold">Loading series catalog...</p>
        </div>
      ) : filteredCatalog.length === 0 ? (
        <div className="py-20 text-center glass rounded-2xl border border-white/10 p-8">
          <p className="text-base font-bold text-white mb-1">No series match current filter</p>
          <p className="text-xs text-gray-400">Try changing your search or filter options.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredCatalog.map((item) => {
            const audit = auditMap[item.id];
            const isAuditingThis = auditingId === item.id;
            const isSyncingThis = syncingId === item.id;

            return (
              <div
                key={item.id}
                className="glass rounded-2xl p-3 sm:p-4 border border-white/10 hover:border-white/20 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                {/* Left info: Cover + Title + DB Chapter Status */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-16 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                    <img src={item.cover} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3
                        onClick={() => onOpenSeries?.(item.slug)}
                        className="text-sm font-black text-white hover:text-rose-400 transition-colors cursor-pointer truncate max-w-xs sm:max-w-md"
                      >
                        {item.title}
                      </h3>
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-white/10 text-gray-300">
                        {item.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span className="font-semibold text-gray-200">
                        📚 Database: <strong className="text-white">{item.localChapterCount}</strong> chapters (Latest: Ch. {item.latestLocalChapter})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right info: Remote Status & Actions */}
                <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-white/5">
                  {/* Remote Audit Badge */}
                  <div className="text-right">
                    {!audit ? (
                      <span className="text-[11px] text-gray-500 font-semibold italic">
                        Not checked yet
                      </span>
                    ) : audit.error ? (
                      <span className="text-[11px] font-bold text-purple-300 bg-purple-500/20 border border-purple-500/30 px-2.5 py-1 rounded-lg">
                        ⚠️ {audit.error}
                      </span>
                    ) : audit.isOutdated ? (
                      <div className="flex flex-col items-end">
                        <span className="text-[11px] font-black text-rose-300 bg-rose-500/20 border border-rose-500/30 px-2.5 py-1 rounded-lg animate-pulse">
                          🔥 +{audit.missingChaptersCount} New Chapters Available!
                        </span>
                        <span className="text-[10px] text-gray-400 mt-0.5 font-semibold">
                          Remote has Ch. {audit.latestRemoteChapter} ({audit.remoteChapterCount} total)
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1">
                        <FontAwesomeIcon icon={faCircleCheck} className="text-xs" />
                        Up to date ({audit.remoteChapterCount} caps)
                      </span>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1.5">
                    {/* Check / Verify button */}
                    <button
                      onClick={() => handleAuditSingle(item.id)}
                      disabled={isAuditingThis || Boolean(batchSyncProgress)}
                      className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-gray-200 hover:text-white text-xs font-bold transition-all flex items-center gap-1"
                      title="Verify remote chapters count"
                    >
                      <FontAwesomeIcon icon={isAuditingThis ? faCircleNotch : faMagnifyingGlass} className={isAuditingThis ? 'animate-spin' : ''} />
                      {isAuditingThis ? 'Checking...' : 'Check'}
                    </button>

                    {/* Sync Now button */}
                    <button
                      onClick={() => handleForceSyncSingle(item.id)}
                      disabled={isSyncingThis || Boolean(batchSyncProgress)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1 ${
                        audit?.isOutdated
                          ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-glow'
                          : 'bg-white/10 hover:bg-white/20 text-white'
                      }`}
                      title="Force update this series immediately"
                    >
                      <FontAwesomeIcon icon={isSyncingThis ? faCircleNotch : faBolt} className={isSyncingThis ? 'animate-spin' : ''} />
                      {isSyncingThis ? 'Syncing...' : 'Sync Now'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SyncAuditor;
