import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';

export interface PageData {
  id: string;
  pageNumber: number;
  imageUrl: string;
}

export interface ChapterData {
  id: string;
  number: number;
  title?: string;
  mangadexId?: string;
  series: {
    id: string;
    title: string;
    slug: string;
  };
  pages: PageData[];
  prevChapterId: string | null;
  nextChapterId: string | null;
}

interface WebtoonReaderProps {
  chapterId: string;
  onBackToSeries: (slug: string) => void;
  onNavigateChapter: (chapterId: string) => void;
}

export const WebtoonReader: React.FC<WebtoonReaderProps> = ({
  chapterId,
  onBackToSeries,
  onNavigateChapter,
}) => {
  const [chapter, setChapter] = useState<ChapterData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingPages, setLoadingPages] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchChapter = useCallback((isRetry = false) => {
    if (!isRetry) setLoading(true);
    setError(null);

    fetch(`/api/chapters/${chapterId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load chapter content');
        return res.json();
      })
      .then((data: ChapterData) => {
        setChapter(data);
        if (data?.series?.title) {
          document.title = `Cap. ${data.number} - ${data.series.title} | Panelium Scan`;
        }
        setLoading(false);


        // If pages are still empty while server is lazy-loading in background
        if (data.pages.length === 0) {
          setLoadingPages(true);
          // Poll once more after 3s to let the server finish lazy loading
          setTimeout(() => {
            fetch(`/api/chapters/${chapterId}`)
              .then((r) => r.json())
              .then((refreshed: ChapterData) => {
                setChapter(refreshed);
                setLoadingPages(false);
              })
              .catch(() => setLoadingPages(false));
          }, 3000);
        } else {
          setLoadingPages(false);
        }


        window.scrollTo({ top: 0, behavior: 'smooth' });
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [chapterId]);

  useEffect(() => {
    fetchChapter();
  }, [fetchChapter]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mb-4 shadow-glow" />
        <h3 className="text-xl font-bold text-white mb-1">Preparing Webtoon Viewer...</h3>
        <p className="text-sm text-gray-400">Loading high-resolution pages</p>
      </div>
    );
  }

  if (error || !chapter) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="glass p-8 rounded-3xl border border-rose-500/30 max-w-md">
          <span className="text-4xl mb-4 block">⚠️</span>
          <h3 className="text-xl font-bold text-rose-400 mb-2">Error loading chapter</h3>
          <p className="text-sm text-gray-300 mb-6">{error || 'Chapter not found'}</p>
          <button
            onClick={() => window.history.back()}
            className="bg-accent text-white font-medium px-6 py-2.5 rounded-xl shadow-glow"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Chapter has no pages and no MangaDex ID
  if (chapter.pages.length === 0 && !loadingPages) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="glass p-8 rounded-3xl border border-yellow-500/30 max-w-md">
          <span className="text-4xl mb-4 block">📭</span>
          <h3 className="text-xl font-bold text-yellow-300 mb-2">
            {chapter.title || `Chapter ${chapter.number}`}
          </h3>
          <p className="text-sm text-gray-300 mb-2">
            This chapter has no available pages.
          </p>
          <p className="text-xs text-gray-500 mb-6">
            It might be hosted externally or hasn't been translated yet.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              onClick={() => onBackToSeries(chapter.series.slug)}
              className="bg-white/5 hover:bg-white/10 text-white font-semibold px-5 py-2.5 rounded-xl border border-white/10 text-sm"
            >
              ← Back to Series
            </button>
            {chapter.nextChapterId && (
              <button
                onClick={() => onNavigateChapter(chapter.nextChapterId!)}
                className="bg-accent hover:bg-accent/80 text-white font-bold px-5 py-2.5 rounded-xl shadow-glow text-sm"
              >
                Skip to Next →
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Loading pages via lazy load
  if (loadingPages && chapter.pages.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mb-4 shadow-glow" />
        <h3 className="text-xl font-bold text-white mb-1">Loading pages...</h3>
        <p className="text-sm text-gray-400">Fetching chapter images, please wait</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050507] text-white flex flex-col items-center">
      {/* Floating Reader Navigation Bar */}
      <header className="sticky top-0 z-50 w-full glass border-b border-white/10 backdrop-blur-xl bg-background/90 px-6 py-3 shadow-2xl">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button
            onClick={() => onBackToSeries(chapter.series.slug)}
            className="text-xs text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 px-3.5 py-2 rounded-xl border border-white/10 flex items-center gap-2 transition-colors"
          >
            ← {chapter.series.title}
          </button>

          <div className="text-center min-w-0 flex-1 px-2">
            <h2 className="text-xs sm:text-sm font-bold text-white line-clamp-1">
              {chapter.title || `Ch. ${chapter.number}`}
            </h2>
            <span className="text-[10px] text-accent font-medium hidden sm:block">
              {chapter.pages.length} pages • Webtoon Scroll
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              disabled={!chapter.prevChapterId}
              onClick={() => chapter.prevChapterId && onNavigateChapter(chapter.prevChapterId)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                chapter.prevChapterId
                  ? 'bg-white/5 text-white hover:bg-accent border-white/10 hover:border-accent'
                  : 'opacity-30 border-white/5 cursor-not-allowed text-gray-500'
              }`}
            >
              ‹ Prev
            </button>

            <button
              disabled={!chapter.nextChapterId}
              onClick={() => chapter.nextChapterId && onNavigateChapter(chapter.nextChapterId)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                chapter.nextChapterId
                  ? 'bg-accent text-white border-accent shadow-glow'
                  : 'opacity-30 border-white/5 cursor-not-allowed text-gray-500'
              }`}
            >
              Next ›
            </button>
          </div>
        </div>
      </header>

      {/* Main Webtoon Vertical Page Stream */}
      <main className="w-full max-w-3xl my-6 px-2 flex flex-col items-center gap-1">
        {chapter.pages.map((page) => (
          <div
            key={page.id}
            className="w-full relative shadow-2xl overflow-hidden rounded-lg bg-white/5 border border-white/5"
          >
            <img
              src={page.imageUrl}
              alt={`Page ${page.pageNumber}`}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="w-full h-auto object-contain block mx-auto"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                const retries = parseInt(img.dataset.retries || '0', 10);
                if (retries < 3) {
                  img.dataset.retries = String(retries + 1);
                  setTimeout(() => {
                    img.src = `${page.imageUrl}&_retry=${Date.now()}`;
                  }, 1500 * (retries + 1));
                } else {
                  img.style.opacity = '0.3';
                }
              }}
            />
            <span className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-md text-[10px] text-gray-300 font-mono px-2 py-0.5 rounded border border-white/10">
              {page.pageNumber} / {chapter.pages.length}
            </span>
          </div>
        ))}
      </main>

      {/* Bottom End-of-Chapter Navigation */}
      <footer className="w-full max-w-2xl my-12 px-6">
        <div className="glass p-8 rounded-3xl border border-white/10 text-center shadow-glow">
          <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
            You finished {chapter.title || `Chapter ${chapter.number}`}! 🎉
          </h3>
          <p className="text-sm text-gray-400 mb-6">
            Enjoyed it? Keep reading or explore more series in our catalog.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => onBackToSeries(chapter.series.slug)}
              className="bg-white/5 hover:bg-white/10 text-white font-semibold px-5 py-2.5 rounded-2xl border border-white/10 transition-all text-sm"
            >
              ← View Series
            </button>

            {chapter.nextChapterId && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onNavigateChapter(chapter.nextChapterId!)}
                className="bg-accent hover:bg-accent/80 text-white font-bold px-6 py-2.5 rounded-2xl shadow-glow transition-all text-sm flex items-center gap-2"
              >
                <span>Next Chapter</span>
                <span>→</span>
              </motion.button>
            )}
          </div>
        </div>
      </footer>

    </div>
  );
};
