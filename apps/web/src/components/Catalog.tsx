import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';

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
}

function timeAgo(dateStr?: string): string {
  if (!dateStr) return 'Reciente';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `Hace ${diff}s`;
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`;
  return `Hace ${Math.floor(diff / 86400)}d`;
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
  latestChapters = [],
  onSelectChapter,
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

  const toggleFavoriteCard = (e: React.MouseEvent, series: Series) => {
    e.stopPropagation();
    try {
      let updated: string[];
      if (favorites.includes(series.id) || favorites.includes(series.slug)) {
        updated = favorites.filter((id) => id !== series.id && id !== series.slug);
      } else {
        updated = [...favorites, series.id];
      }
      setFavorites(updated);
      localStorage.setItem('favorite-series', JSON.stringify(updated));

      // Sync with database if logged in
      if (token) {
        fetch(`/api/user/favorites/${series.id}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }).catch((err) => console.error('Error syncing favorite to DB:', err));
      }
    } catch (err) {
      console.error('Error toggling favorite:', err);
    }
  };


  // Memoize pre-parsed timestamps for instant 0ms sorting
  const seriesWithTime = useMemo(() => {
    return seriesList.map((s) => ({
      ...s,
      _time: s.updatedAt ? new Date(s.updatedAt).getTime() : 0,
    }));
  }, [seriesList]);

  // Collect all unique genres across series (memoized)
  const allGenres = useMemo(() => {
    return Array.from(
      new Set(seriesList.flatMap((s) => s.genres || []))
    ).sort();
  }, [seriesList]);

  // Featured series list (Top 10)
  const featuredSeries = useMemo(() => {
    return seriesList.slice(0,10);
  }, [seriesList]);

  // Auto-advance featured carousel
  React.useEffect(() => {
    if (featuredSeries.length <= 1) return;
    const timer = setInterval(() => {
      setFeaturedIndex((prev) => (prev + 1) % featuredSeries.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [featuredSeries.length]);

  // Lightning fast memoized filter & sort
  const filteredSeries = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return seriesWithTime
      .filter((item) => {
        const matchesSearch =
          !q ||
          item.title.toLowerCase().includes(q) ||
          item.author.toLowerCase().includes(q) ||
          item.genres.some((g) => g.toLowerCase().includes(q));

        const matchesStatus = selectedStatus === 'ALL' || item.status === selectedStatus;
        const matchesGenre = selectedGenre === 'ALL' || item.genres.includes(selectedGenre);
        const matchesFavorites =
          !onlyFavorites || favorites.includes(item.id) || favorites.includes(item.slug);

        return matchesSearch && matchesStatus && matchesGenre && matchesFavorites;
      })
      .sort((a, b) => {
        if (sortBy === 'update') {
          return b._time - a._time;
        }
        if (sortBy === 'chapters') {
          return b.chapterCount - a.chapterCount;
        }
        if (sortBy === 'title') {
          return a.title.localeCompare(b.title);
        }
        if (sortBy === 'year') {
          return b.releaseYear - a.releaseYear;
        }
        return 0;
      });
  }, [seriesWithTime, searchQuery, selectedStatus, selectedGenre, onlyFavorites, favorites, sortBy]);

  const activeFeatured = featuredSeries[featuredIndex] || null;

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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 md:py-10">
      
      {/* Featured Manhwas Carousel Section (Matching Reference Screenshot Design) */}
      {activeFeatured && (
        <div className="mb-10 glass rounded-3xl relative overflow-hidden shadow-[0_15px_50px_rgba(0,0,0,0.6)] border border-white/10 p-6 sm:p-10 transition-all">
          <div className="absolute inset-0 bg-gradient-to-r from-rose-950/40 via-purple-950/30 to-black/90 pointer-events-none" />
          
          <img
            src={activeFeatured.banner || activeFeatured.cover}
            alt={activeFeatured.title}
            className="absolute inset-0 w-full h-full object-cover opacity-20 blur-md mix-blend-overlay scale-110 pointer-events-none"
          />

          <div className="relative z-10 flex flex-col md:flex-row items-center sm:items-start gap-8">
            
            {/* Cover Image Container */}
            <div
              className="w-48 sm:w-56 md:w-64 shrink-0 aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl border border-white/15 group cursor-pointer relative mx-auto md:mx-0"
              onClick={() => onSelectSeries(activeFeatured.slug)}
            >
              <img
                src={activeFeatured.cover}
                alt={activeFeatured.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
            </div>

            {/* Details & Info */}
            <div className="flex-1 text-center md:text-left">
              
              {/* Badges Row */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-3">
                <span className="bg-gradient-to-r from-rose-500 to-red-600 text-white font-black text-xs uppercase px-3.5 py-1.5 rounded-full shadow-md flex items-center gap-1">
                  ✨ DESTACADO DEL DÍA
                </span>
                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold text-xs px-3 py-1.5 rounded-full flex items-center gap-1">
                  ★ {getRating(activeFeatured.title)}
                </span>
                <span className="bg-white/10 text-white font-semibold text-xs px-3 py-1.5 rounded-full border border-white/10">
                  {activeFeatured.type}
                </span>
              </div>

              {/* Title */}
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-3 tracking-tight text-white leading-tight drop-shadow-md">
                {activeFeatured.title}
              </h2>

              {/* Description */}
              <p className="text-gray-300 text-sm sm:text-base leading-relaxed mb-6 line-clamp-2 max-w-3xl font-medium">
                {activeFeatured.description}
              </p>

              {/* Action Button & Carousel Controls */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => onSelectSeries(activeFeatured.slug)}
                  className="bg-gradient-to-r from-rose-500 via-red-500 to-rose-600 hover:from-rose-600 hover:to-red-700 text-white font-bold px-7 py-3 rounded-2xl shadow-lg transition-all flex items-center gap-2 text-sm sm:text-base"
                >
                  <span>🚀 Leer Serie Ahora</span>
                </motion.button>

                {/* Carousel Controls */}
                {featuredSeries.length > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setFeaturedIndex((prev) => (prev - 1 + featuredSeries.length) % featuredSeries.length)}
                      className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white flex items-center justify-center font-bold text-sm transition-all"
                      aria-label="Anterior"
                    >
                      ←
                    </button>
                    <span className="text-xs text-gray-400 font-bold px-2">
                      {featuredIndex + 1} / {featuredSeries.length}
                    </span>
                    <button
                      onClick={() => setFeaturedIndex((prev) => (prev + 1) % featuredSeries.length)}
                      className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white flex items-center justify-center font-bold text-sm transition-all"
                      aria-label="Siguiente"
                    >
                      →
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Latest Chapters Bar ("Últimas Actualizaciones") */}
      {latestChapters.length > 0 && (
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse inline-block"></span>
              ⚡ Últimas Actualizaciones de Capítulos
            </h3>
            <span className="text-xs text-gray-400 bg-white/5 px-3 py-1 rounded-full border border-white/10 hidden sm:inline-block">
              Sincronizado en tiempo real
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
            {latestChapters.map((chap, idx) => (
              <motion.div
                key={chap.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.03 }}
                whileHover={{ y: -5 }}
                onClick={() => onSelectChapter && onSelectChapter(chap.id)}
                className="cursor-pointer glass glass-hover rounded-2xl overflow-hidden shadow-md group border border-white/5"
              >
                <div className="relative aspect-[3/4] overflow-hidden bg-white/5">
                  <img
                    src={chap.series.cover}
                    alt={chap.series.title}
                    className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                  
                  <div className="absolute bottom-2 left-2 bg-accent text-white text-[11px] font-black px-2 py-0.5 rounded-md shadow-glow">
                    Cap. {chap.number}
                  </div>
                </div>

                <div className="p-2.5">
                  <p className="text-white font-bold text-xs line-clamp-1 group-hover:text-accent transition-colors">
                    {chap.series.title}
                  </p>
                  <p className="text-gray-400 text-[10px] mt-0.5 font-medium flex items-center gap-1">
                    <span>🕒</span> {timeAgo(chap.createdAt)}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Main Catalog Header & Filter Bar */}
      <div className="glass p-5 sm:p-6 rounded-3xl border border-white/10 shadow-xl mb-8 space-y-5">
        
        {/* Top Controls: Search Bar & Sort Order */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          
          {/* Search Input */}
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="🔍 Buscar manhwa, manga, autor o género..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 focus:border-accent rounded-2xl px-4 py-3 text-sm text-white placeholder-gray-400 outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-white"
              >
                ✕ Limpiar
              </button>
            )}
          </div>

          {/* Sort By Dropdown Selector */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider hidden sm:inline">Ordenar:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-white/10 border border-white/15 hover:border-accent text-xs sm:text-sm font-bold text-white px-4 py-3 rounded-2xl outline-none cursor-pointer transition-all"
            >
              <option value="update" className="bg-gray-900 text-white">🕒 Fecha de actualización de caps</option>
              <option value="chapters" className="bg-gray-900 text-white">🔥 Más Capítulos</option>
              <option value="title" className="bg-gray-900 text-white">🔤 Nombre (A - Z)</option>
              <option value="year" className="bg-gray-900 text-white">📅 Año de Lanzamiento</option>
            </select>
          </div>
        </div>

        {/* Filter Pills Bar (Status, Favorites) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/10">

          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-black/30 p-1.5 rounded-2xl border border-white/10">
            {[
              { id: 'ALL', label: 'Todos los Estados' },
              { id: 'ONGOING', label: 'En Emisión' },
              { id: 'COMPLETED', label: 'Completados' },
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

          {/* Favorites Filter Toggle Button */}
          <button
            onClick={() => setOnlyFavorites(!onlyFavorites)}
            className={`px-4 py-2 rounded-2xl text-xs font-bold border transition-all flex items-center gap-2 ${
              onlyFavorites
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10'
            }`}
          >
            <span>{onlyFavorites ? '★ Solo Mis Favoritos (' + favorites.length + ')' : '☆ Ver Favoritos'}</span>
          </button>
        </div>

        {/* Quick Genre Chip Selector */}
        {allGenres.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-white/5">
            <span className="text-[11px] text-gray-400 font-medium mr-1">Géneros:</span>
            <button
              onClick={() => setSelectedGenre('ALL')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                selectedGenre === 'ALL'
                  ? 'bg-white/20 text-white border border-white/20'
                  : 'bg-white/5 text-gray-400 hover:text-white'
              }`}
            >
              Todos
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

      {/* Catalog Title & Counter */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5">
          <span>Explorar Cómics</span>
          <span className="text-xs bg-accent/20 text-accent border border-accent/30 font-bold px-3 py-1 rounded-full">
            {filteredSeries.length} Encontrados
          </span>
        </h3>

        {sortBy === 'update' && (
          <span className="text-xs text-accent font-semibold bg-accent/10 px-3 py-1 rounded-full border border-accent/20">
            Ord: Última actualización de caps 🕒
          </span>
        )}
      </div>

      {/* Series Grid */}
      {filteredSeries.length === 0 ? (
        <div className="glass p-12 rounded-3xl text-center text-gray-400 border border-white/10">
          <p className="text-lg font-semibold mb-2">No se encontraron series con los filtros seleccionados.</p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedStatus('ALL');
              setSelectedGenre('ALL');
              setOnlyFavorites(false);
            }}
            className="mt-4 bg-accent text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-glow"
          >
            Restablecer Filtros
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredSeries.map((item) => {
            const isFav = favorites.includes(item.id) || favorites.includes(item.slug);
            return (
              <motion.div
                key={item.id}
                whileHover={{ y: -6 }}
                transition={{ duration: 0.15 }}
                onClick={() => onSelectSeries(item.slug)}
                className="group cursor-pointer glass glass-hover rounded-3xl overflow-hidden shadow-xl flex flex-col relative border border-white/10"
              >
                  {/* Cover Image Container */}
                  <div className="relative aspect-[3/4] overflow-hidden bg-white/5">
                    <img
                      src={item.cover}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0A0B0F] via-transparent to-transparent opacity-85" />

                    {/* Rating Badge */}
                    <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md text-amber-400 text-[11px] font-black px-2.5 py-1 rounded-xl border border-amber-400/30 flex items-center gap-1 shadow-md">
                      <span>★</span> {getRating(item.title)}
                    </div>

                    {/* Bookmark Heart / Star Button directly on card */}
                    <button
                      onClick={(e) => toggleFavoriteCard(e, item)}
                      className={`absolute top-3 right-3 w-9 h-9 rounded-xl backdrop-blur-md flex items-center justify-center transition-all ${
                        isFav
                          ? 'bg-amber-500 text-black font-bold shadow-lg scale-105'
                          : 'bg-black/60 hover:bg-black/90 text-white/80 border border-white/10'
                      }`}
                      title={isFav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                    >
                      {isFav ? '★' : '☆'}
                    </button>

                    {/* Status & Type Badges */}
                    <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
                      <span className="bg-black/70 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg border border-white/10">
                        {item.type}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg border ${
                          item.status === 'ONGOING'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    {/* Chapter Count Pill */}
                    <div className="absolute bottom-3 right-3 bg-accent text-white font-bold text-xs px-2.5 py-1 rounded-xl shadow-glow">
                      {item.chapterCount} {item.chapterCount === 1 ? 'Cap' : 'Caps'}
                    </div>
                  </div>

                  {/* Info Section */}
                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="text-lg font-black text-white group-hover:text-accent-light transition-colors line-clamp-1 mb-1.5">
                        {item.title}
                      </h4>

                      {item.updatedAt && (
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" />
                          <span className="text-[11px] text-accent font-semibold">
                            Último cap. {timeAgo(item.updatedAt)}
                          </span>
                        </div>
                      )}

                      <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed mb-3">
                        {item.description}
                      </p>
                    </div>

                    {/* Genre Tags */}
                    <div className="flex flex-wrap gap-1 pt-2 border-t border-white/5">
                      {item.genres.slice(0, 3).map((g) => (
                        <span
                          key={g}
                          className="text-[10px] font-medium bg-white/5 text-gray-300 px-2 py-0.5 rounded-md border border-white/5"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              );
            })}
        </div>
      )}
    </div>
  );
};

export default Catalog;
