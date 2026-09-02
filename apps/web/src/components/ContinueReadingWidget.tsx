import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlay,
  faXmark,
  faBookOpen,
  faChevronRight,
  faClock,
} from '@fortawesome/free-solid-svg-icons';

export interface ReadingProgress {
  seriesSlug: string;
  seriesTitle: string;
  seriesCover: string;
  chapterNumber: number;
  chapterId: string;
  nextChapterNumber?: number | null;
  nextChapterId?: string | null;
  readAt: number; // timestamp ms
}

const STORAGE_KEY = 'reading-progress';

/** Read all progress entries sorted by most recently read */
export function getAllProgress(): ReadingProgress[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const map: Record<string, ReadingProgress> = JSON.parse(raw);
    return Object.values(map).sort((a, b) => b.readAt - a.readAt);
  } catch {
    return [];
  }
}

/** Save or update a progress entry for a given series & sync to server */
export function saveProgress(entry: ReadingProgress) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const map: Record<string, ReadingProgress> = raw ? JSON.parse(raw) : {};
    map[entry.seriesSlug] = entry;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));

    // Cloud sync if user is logged in
    const token = localStorage.getItem('token');
    if (token && entry.chapterId) {
      fetch('/api/user/history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ chapterId: entry.chapterId }),
      }).catch(() => {});
    }
  } catch (e) {
    console.error('Failed to save reading progress:', e);
  }
}

/** Remove a single series entry from progress locally and in cloud */
export function removeProgress(slug: string) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const map: Record<string, ReadingProgress> = JSON.parse(raw);
      delete map[slug];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    }

    const token = localStorage.getItem('token');
    if (token) {
      fetch(`/api/user/history/${encodeURIComponent(slug)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  } catch {
    // ignore
  }
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

interface ContinueReadingWidgetProps {
  onResume: (slug: string, chapterNumber: number, chapterId: string) => void;
  onSelectSeries: (slug: string) => void;
}

export const ContinueReadingWidget: React.FC<ContinueReadingWidgetProps> = ({
  onResume,
  onSelectSeries,
}) => {
  const { token, user } = useAuth();
  const [items, setItems] = useState<ReadingProgress[]>([]);

  const reload = () => setItems(getAllProgress());

  // Sync from server when logged in
  useEffect(() => {
    reload();

    if (token) {
      fetch('/api/user/history', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.history && Array.isArray(data.history)) {
            const raw = localStorage.getItem(STORAGE_KEY);
            const map: Record<string, ReadingProgress> = raw ? JSON.parse(raw) : {};

            // Merge server history with local storage
            data.history.forEach((h: ReadingProgress) => {
              if (!map[h.seriesSlug] || h.readAt > map[h.seriesSlug].readAt) {
                map[h.seriesSlug] = h;
              }
            });

            localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
            setItems(Object.values(map).sort((a, b) => b.readAt - a.readAt));
          }
        })
        .catch(() => {});
    }

    window.addEventListener('storage', reload);
    return () => window.removeEventListener('storage', reload);
  }, [token, user]);

  const handleDismiss = (e: React.MouseEvent, slug: string) => {
    e.stopPropagation();
    removeProgress(slug);
    reload();
  };

  if (items.length === 0) return null;

  const visible = items.slice(0, 8);

  return (
    <div className="mb-10">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center">
            <FontAwesomeIcon icon={faBookOpen} className="text-accent text-sm" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white leading-tight">Continue Reading</h2>
            <p className="text-[11px] text-gray-400 leading-tight">
              {items.length} series in progress
            </p>
          </div>
        </div>
      </div>

      {/* Horizontal Scroll Track */}
      <div className="relative">
        {/* Fade-out right edge */}
        <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-[#0A0B0F] to-transparent pointer-events-none z-10" />

        <div
          className="flex gap-3 overflow-x-auto pb-2"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <AnimatePresence>
            {visible.map((item) => {
              const resumeChapter = item.nextChapterNumber ?? item.chapterNumber;
              const resumeChapterId = item.nextChapterId ?? item.chapterId;
              const hasNewChapter = Boolean(item.nextChapterNumber);

              return (
                <motion.div
                  key={item.seriesSlug}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="relative shrink-0 w-36 sm:w-44 group"
                >
                  <div
                    onClick={() => onSelectSeries(item.seriesSlug)}
                    className="glass rounded-2xl overflow-hidden border border-white/10 cursor-pointer hover:border-accent/40 transition-all shadow-md hover:shadow-xl"
                  >
                    {/* Cover */}
                    <div className="relative aspect-[3/4] overflow-hidden bg-white/5">
                      <img
                        src={item.seriesCover}
                        alt={item.seriesTitle}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

                      {/* Dismiss button — visible on hover */}
                      <button
                        title="Remove from history"
                        onClick={(e) => handleDismiss(e, item.seriesSlug)}
                        className="absolute top-2 right-2 w-6 h-6 rounded-lg bg-black/70 border border-white/10 flex items-center justify-center text-[10px] text-gray-400 hover:text-white hover:bg-rose-500 hover:border-rose-500 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <FontAwesomeIcon icon={faXmark} />
                      </button>

                      {/* NEW badge if next chapter is available */}
                      {hasNewChapter && (
                        <div className="absolute top-2 left-2 bg-accent text-white text-[9px] font-black px-1.5 py-0.5 rounded-md shadow-glow animate-pulse">
                          NEW
                        </div>
                      )}

                      {/* Title & time inside cover */}
                      <div className="absolute bottom-0 left-0 right-0 p-2.5">
                        <p className="text-[10px] font-bold text-white line-clamp-2 leading-tight mb-1">
                          {item.seriesTitle}
                        </p>
                        <div className="flex items-center gap-1 text-[9px] text-gray-400">
                          <FontAwesomeIcon icon={faClock} className="text-[8px]" />
                          <span>{timeAgo(item.readAt)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Resume / Continue button */}
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onResume(item.seriesSlug, resumeChapter, resumeChapterId);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-[11px] font-bold transition-all ${
                        hasNewChapter
                          ? 'bg-accent hover:bg-accent/80 text-white shadow-glow'
                          : 'bg-white/5 hover:bg-white/10 text-gray-200'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <FontAwesomeIcon icon={faPlay} className="text-[9px] shrink-0" />
                        <span className="truncate">
                          {hasNewChapter
                            ? `New Ch. ${resumeChapter}`
                            : `Resume Ch. ${resumeChapter}`}
                        </span>
                      </span>
                      <FontAwesomeIcon icon={faChevronRight} className="text-[9px] opacity-60 shrink-0" />
                    </motion.button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default ContinueReadingWidget;
