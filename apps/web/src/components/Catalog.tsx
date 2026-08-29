import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCompass, faArrowRight } from '@fortawesome/free-solid-svg-icons';

export interface Series {
  id: string;
  title: string;
  slug: string;
  description: string;
  cover: string;
  banner?: string;
  status: 'ONGOING' | 'COMPLETED' | 'HIATUS';
  type: 'MANHWA' | 'MANGA' | 'WEBTOON';
  releaseYear: number;
  author: string;
  artist: string;
  genres: string[];
  chapterCount: number;
  updatedAt?: string;
  latestChapters?: Array<{
    id: string;
    number: number;
    title?: string;
    createdAt: string;
  }>;
}


interface LatestChapter {
  id: string;
  number: number;
  title?: string;
  createdAt: string;
  series: {
    title: string;
    slug: string;
    cover: string;
  };
}

interface CatalogProps {
  seriesList: Series[];
  loading: boolean;
  onSelectSeries: (slug: string) => void;
  latestChapters?: LatestChapter[];
  onSelectChapter?: (chapterId: string) => void;
  viewMode?: 'home' | 'library';
  onGoLibrary?: () => void;
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

// Generate consistent pseudo-rating between 9.0 and 9.9

function getRating(title: string) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  const val = 9.0 + (Math.abs(hash) % 10) / 10;
  return val.toFixed(1);
}

export const Catalog: React.FC<CatalogProps> = ({
  seriesList,
  loading,
  onSelectSeries,
  onSelectChapter,
  viewMode = 'home',
  onGoLibrary,
}) => {
  const { token, user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedGenre, setSelectedGenre] = useState<string>('ALL');
  const [onlyFavorites, setOnlyFavorites] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'update' | 'chapters' | 'title' | 'year'>('update');
  const [featuredIndex, setFeaturedIndex] = useState<number>(0);

  // Favorites stored in state & synced
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('favorite-series');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Sync favorites from database when logged in
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

  // Toggle favorite on card
  const toggleFavoriteCard = async (e: React.MouseEvent, item: Series) => {
    e.stopPropagation();
    const isFav = favorites.includes(item.id) || favorites.includes(item.slug);
    const newFavs = isFav
      ? favorites.filter((id) => id !== item.id && id !== item.slug)
      : [...favorites, item.id];

    setFavorites(newFavs);
    try {
      localStorage.setItem('favorite-series', JSON.stringify(newFavs));
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
        console.error('Failed to sync favorite with server:', err);
      }
    }
  };

  // Compute all unique genres from series list
  const allGenres = useMemo(() => {
    const genreSet = new Set<string>();
    seriesList.forEach((s) => {
      s.genres.forEach((g) => genreSet.add(g));
    });
    return Array.from(genreSet).sort();
  }, [seriesList]);

  // Top featured series
  const featuredSeries = useMemo(() => {
    return seriesList.slice(0, 5);
  }, [seriesList]);

  const activeFeatured = featuredSeries[featuredIndex] || featuredSeries[0];

  // Filter and sort catalog
  const filteredSeries = useMemo(() => {
    let list = [...seriesList];

    // Status filter
    if (selectedStatus !== 'ALL') {
      list = list.filter((s) => s.status === selectedStatus);
    }

    // Genre filter
    if (selectedGenre !== 'ALL') {
      list = list.filter((s) => s.genres.includes(selectedGenre));
    }

    // Favorites filter
    if (onlyFavorites) {
      list = list.filter((s) => favorites.includes(s.id) || favorites.includes(s.slug));
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.author.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q) ||
          s.genres.some((g) => g.toLowerCase().includes(q))
      );
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'chapters') return b.chapterCount - a.chapterCount;
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'year') return b.releaseYear - a.releaseYear;
      // Default: latest update
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return timeB - timeA;
    });

    return list;
  }, [seriesList, selectedStatus, selectedGenre, onlyFavorites, searchQuery, sortBy, favorites]);

  // On Home: show ONLY the 20 most recently updated manhwas. On Library: show all.
  const displayedSeries = useMemo(() => {
    if (viewMode === 'home') {
      return filteredSeries.slice(0, 20);
    }
    return filteredSeries;
  }, [filteredSeries, viewMode]);


  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-12 glass p-8 rounded-3xl relative overflow-hidden animate-pulse h-64 bg-white/5" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="glass rounded-2xl overflow-hidden aspect-[3/4] flex flex-col animate-pulse bg-white/5">
              <div className="flex-1 bg-white/10" />
              <div className="p-5 h-32 flex flex-col justify-end gap-3">
                <div className="h-4 bg-white/20 rounded w-3/4" />
                <div className="h-3 bg-white/10 rounded w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 md:py-8">
      
      {/* Featured Manhwas Carousel Section — Home only */}
      {viewMode === 'home' && activeFeatured && (
        <div className="mb-8 glass rounded-2xl sm:rounded-3xl relative overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.5)] border border-white/10 transition-all">
          <div className="absolute inset-0 bg-gradient-to-r from-rose-950/50 via-purple-950/30 to-black/90 pointer-events-none" />
          <img
            src={activeFeatured.banner || activeFeatured.cover}
            alt={activeFeatured.title}
            className="absolute inset-0 w-full h-full object-cover opacity-15 blur-md scale-110 pointer-events-none"
          />

          <div className="relative z-10 flex items-center gap-4 p-4 sm:p-8">
            <div
              className="w-20 h-28 sm:w-44 sm:h-60 md:w-52 shrink-0 rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl border border-white/15 cursor-pointer"
              onClick={() => onSelectSeries(activeFeatured.slug)}
            >
              <img
                src={activeFeatured.cover}
                alt={activeFeatured.title}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex-1 min-w-0">
              <span className="inline-flex items-center gap-1 bg-gradient-to-r from-rose-500 to-red-600 text-white font-black text-[10px] sm:text-xs uppercase px-2.5 py-1 rounded-full shadow-md mb-2">
                ✨ Featured Today
              </span>

              <h2 className="text-base sm:text-3xl md:text-4xl font-black text-white leading-tight line-clamp-2 mb-3 sm:mb-4">
                {activeFeatured.title}
              </h2>

              <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onSelectSeries(activeFeatured.slug)}
                  className="bg-gradient-to-r from-rose-500 to-rose-600 text-white font-bold px-4 sm:px-7 py-2 sm:py-3 rounded-xl sm:rounded-2xl shadow-lg text-xs sm:text-base flex items-center gap-1.5"
                >
                  🚀 Read Now
                </motion.button>

                {featuredSeries.length > 1 && (
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <button
                      onClick={() => setFeaturedIndex((prev) => (prev - 1 + featuredSeries.length) % featuredSeries.length)}
                      className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-white/10 border border-white/10 text-white flex items-center justify-center text-sm transition-all"
                      aria-label="Previous"
                    >←</button>
                    <span className="text-xs text-gray-400 font-bold px-1">
                      {featuredIndex + 1}/{featuredSeries.length}
                    </span>
                    <button
                      onClick={() => setFeaturedIndex((prev) => (prev + 1) % featuredSeries.length)}
                      className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-white/10 border border-white/10 text-white flex items-center justify-center text-sm transition-all"
                      aria-label="Next"
                    >→</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Browse Page Header — Library mode only */}
      {viewMode === 'library' && (
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-black text-white mb-2 flex items-center gap-3">
            <span className="w-12 h-12 rounded-2xl bg-accent/20 border border-accent/30 flex items-center justify-center">
              <FontAwesomeIcon icon={faCompass} className="text-accent text-xl" />
            </span>
            <span>Browse Comics</span>
          </h1>
          <p className="text-gray-400 text-sm">
            Browse all <span className="text-accent font-bold">{seriesList.length}</span> series in the collection
          </p>
        </div>
      )}

      {/* Main Catalog Header & Filter Bar — Browse only */}
      {viewMode === 'library' && (
      <div className="glass p-5 sm:p-6 rounded-3xl border border-white/10 shadow-xl mb-8 space-y-5">
        
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="🔍 Search manhwa, manga or genre..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 focus:border-accent rounded-2xl px-4 py-3 text-sm text-white placeholder-gray-400 outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-white"
              >
                ✕ Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider hidden sm:inline">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-white/10 border border-white/15 hover:border-accent text-xs sm:text-sm font-bold text-white px-4 py-3 rounded-2xl outline-none cursor-pointer transition-all"
            >
              <option value="update" className="bg-gray-900 text-white">🕒 Latest Updates</option>
              <option value="chapters" className="bg-gray-900 text-white">🔥 Most Chapters</option>
              <option value="title" className="bg-gray-900 text-white">🔤 Title (A - Z)</option>
              <option value="year" className="bg-gray-900 text-white">📅 Release Year</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/10">

          <div className="flex flex-wrap items-center gap-1.5 bg-black/30 p-1.5 rounded-2xl border border-white/10">
            {[
              { id: 'ALL', label: 'All Status' },
              { id: 'ONGOING', label: 'Ongoing' },
              { id: 'COMPLETED', label: 'Completed' },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setSelectedStatus(st.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  selectedStatus === st.id
                    ? 'bg-accent text-white shadow-glow'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setOnlyFavorites(!onlyFavorites)}
            className={`px-4 py-2 rounded-2xl text-xs font-bold border transition-all flex items-center gap-2 ${
              onlyFavorites
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10'
            }`}
          >
            <span>{onlyFavorites ? '★ Favorites Only (' + favorites.length + ')' : '☆ View Favorites'}</span>
          </button>
        </div>

        {allGenres.length > 0 && (
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

            {allGenres.map((g) => (
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
      )}

      {viewMode === 'library' ? (
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base sm:text-2xl font-black text-white flex items-center gap-2">
            <span>All Comics</span>
            <span className="text-xs bg-accent/20 text-accent border border-accent/30 font-bold px-2 py-0.5 rounded-full">
              {displayedSeries.length}
            </span>
          </h3>
        </div>
      ) : (
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base sm:text-2xl font-black text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse inline-block" />
            <span>Recently Updated</span>
          </h3>
        </div>
      )}

      {filteredSeries.length === 0 ? (
        <div className="glass p-12 rounded-3xl text-center text-gray-400 border border-white/10">
          <p className="text-lg font-semibold mb-2">No series found matching selected filters.</p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedStatus('ALL');
              setSelectedGenre('ALL');
              setOnlyFavorites(false);
            }}
            className="mt-4 bg-accent text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-glow"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
          {displayedSeries.map((item) => {
            const isFav = favorites.includes(item.id) || favorites.includes(item.slug);
            return (
              <motion.div
                key={item.id}
                whileHover={{ y: -4 }}
                transition={{ duration: 0.15 }}
                onClick={() => onSelectSeries(item.slug)}
                className="group cursor-pointer glass rounded-2xl sm:rounded-3xl overflow-hidden shadow-md sm:shadow-xl flex flex-col relative border border-white/10"
              >
                  {/* Cover Image Container */}
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

                    {/* Bookmark Button */}
                    <button
                      onClick={(e) => toggleFavoriteCard(e, item)}
                      className={`absolute top-2 right-2 w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl backdrop-blur-md flex items-center justify-center text-sm ${
                        isFav
                          ? 'bg-amber-500 text-black font-bold shadow-lg'
                          : 'bg-black/60 text-white/80 border border-white/10'
                      }`}
                    >
                      {isFav ? '★' : '☆'}
                    </button>

                    {/* Chapter Count */}
                    <div className="absolute bottom-2 right-2 bg-accent text-white font-bold text-[10px] px-1.5 py-0.5 rounded-lg shadow-glow">
                      {item.chapterCount} chs
                    </div>
                  </div>

                  {/* Info Section — compact on mobile */}
                  <div className="p-2.5 sm:p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs sm:text-base font-black text-white line-clamp-1 mb-2 group-hover:text-accent transition-colors">
                        {item.title}
                      </h4>

                      {/* Latest Chapters + Relative Time */}
                      <div className="space-y-1 my-1">
                        {item.latestChapters && item.latestChapters.length > 0 ? (
                          item.latestChapters.slice(0, 2).map((chap) => (
                            <div
                              key={chap.id}
                              onClick={(e) => {
                                if (onSelectChapter) {
                                  e.stopPropagation();
                                  onSelectChapter(chap.id);
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
                    {/* Genre Tags — hidden on very small screens */}
                    <div className="hidden sm:flex flex-wrap gap-1 pt-2 border-t border-white/5">
                      {item.genres.slice(0, 2).map((g) => (
                        <span key={g} className="text-[10px] font-medium bg-white/5 text-gray-300 px-1.5 py-0.5 rounded-md border border-white/5">{g}</span>
                      ))}
                    </div>
                  </div>


                </motion.div>
              );
            })}
        </div>
      )}

      {/* View Full Library CTA — Home mode only */}
      {viewMode === 'home' && seriesList.length > 20 && (
        <div className="mt-10 relative overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-r from-rose-900/40 via-purple-900/30 to-indigo-900/40 pointer-events-none" />
          <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-6 px-8 py-8">
            <div>
              <h3 className="text-xl sm:text-2xl font-black text-white mb-1">
                Explore the Full Collection
              </h3>
              <p className="text-gray-400 text-sm">
                You're seeing 20 of{' '}
                <span className="text-accent font-bold">{seriesList.length}</span> series. Discover everything in the library.
              </p>
            </div>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={onGoLibrary}
              className="shrink-0 bg-gradient-to-r from-rose-500 to-purple-600 text-white font-black px-8 py-3.5 rounded-2xl shadow-[0_0_30px_rgba(239,68,68,0.3)] text-sm flex items-center gap-2.5 whitespace-nowrap"
            >
              <FontAwesomeIcon icon={faCompass} />
              Browse All Comics ({seriesList.length}) <FontAwesomeIcon icon={faArrowRight} />
            </motion.button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Catalog;
