import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faMagnifyingGlass,
  faXmark,
  faBookOpen,
  faFire,
  faArrowRight,
} from '@fortawesome/free-solid-svg-icons';
import { Series } from './Catalog';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  seriesList: Series[];
  onSelectSeries: (slug: string) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  seriesList,
  onSelectSeries,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Filter series based on query
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // If empty query, show top 6 recent/popular manhwas as suggestions
      return seriesList.slice(0, 6);
    }
    return seriesList.filter((s) => {
      const titleMatch = s.title.toLowerCase().includes(q);
      const authorMatch = (s.author || '').toLowerCase().includes(q);
      const artistMatch = (s.artist || '').toLowerCase().includes(q);
      const descMatch = (s.description || '').toLowerCase().includes(q);
      return titleMatch || authorMatch || artistMatch || descMatch;
    });
  }, [seriesList, query]);

  // Keep selected index within bounds
  useEffect(() => {
    setSelectedIndex(0);
  }, [results.length]);

  // Handle keyboard navigation (Arrow Up, Arrow Down, Enter, Escape)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < results.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : Math.max(0, results.length - 1)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results.length > 0 && results[selectedIndex]) {
        handleSelect(results[selectedIndex].slug);
      }
    }
  };

  const handleSelect = (slug: string) => {
    onClose();
    onSelectSeries(slug);
  };

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-16 sm:pt-24 px-3 sm:px-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/75 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -16 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative w-full max-w-2xl bg-[#0F1015]/95 border border-white/15 rounded-2xl sm:rounded-3xl shadow-2xl backdrop-blur-2xl overflow-hidden z-10 flex flex-col max-h-[80vh]"
          >
            {/* Search Input Bar */}
            <div className="relative flex items-center border-b border-white/10 px-4 sm:px-5 py-3.5 sm:py-4">
              <FontAwesomeIcon
                icon={faMagnifyingGlass}
                className="text-rose-500 text-lg mr-3 sm:mr-4 shrink-0"
              />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search manhwa, manga, author..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full bg-transparent text-white placeholder-gray-400 text-base sm:text-lg outline-none font-medium"
              />
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="text-gray-400 hover:text-white p-1 rounded-lg text-sm transition-colors"
                  >
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-gray-400 bg-white/5 border border-white/10 px-2 py-1 rounded-md hover:text-white transition-colors"
                >
                  ESC
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="sm:hidden text-gray-400 hover:text-white p-1"
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>
            </div>

            {/* Sub-header / Status */}
            <div className="px-4 sm:px-5 py-2 bg-white/[0.02] border-b border-white/5 flex items-center justify-between text-xs text-gray-400">
              {query.trim() ? (
                <span>
                  Found <strong className="text-white">{results.length}</strong> results for &ldquo;
                  <span className="text-rose-400">{query}</span>&rdquo;
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-gray-300">
                  <FontAwesomeIcon icon={faFire} className="text-rose-500 text-xs" />
                  Popular & Recent Manhwas
                </span>
              )}
              <span className="hidden sm:inline text-[11px] text-gray-500">
                Use ↑ ↓ to navigate, Enter to select
              </span>
            </div>

            {/* Results List */}
            <div
              ref={listRef}
              className="overflow-y-auto p-2 sm:p-3 space-y-1.5 max-h-[55vh] custom-scrollbar"
            >
              {results.length === 0 ? (
                <div className="py-12 px-4 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-3 text-gray-400">
                    <FontAwesomeIcon icon={faMagnifyingGlass} className="text-lg" />
                  </div>
                  <h3 className="text-white font-bold text-sm sm:text-base mb-1">No manhwa found</h3>
                  <p className="text-gray-400 text-xs max-w-sm mx-auto">
                    We couldn&apos;t find any series matching &ldquo;{query}&rdquo;. Try another title or check your spelling.
                  </p>
                </div>
              ) : (
                results.map((series, idx) => {
                  const isSelected = idx === selectedIndex;
                  return (
                    <div
                      key={series.id}
                      onClick={() => handleSelect(series.slug)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center gap-3 sm:gap-4 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-rose-500/15 border border-rose-500/30 shadow-lg'
                          : 'hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      {/* Cover Thumbnail */}
                      <div className="w-11 h-15 sm:w-12 sm:h-16 rounded-lg overflow-hidden shrink-0 border border-white/10 shadow-md bg-white/5">
                        <img
                          src={series.cover}
                          alt={series.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>

                      {/* Series Info */}
                      <div className="flex-1 min-w-0">
                        <h4
                          className={`text-sm sm:text-base font-bold truncate transition-colors ${
                            isSelected ? 'text-rose-400' : 'text-white'
                          }`}
                        >
                          {series.title}
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                          <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 text-[11px]">
                            {series.chapterCount} ch
                          </span>
                          <span>•</span>
                          <span className="uppercase text-[10px] font-semibold tracking-wider text-gray-400">
                            {series.status}
                          </span>
                          {series.author && (
                            <>
                              <span className="hidden sm:inline">•</span>
                              <span className="hidden sm:inline truncate max-w-[150px] text-gray-400">
                                {series.author}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Action Button / Arrow */}
                      <div className="shrink-0 flex items-center">
                        <span
                          className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-rose-600 text-white shadow-glow'
                              : 'text-gray-400 bg-white/5'
                          }`}
                        >
                          <span>Read</span>
                          <FontAwesomeIcon icon={faArrowRight} className="text-[10px]" />
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-4 py-2.5 bg-black/40 border-t border-white/5 flex items-center justify-between text-[11px] text-gray-400">
              <span className="flex items-center gap-1">
                <FontAwesomeIcon icon={faBookOpen} className="text-rose-500" />
                Panelium Quick Search
              </span>
              <span>
                Total: <strong className="text-white">{seriesList.length}</strong> series available
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
