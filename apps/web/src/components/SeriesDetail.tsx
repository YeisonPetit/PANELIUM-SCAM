import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Series } from './Catalog';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faStar,
  faBookmark,
  faBolt,
  faRocket,
  faFire,
  faChevronDown,
  faChevronUp,
  faChevronLeft,
  faChevronRight,
  faArrowUpWideShort,
  faArrowDownWideShort,
  faCheck,
} from '@fortawesome/free-solid-svg-icons';
import { injectSeriesSchema } from '../utils/schema';

function timeAgo(dateStr?: string): string {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  const months = Math.floor(diff / 2592000);
  return `${months} mo${months > 1 ? 's' : ''} ago`;
}

export interface ChapterSummary {
  id: string;
  number: number;
  title?: string;
  createdAt: string;
  pageCount: number;
}

export interface SeriesDetailData {
  id: string;
  title: string;
  slug: string;
  description: string;
  cover: string;
  banner?: string;
  status: string;
  type: string;
  releaseYear: number;
  author: string;
  artist: string;
  genres: string[];
  chapters: ChapterSummary[];
}

interface SeriesDetailProps {
  series: SeriesDetailData | null;
  loading: boolean;
  onBack: () => void;
  onSelectChapter: (chapterId: string, chapterNumber: number) => void;
  readChapters?: string[];
  allSeries?: Series[];
  onSelectSeries?: (slug: string) => void;
}

export const SeriesDetail: React.FC<SeriesDetailProps> = ({
  series,
  loading,
  onBack,
  onSelectChapter,
  readChapters = [],
  allSeries = [],
  onSelectSeries,
}) => {
  const [chapterSearch, setChapterSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [descExpanded, setDescExpanded] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState<boolean>(() => {
    try {
      if (!series) return false;
      const favs = JSON.parse(localStorage.getItem('favorite-series') || '[]');
      return favs.includes(series.id) || favs.includes(series.slug);
    } catch {
      return false;
    }
  });
  const carouselRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!series) return;
    injectSeriesSchema(series);
    try {
      const favs = JSON.parse(localStorage.getItem('favorite-series') || '[]');
      setIsBookmarked(favs.includes(series.id) || favs.includes(series.slug));
    } catch {
      setIsBookmarked(false);
    }
  }, [series]);

  const toggleBookmark = () => {
    if (!series) return;
    try {
      const favs: string[] = JSON.parse(localStorage.getItem('favorite-series') || '[]');
      let updated: string[];
      if (favs.includes(series.id) || favs.includes(series.slug)) {
        updated = favs.filter((id) => id !== series.id && id !== series.slug);
        setIsBookmarked(false);
      } else {
        updated = [...favs, series.id];
        setIsBookmarked(true);
      }
      localStorage.setItem('favorite-series', JSON.stringify(updated));
    } catch (e) {
      console.error('Error saving favorite:', e);
    }
  };

  if (loading || !series) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-20 text-center">
        <div className="inline-block w-14 h-14 border-4 border-accent border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-400 text-lg font-medium">Loading series details...</p>
      </div>
    );
  }

  // Filter and sort chapters
  const filteredChapters = series.chapters
    .filter((chap) => {
      const query = chapterSearch.toLowerCase();
      return (
        chap.number.toString().includes(query) ||
        (chap.title && chap.title.toLowerCase().includes(query))
      );
    })
    .sort((a, b) => (sortOrder === 'asc' ? a.number - b.number : b.number - a.number));

  // Find similar series by matching genres or type
  const similarSeries = allSeries.filter((s) => {
    if (s.id === series.id || s.slug === series.slug) return false;
    const hasMatchingGenre = s.genres.some((g) => series.genres.includes(g));
    const hasMatchingType = s.type === series.type;
    return hasMatchingGenre || hasMatchingType;
  });

  // Fallback if no specific match found: take other series in catalog
  const recommendedList = similarSeries.length > 0
    ? similarSeries
    : allSeries.filter((s) => s.id !== series.id);

  // Helper for scrolling carousel
  const scrollCarousel = (direction: 'left' | 'right') => {
    if (carouselRef.current) {
      const scrollAmount = direction === 'left' ? -380 : 380;
      carouselRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // Generate consistent pseudo-rating between 9.0 and 9.9
  const getRating = (title: string) => {
    let hash = 0;
    for (let i = 0; i < title.length; i++) {
      hash = title.charCodeAt(i) + ((hash << 5) - hash);
    }
    const val = 9.0 + (Math.abs(hash) % 10) / 10;
    return val.toFixed(1);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 md:py-8">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="mb-6 flex items-center gap-2 text-sm text-gray-300 hover:text-white transition-all bg-white/5 hover:bg-accent/20 px-4 py-2.5 rounded-2xl border border-white/10 hover:border-accent/40 shadow-sm"
      >
        <FontAwesomeIcon icon={faArrowLeft} className="text-accent" />
        <span>Back to Catalog</span>
      </button>

      {/* Hero Banner Section */}
      <div className="glass rounded-3xl overflow-hidden relative mb-10 shadow-[0_15px_50px_rgba(0,0,0,0.6)] border border-white/10 p-6 sm:p-10">
        {/* Background artwork with blur and subtle gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-rose-950/40 via-purple-950/30 to-black/90 pointer-events-none" />
        <img
          src={series.banner || series.cover}
          alt={series.title}
          className="absolute inset-0 w-full h-full object-cover opacity-20 blur-md mix-blend-overlay scale-110 pointer-events-none"
        />

        {/* Hero Card Content */}
        <div className="relative z-10 flex flex-col md:flex-row items-center sm:items-start gap-8">
          
          {/* Left: Cover Image Container */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="w-52 sm:w-64 md:w-72 shrink-0 rounded-2xl overflow-hidden shadow-2xl border border-white/15 aspect-[3/4] bg-white/5 relative group mx-auto md:mx-0"
          >
            <img
              src={series.cover}
              alt={series.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
          </motion.div>

          {/* Right: Details & Action Controls */}
          <div className="flex-1 text-center md:text-left">
            
            {/* Top Badges Row */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-4">
              <span className="bg-gradient-to-r from-rose-500 to-red-600 text-white font-black text-xs uppercase px-3.5 py-1.5 rounded-full shadow-md flex items-center gap-1.5">
                <FontAwesomeIcon icon={faFire} />
                <span>FEATURED SERIES</span>
              </span>
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5">
                <FontAwesomeIcon icon={faStar} className="text-amber-400 text-xs" />
                <span>{getRating(series.title)}</span>
              </span>
              <span className="bg-white/10 text-white font-semibold text-xs px-3 py-1.5 rounded-full border border-white/10">
                {series.type}
              </span>
              <span className={`text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full border ${
                series.status === 'ONGOING'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
              }`}>
                ● {series.status}
              </span>
            </div>

            {/* Main Title */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black mb-3 tracking-tight text-white leading-tight drop-shadow-md">
              {series.title}
            </h1>

            {/* Description with View more / View less */}
            <div className="mb-5">
              <p className={`text-gray-300 text-sm sm:text-base leading-relaxed font-medium max-w-3xl ${
                descExpanded ? '' : 'line-clamp-3'
              }`}>
                {series.description}
              </p>
              {series.description && series.description.length > 180 && (
                <button
                  onClick={() => setDescExpanded(!descExpanded)}
                  className="mt-1 text-xs text-accent hover:text-rose-300 font-semibold transition-colors flex items-center gap-1 inline-flex"
                >
                  <FontAwesomeIcon icon={descExpanded ? faChevronUp : faChevronDown} className="text-[10px]" />
                  <span>{descExpanded ? 'View less' : 'View more'}</span>
                </button>
              )}
            </div>

            {/* Genres List */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-6">
              {series.genres.map((genre) => (
                <span
                  key={genre}
                  className="bg-white/10 text-gray-200 text-xs font-semibold px-3 py-1 rounded-xl border border-white/10"
                >
                  {genre}
                </span>
              ))}
            </div>

            {/* Metadata Bar - compact on mobile */}
            <div className="grid grid-cols-2 sm:grid-cols-2 gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl bg-white/[0.04] border border-white/10 mb-5 text-left max-w-sm">
              <div>
                <span className="text-gray-400 block text-[10px] font-medium uppercase tracking-wider mb-0.5">Year</span>
                <span className="text-white font-bold text-xs sm:text-sm">{series.releaseYear}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px] font-medium uppercase tracking-wider mb-0.5">Chapters</span>
                <span className="text-rose-400 font-black text-sm sm:text-base">{series.chapters.length}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
              {series.chapters.length > 0 && (
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => onSelectChapter(series.chapters[0].id, series.chapters[0].number)}
                  className="bg-gradient-to-r from-rose-500 via-red-500 to-rose-600 hover:from-rose-600 hover:to-red-700 text-white font-bold px-7 py-3 rounded-2xl shadow-lg transition-all flex items-center gap-2 text-sm sm:text-base"
                >
                  <FontAwesomeIcon icon={faRocket} />
                  <span>Read Series Now (Ch. 1)</span>
                </motion.button>
              )}

              {series.chapters.length > 1 && (
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onSelectChapter(series.chapters[series.chapters.length - 1].id, series.chapters[series.chapters.length - 1].number)}
                  className="bg-white/10 hover:bg-white/20 text-white font-semibold px-5 py-3 rounded-2xl border border-white/10 transition-all text-sm flex items-center gap-2"
                >
                  <FontAwesomeIcon icon={faBolt} className="text-amber-400" />
                  <span>Latest Ch. ({series.chapters[series.chapters.length - 1].number})</span>
                </motion.button>
              )}

              <button
                onClick={toggleBookmark}
                className={`px-5 py-3 rounded-2xl border transition-all flex items-center gap-2 text-sm font-semibold ${
                  isBookmarked
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                    : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10'
                }`}
              >
                <FontAwesomeIcon icon={faBookmark} className={isBookmarked ? 'text-amber-400' : 'text-gray-400'} />
                <span>{isBookmarked ? 'Saved to Bookmarks' : 'Add to Bookmarks'}</span>
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Chapters Section */}
      <div className="glass p-6 sm:p-8 rounded-3xl border border-white/10 shadow-xl mb-12">
        {/* Chapters Header with Search & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-white/10">
          <div>
            <h3 className="text-2xl font-bold text-white flex items-center gap-3">
              <span>Chapter Directory</span>
              <span className="text-xs bg-accent/20 text-accent px-3 py-1 rounded-full border border-accent/30 font-bold">
                {series.chapters.length} Available
              </span>
            </h3>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-64">
              <input
                type="text"
                placeholder="Search chapter..."
                value={chapterSearch}
                onChange={(e) => setChapterSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 focus:border-accent rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 outline-none transition-all"
              />
              {chapterSearch && (
                <button
                  onClick={() => setChapterSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Order Sort Toggle */}
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="bg-white/5 hover:bg-white/10 text-xs font-semibold text-gray-300 border border-white/10 px-3.5 py-2.5 rounded-xl transition-all shrink-0 flex items-center gap-1.5"
            >
              <FontAwesomeIcon icon={sortOrder === 'asc' ? faArrowUpWideShort : faArrowDownWideShort} />
              <span>{sortOrder === 'asc' ? 'Order: Asc' : 'Order: Desc'}</span>
            </button>
          </div>
        </div>

        {/* Chapters List */}
        {filteredChapters.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            No chapters found matching "{chapterSearch}".
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredChapters.map((chap) => {
              const isRead = readChapters.includes(chap.id);
              return (
                <motion.div
                  key={chap.id}
                  whileHover={{ x: 4 }}
                  onClick={() => onSelectChapter(chap.id, chap.number)}
                  className={`cursor-pointer p-4 rounded-2xl border flex items-center justify-between transition-all group ${
                    isRead
                      ? 'bg-white/[0.01] border-white/5 opacity-65 hover:opacity-100 hover:border-accent/40'
                      : 'glass glass-hover border-white/5 hover:border-accent/30'
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`w-11 h-11 rounded-xl border flex items-center justify-center font-black transition-colors shadow-sm text-sm ${
                        isRead
                          ? 'bg-black/20 border-white/5 text-gray-500 group-hover:bg-accent group-hover:text-white group-hover:border-accent'
                          : 'bg-white/5 border-white/10 text-gray-200 group-hover:bg-accent group-hover:text-white group-hover:border-accent'
                      }`}
                    >
                      #{chap.number}
                    </div>
                    <div>
                      <h4
                        className={`font-bold transition-colors text-base line-clamp-1 ${
                          isRead ? 'text-gray-400 group-hover:text-accent-light' : 'text-white group-hover:text-accent-light'
                        }`}
                      >
                        {chap.title || `Chapter ${chap.number}`}
                      </h4>
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                        {chap.pageCount ? `${chap.pageCount} pages` : 'Complete'}
                        {chap.createdAt && (
                          <>
                            <span className="opacity-30">·</span>
                            <span className="text-accent/70">{timeAgo(chap.createdAt)}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`font-bold text-xs px-3.5 py-1.5 rounded-xl border transition-all shrink-0 flex items-center gap-1.5 ${
                      isRead
                        ? 'bg-white/5 text-gray-400 border-white/10 group-hover:bg-accent group-hover:text-white group-hover:border-accent'
                        : 'bg-accent/20 text-accent border-accent/30 group-hover:bg-accent group-hover:text-white'
                    }`}
                  >
                    {isRead ? (
                      <>
                        <FontAwesomeIcon icon={faCheck} className="text-[10px]" />
                        <span>Read</span>
                      </>
                    ) : (
                      'Read →'
                    )}
                  </span>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recommended / Similar Series Horizontal Carousel */}
      {recommendedList.length > 0 && (
        <div className="glass p-6 sm:p-8 rounded-3xl border border-white/10 shadow-xl relative overflow-hidden">
          {/* Section Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-2xl font-black text-white flex items-center gap-2">
                <FontAwesomeIcon icon={faFire} className="text-accent" />
                <span>Recommended & Similar Series</span>
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Popular titles with matching genres that you might enjoy
              </p>
            </div>

            {/* Navigation Arrows */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => scrollCarousel('left')}
                className="w-10 h-10 rounded-full bg-white/5 hover:bg-accent/30 border border-white/10 text-white flex items-center justify-center transition-all text-xs"
                aria-label="Scroll left"
              >
                <FontAwesomeIcon icon={faChevronLeft} />
              </button>
              <button
                onClick={() => scrollCarousel('right')}
                className="w-10 h-10 rounded-full bg-white/5 hover:bg-accent/30 border border-white/10 text-white flex items-center justify-center transition-all text-xs"
                aria-label="Scroll right"
              >
                <FontAwesomeIcon icon={faChevronRight} />
              </button>
            </div>
          </div>


          {/* Horizontal Track Carousel */}
          <div
            ref={carouselRef}
            className="flex items-center gap-4 overflow-x-auto no-scrollbar scroll-smooth py-2 px-1"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {recommendedList.map((item) => (
              <motion.div
                key={item.id}
                whileHover={{ y: -8, scale: 1.03 }}
                transition={{ duration: 0.25 }}
                onClick={() => onSelectSeries && onSelectSeries(item.slug)}
                className="w-44 sm:w-52 shrink-0 aspect-[3/4] relative rounded-2xl overflow-hidden shadow-xl border border-white/10 group cursor-pointer bg-white/5 flex flex-col justify-end"
              >
                {/* Cover Artwork */}
                <img
                  src={item.cover}
                  alt={item.title}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                />

                {/* Dark Gradient Overlay for title readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent opacity-85 group-hover:opacity-95 transition-opacity" />

                {/* Rating Badge */}
                <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md text-amber-400 text-[11px] font-black px-2.5 py-1 rounded-lg border border-amber-400/30 shadow-md flex items-center gap-1">
                  <span>★</span> {getRating(item.title)}
                </div>

                {/* Type pill */}
                <div className="absolute top-3 right-3 bg-accent/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-md uppercase shadow-sm">
                  {item.type}
                </div>

                {/* Card Title & Info Overlay */}
                <div className="relative z-10 p-3.5">
                  <h4 className="text-white font-bold text-sm leading-snug line-clamp-2 group-hover:text-accent-light transition-colors drop-shadow">
                    {item.title}
                  </h4>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {item.genres.slice(0, 2).map((g) => (
                      <span
                        key={g}
                        className="text-[9px] font-semibold bg-white/15 text-gray-200 px-2 py-0.5 rounded border border-white/10"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SeriesDetail;
