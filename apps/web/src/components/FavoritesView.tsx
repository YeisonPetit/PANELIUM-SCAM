import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Series } from './Catalog';
import { useAuth } from '../context/AuthContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faStar,
  faTrashCan,
  faCompass,
  faArrowRight,
  faMagnifyingGlass,
  faLock,
  faUser,
} from '@fortawesome/free-solid-svg-icons';

interface FavoritesViewProps {
  seriesList: Series[];
  loading: boolean;
  onSelectSeries: (slug: string) => void;
  onSelectChapter?: (slug: string, chapterNumber: number, chapterId: string) => void;
  onGoExplore: () => void;
  onOpenAuth?: () => void;
}

function timeAgo(dateStr?: string): string {
  if (!dateStr) return 'Recent';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function getRating(title: string) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  const val = 9.0 + (Math.abs(hash) % 10) / 10;
  return val.toFixed(1);
}

export const FavoritesView: React.FC<FavoritesViewProps> = ({
  seriesList,
  loading,
  onSelectSeries,
  onSelectChapter,
  onGoExplore,
  onOpenAuth,
}) => {
  const { token, user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedGenre, setSelectedGenre] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'update' | 'chapters' | 'title'>('update');

  // Favorites state
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('favorite-series');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Sync favorites from DB when logged in
  useEffect(() => {
    if (!token) return;
    fetch('/api/user/favorites', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.favorites && Array.isArray(data.favorites)) {
          const dbFavIds = data.favorites.map((f: any) => f.id);
          setFavorites((prev) => Array.from(new Set([...prev, ...dbFavIds])));
        }
      })
      .catch((err) => console.error('Failed to load server favorites:', err));
  }, [token, user]);

  const removeFavorite = async (e: React.MouseEvent, item: Series) => {
    e.stopPropagation();
    const updated = favorites.filter((id) => id !== item.id && id !== item.slug);
    setFavorites(updated);
    try {
      localStorage.setItem('favorite-series', JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to persist favorites:', err);
    }

    if (token) {
      try {
        await fetch(`/api/user/favorites/${item.id}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        console.error('Failed to sync favorite remove with server:', err);
      }
    }
  };

  // Filter series list to only favorite items
  const favoriteSeriesList = useMemo(() => {
    return seriesList.filter(
      (s) => favorites.includes(s.id) || favorites.includes(s.slug)
    );
  }, [seriesList, favorites]);

  // Compute genres available within favorites
  const availableGenres = useMemo(() => {
    const genreSet = new Set<string>();
    favoriteSeriesList.forEach((s) => {
      s.genres.forEach((g) => genreSet.add(g));
    });
    return Array.from(genreSet).sort();
  }, [favoriteSeriesList]);

  // Filter and sort favorites
  const displayedFavorites = useMemo(() => {
    let list = [...favoriteSeriesList];

    // Status filter
    if (selectedStatus !== 'ALL') {
      list = list.filter((s) => s.status === selectedStatus);
    }

    // Genre filter
    if (selectedGenre !== 'ALL') {
      list = list.filter((s) => s.genres.includes(selectedGenre));
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.author.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q)
      );
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'chapters') return b.chapterCount - a.chapterCount;
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      // Default: latest update
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return timeB - timeA;
    });

    return list;
  }, [favoriteSeriesList, selectedStatus, selectedGenre, searchQuery, sortBy]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="h-44 glass p-8 rounded-3xl animate-pulse bg-white/5 mb-8" />
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="glass rounded-2xl aspect-[3/4] animate-pulse bg-white/5"
            />
          ))}
        </div>
      </div>
    );
  }

  // Locked State for Unauthenticated (Guest) Users
  if (!user) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 md:py-16">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="glass rounded-3xl p-8 sm:p-14 border border-white/15 text-center max-w-xl mx-auto shadow-2xl bg-[#0F1015]/90 backdrop-blur-2xl"
        >
          <div className="w-20 h-20 rounded-3xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-3xl mx-auto mb-6 text-amber-400 shadow-[0_0_40px_rgba(245,158,11,0.25)]">
            <FontAwesomeIcon icon={faLock} />
          </div>

          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-black uppercase px-3 py-1 rounded-full inline-flex items-center gap-1.5 shadow-sm mb-3">
            <FontAwesomeIcon icon={faStar} className="text-amber-400" />
            <span>Members Only Feature</span>
          </span>

          <h1 className="text-2xl sm:text-3xl font-black text-white mb-3 tracking-tight">
            Sign In to View Favorites
          </h1>

          <p className="text-gray-400 text-sm sm:text-base leading-relaxed mb-8 max-w-md mx-auto">
            Create a free account or sign in to bookmark your favorite comics, track new chapter updates, and sync your reading across all your devices.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {onOpenAuth && (
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={onOpenAuth}
                className="w-full sm:w-auto bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white font-bold px-7 py-3.5 rounded-2xl shadow-glow text-sm flex items-center justify-center gap-2 transition-all"
              >
                <FontAwesomeIcon icon={faUser} />
                <span>Sign In / Register</span>
              </motion.button>
            )}

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={onGoExplore}
              className="w-full sm:w-auto bg-white/10 hover:bg-white/15 text-white font-bold px-6 py-3.5 rounded-2xl border border-white/15 text-sm flex items-center justify-center gap-2 transition-all"
            >
              <FontAwesomeIcon icon={faCompass} />
              <span>Explore Catalog</span>
            </motion.button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 md:py-8">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl glass border border-white/10 p-6 sm:p-8 mb-8 shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-950/40 via-purple-950/30 to-black/80 pointer-events-none" />
        
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-black uppercase px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                <FontAwesomeIcon icon={faStar} className="text-amber-400" />
                <span>PERSONAL LIBRARY</span>
              </span>
              <span className="bg-white/10 text-white text-xs font-bold px-2.5 py-1 rounded-full border border-white/10">
                {favoriteSeriesList.length} saved
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              My Favorites
            </h1>
            <p className="text-gray-400 text-sm mt-1 max-w-xl">
              All your bookmarked manga, manhwa & webtoons in one place for quick reading access.
            </p>
          </div>

          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={onGoExplore}
            className="bg-white/10 hover:bg-white/20 text-white font-bold px-5 py-2.5 rounded-2xl border border-white/15 transition-all text-xs sm:text-sm flex items-center gap-2 shrink-0"
          >
            <FontAwesomeIcon icon={faCompass} />
            <span>Explore Catalog</span>
          </motion.button>
        </div>
      </div>

      {/* Empty State when no favorites */}
      {favoriteSeriesList.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-3xl p-10 sm:p-16 border border-white/10 text-center max-w-2xl mx-auto my-12 shadow-2xl"
        >
          <div className="w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-4xl mx-auto mb-5 text-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.2)]">
            <FontAwesomeIcon icon={faStar} />
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white mb-3">
            No favorites saved yet
          </h2>
          <p className="text-gray-400 text-sm sm:text-base leading-relaxed mb-8 max-w-md mx-auto">
            Click the star icon <span className="text-amber-400 font-bold">★</span> on any comic card or detail page to save it here and keep track of your reads.
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onGoExplore}
            className="bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white font-black px-8 py-3.5 rounded-2xl shadow-glow text-sm inline-flex items-center gap-2"
          >
            <span>Discover Comics</span>
            <FontAwesomeIcon icon={faArrowRight} />
          </motion.button>
        </motion.div>
      ) : (
        <>
          {/* Filter Bar */}
          <div className="glass p-5 rounded-3xl border border-white/10 shadow-xl mb-8 space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <FontAwesomeIcon icon={faMagnifyingGlass} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                <input
                  type="text"
                  placeholder="Search in your favorites..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 focus:border-accent rounded-2xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-gray-400 outline-none transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-white"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1 bg-black/30 p-1 rounded-2xl border border-white/10">
                {[
                  { id: 'ALL', label: 'All Status' },
                  { id: 'ONGOING', label: 'Ongoing' },
                  { id: 'COMPLETED', label: 'Completed' },
                ].map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setSelectedStatus(st.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      selectedStatus === st.id
                        ? 'bg-accent text-white shadow-glow'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              {/* Sort dropdown */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-white/10 border border-white/15 text-xs font-bold text-white px-3 py-2.5 rounded-2xl outline-none cursor-pointer"
              >
                <option value="update" className="bg-gray-900 text-white">🕒 Latest Updates</option>
                <option value="chapters" className="bg-gray-900 text-white">🔥 Most Chapters</option>
                <option value="title" className="bg-gray-900 text-white">🔤 Title (A-Z)</option>
              </select>
            </div>

            {/* Genre Pills */}
            {availableGenres.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-white/5">
                <span className="text-[11px] text-gray-400 font-medium mr-1">Genres:</span>
                <button
                  onClick={() => setSelectedGenre('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                    selectedGenre === 'ALL'
                      ? 'bg-white/20 text-white border border-white/20'
                      : 'bg-white/5 text-gray-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                {availableGenres.map((g) => (
                  <button
                    key={g}
                    onClick={() => setSelectedGenre(selectedGenre === g ? 'ALL' : g)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                      selectedGenre === g
                        ? 'bg-accent text-white font-bold shadow-sm'
                        : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white border border-white/5'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Favorites Grid */}
          {displayedFavorites.length === 0 ? (
            <div className="glass p-10 rounded-3xl text-center text-gray-400 border border-white/10">
              <p className="text-base font-semibold mb-2">
                No favorites match the selected filters.
              </p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedStatus('ALL');
                  setSelectedGenre('ALL');
                }}
                className="mt-3 bg-accent text-white text-xs font-bold px-4 py-2 rounded-xl shadow-glow"
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
              <AnimatePresence>
                {displayedFavorites.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    whileHover={{ y: -4 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => onSelectSeries(item.slug)}
                    className="group cursor-pointer glass rounded-2xl sm:rounded-3xl overflow-hidden shadow-md sm:shadow-xl flex flex-col relative border border-white/10"
                  >
                    {/* Cover Container */}
                    <div className="relative aspect-[3/4] overflow-hidden bg-white/5">
                      <img
                        src={item.cover}
                        alt={item.title}
                        className="w-full h-full object-cover sm:group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0A0B0F] via-transparent to-transparent opacity-85" />

                      {/* Rating Badge */}
                      <div className="absolute top-2 left-2 bg-black/80 text-amber-400 text-[10px] font-black px-1.5 py-0.5 rounded-lg border border-amber-400/30 flex items-center gap-0.5">
                        <span>★</span> {getRating(item.title)}
                      </div>

                      {/* Remove Favorite Button */}
                      <button
                        title="Remove from favorites"
                        onClick={(e) => removeFavorite(e, item)}
                        className="absolute top-2 right-2 w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl backdrop-blur-md flex items-center justify-center text-xs text-rose-400 bg-black/70 hover:bg-rose-500 hover:text-white border border-white/10 transition-all shadow-lg"
                      >
                        <FontAwesomeIcon icon={faTrashCan} />
                      </button>

                      {/* Chapter Count */}
                      <div className="absolute bottom-2 right-2 bg-accent text-white font-bold text-[10px] px-1.5 py-0.5 rounded-lg shadow-glow">
                        {item.chapterCount} chs
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-2.5 sm:p-4 flex-1 flex flex-col justify-between">
                      <div>
                        <h4 className="text-xs sm:text-base font-black text-white line-clamp-1 mb-2 group-hover:text-accent transition-colors">
                          {item.title}
                        </h4>

                        {/* Direct Chapter Links */}
                        <div className="space-y-1 my-1">
                          {item.latestChapters && item.latestChapters.length > 0 ? (
                            item.latestChapters.slice(0, 2).map((chap) => (
                              <div
                                key={chap.id}
                                onClick={(e) => {
                                  if (onSelectChapter) {
                                    e.stopPropagation();
                                    onSelectChapter(item.slug, chap.number, chap.id);
                                  }
                                }}
                                className="flex items-center justify-between gap-1.5 py-1 px-2 rounded-lg bg-white/[0.04] hover:bg-accent/20 border border-white/5 hover:border-accent/40 text-[11px] transition-all cursor-pointer group/chap"
                              >
                                <span className="font-bold text-gray-200 group-hover/chap:text-white flex items-center gap-1.5 truncate">
                                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" />
                                  Ch. {chap.number}
                                </span>
                                <span className="text-[10px] text-gray-400 group-hover/chap:text-accent font-medium shrink-0">
                                  {timeAgo(chap.createdAt)}
                                </span>
                              </div>
                            ))
                          ) : (
                            <div className="flex items-center justify-between gap-1.5 py-1 px-2 rounded-lg bg-white/[0.04] border border-white/5 text-[11px]">
                              <span className="font-bold text-white flex items-center gap-1.5 truncate">
                                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" />
                                Ch. {item.chapterCount}
                              </span>
                              {item.updatedAt && (
                                <span className="text-[10px] text-gray-400 font-medium shrink-0">
                                  {timeAgo(item.updatedAt)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Genre Tags */}
                      <div className="hidden sm:flex flex-wrap gap-1 pt-2 border-t border-white/5">
                        {item.genres.slice(0, 2).map((g) => (
                          <span
                            key={g}
                            className="text-[10px] font-medium bg-white/5 text-gray-300 px-1.5 py-0.5 rounded-md border border-white/5"
                          >
                            {g}
                          </span>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FavoritesView;
