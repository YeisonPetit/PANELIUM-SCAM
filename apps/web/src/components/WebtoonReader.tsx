import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExpand, faCompress, faKeyboard } from '@fortawesome/free-solid-svg-icons';
import { saveProgress } from './ContinueReadingWidget';
import { injectChapterSchema } from '../utils/schema';
import { ChapterAdBanner } from './ChapterAdBanner';

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
    cover?: string;
  };
  pages: PageData[];
  prevChapterId: string | null;
  nextChapterId: string | null;
  prevChapterNumber?: number | null;
  nextChapterNumber?: number | null;
}

interface WebtoonReaderProps {
  slug?: string;
  chapterNumber?: string | number;
  chapterId?: string;
  onBackToSeries: (slug: string) => void;
  onNavigateChapter: (chapterTarget: string | number, seriesSlug?: string) => void;
  onChapterLoaded?: (chapter: ChapterData) => void;
}

// In-memory cache across navigation for instant chapter transitions
const chapterCache = new Map<string, ChapterData>();

interface WebtoonPageItemProps {
  page: PageData;
  index: number;
  onFirstPagesLoaded?: () => void;
}

const WebtoonPageItem: React.FC<WebtoonPageItemProps> = ({
  page,
  index,
  onFirstPagesLoaded,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // Pages 0 and 1 start loading immediately; rest load as user approaches
  const [shouldLoad, setShouldLoad] = useState<boolean>(index < 2);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  useEffect(() => {
    if (shouldLoad) return;

    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      {
        // 800px buffer: loads 1-2 screen heights before entering view
        rootMargin: '800px 0px',
      }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [shouldLoad]);

  return (
    <div
      ref={containerRef}
      className="w-full relative shadow-2xl overflow-hidden rounded-lg bg-white/[0.02] border border-white/5 min-h-[480px] sm:min-h-[720px] flex items-center justify-center"
    >
      {/* Subtle loading spinner placeholder while image is downloading */}
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-white/20 select-none">
          <div className="w-6 h-6 border-2 border-white/20 border-t-accent rounded-full animate-spin" />
        </div>
      )}

      {shouldLoad && (
        <img
          src={page.imageUrl}
          alt=""
          loading={index < 2 ? 'eager' : 'lazy'}
          decoding="async"
          referrerPolicy="no-referrer"
          className={`relative z-10 w-full h-auto object-contain block mx-auto transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => {
            setIsLoaded(true);
            if (index < 2 && onFirstPagesLoaded) {
              onFirstPagesLoaded();
            }
          }}
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
      )}
    </div>
  );
};

export const WebtoonReader: React.FC<WebtoonReaderProps> = ({
  slug,
  chapterNumber,
  chapterId,
  onBackToSeries,
  onNavigateChapter,
  onChapterLoaded,
}) => {
  const [chapter, setChapter] = useState<ChapterData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingPages, setLoadingPages] = useState<boolean>(false);
  const [isChapterReady, setIsChapterReady] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isNavVisible, setIsNavVisible] = useState<boolean>(true);
  const [showShortcutToast, setShowShortcutToast] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const lastScrollYRef = useRef<number>(0);
  const prefetchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const onChapterLoadedRef = useRef(onChapterLoaded);
  onChapterLoadedRef.current = onChapterLoaded;
  const currentLoadedEndpointRef = useRef<string | null>(null);

  const endpointUrl = slug && chapterNumber !== undefined
    ? `/api/series/${encodeURIComponent(slug)}/chapters/${chapterNumber}`
    : chapterId
    ? `/api/chapters/${chapterId}`
    : null;

  // Preload next chapter data & images in background for 0s lag
  const prefetchNextChapter = useCallback((currChapter: ChapterData) => {
    if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);

    prefetchTimerRef.current = setTimeout(() => {
      let nextUrl: string | null = null;
      if (currChapter.series?.slug && currChapter.nextChapterNumber !== null && currChapter.nextChapterNumber !== undefined) {
        nextUrl = `/api/series/${encodeURIComponent(currChapter.series.slug)}/chapters/${currChapter.nextChapterNumber}`;
      } else if (currChapter.nextChapterId) {
        nextUrl = `/api/chapters/${currChapter.nextChapterId}`;
      }

      if (!nextUrl || chapterCache.has(nextUrl)) return;

      fetch(nextUrl)
        .then((res) => (res.ok ? res.json() : null))
        .then((nextData: ChapterData | null) => {
          if (!nextData || !nextUrl) return;
          chapterCache.set(nextUrl, nextData);

          // Preload first 5 image pages into browser memory cache
          if (Array.isArray(nextData.pages)) {
            nextData.pages.slice(0, 5).forEach((p) => {
              if (p.imageUrl) {
                const img = new Image();
                img.src = p.imageUrl;
              }
            });
          }
        })
        .catch(() => {});
    }, 1500); // 1.5s idle delay so current page loads first
  }, []);

  const fetchChapter = useCallback((targetUrl: string, isRetry = false) => {
    const isNewChapterNavigation = currentLoadedEndpointRef.current !== targetUrl;

    // Check in-memory pre-loaded cache first for 0s transition
    if (chapterCache.has(targetUrl)) {
      const cached = chapterCache.get(targetUrl)!;
      setChapter(cached);
      setLoading(false);
      setError(null);
      currentLoadedEndpointRef.current = targetUrl;

      if (cached.series?.title) {
        document.title = `Ch. ${cached.number} - ${cached.series.title} | Panelium Scan`;
      }

      // Inject Schema.org JSON-LD
      injectChapterSchema({
        seriesTitle: cached.series?.title || 'Manhwa',
        seriesSlug: cached.series?.slug || '',
        seriesCover: (cached.series as any)?.cover,
        chapterNumber: cached.number,
        chapterTitle: cached.title,
      });

      // Save progress
      if (cached.series?.slug) {
        saveProgress({
          seriesSlug: cached.series.slug,
          seriesTitle: cached.series.title,
          seriesCover: (cached.series as any)?.cover ?? '',
          chapterNumber: cached.number,
          chapterId: cached.id,
          nextChapterNumber: cached.nextChapterNumber ?? null,
          nextChapterId: cached.nextChapterId ?? null,
          readAt: Date.now(),
        });
      }

      if (onChapterLoadedRef.current) onChapterLoadedRef.current(cached);

      // Only scroll to top on genuine new chapter navigation, NEVER on tab switch or re-render
      if (isNewChapterNavigation) {
        window.scrollTo({ top: 0, behavior: 'instant' as any });
      }

      prefetchNextChapter(cached);
      return;
    }

    if (!isRetry) setLoading(true);
    setError(null);

    fetch(targetUrl)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load chapter content');
        return res.json();
      })
      .then((data: ChapterData) => {
        chapterCache.set(targetUrl, data);
        setChapter(data);
        currentLoadedEndpointRef.current = targetUrl;

        if (data?.series?.title) {
          document.title = `Ch. ${data.number} - ${data.series.title} | Panelium Scan`;
        }

        // Inject Schema.org JSON-LD
        injectChapterSchema({
          seriesTitle: data.series?.title || 'Manhwa',
          seriesSlug: data.series?.slug || '',
          seriesCover: (data.series as any)?.cover,
          chapterNumber: data.number,
          chapterTitle: data.title,
        });

        // Persist reading progress for the "Continue Reading" widget
        if (data?.series?.slug) {
          saveProgress({
            seriesSlug: data.series.slug,
            seriesTitle: data.series.title,
            seriesCover: (data.series as any)?.cover ?? '',
            chapterNumber: data.number,
            chapterId: data.id,
            nextChapterNumber: data.nextChapterNumber ?? null,
            nextChapterId: data.nextChapterId ?? null,
            readAt: Date.now(),
          });
        }

        if (onChapterLoadedRef.current) {
          onChapterLoadedRef.current(data);
        }
        setLoading(false);

        // Only scroll to top on genuine new chapter navigation
        if (isNewChapterNavigation) {
          window.scrollTo({ top: 0, behavior: 'instant' as any });
        }

        // Preload next chapter in background
        prefetchNextChapter(data);

        // If pages are still empty while server is lazy-loading in background
        if (data.pages.length === 0) {
          setLoadingPages(true);
          setTimeout(() => {
            fetch(targetUrl)
              .then((r) => r.json())
              .then((refreshed: ChapterData) => {
                chapterCache.set(targetUrl, refreshed);
                setChapter(refreshed);
                if (onChapterLoadedRef.current) {
                  onChapterLoadedRef.current(refreshed);
                }
                setLoadingPages(false);
                prefetchNextChapter(refreshed);
              })
              .catch(() => setLoadingPages(false));
          }, 3000);
        } else {
          setLoadingPages(false);
        }
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [prefetchNextChapter]);

  useEffect(() => {
    if (endpointUrl) {
      fetchChapter(endpointUrl);
    }
    return () => {
      if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
    };
  }, [endpointUrl, fetchChapter]);

  // Smart Scroll Auto-Hide: Hides navbar when scrolling down for immersion, reveals on scroll up or at chapter bottom
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const diff = currentScrollY - lastScrollYRef.current;
      const windowHeight = window.innerHeight;
      const fullHeight = document.documentElement.scrollHeight;
      const isNearBottom = currentScrollY + windowHeight >= fullHeight - 500;

      if (currentScrollY < 100 || isNearBottom) {
        setIsNavVisible(true);
      } else if (diff > 12) {
        // Scrolling down -> hide navbar
        setIsNavVisible(false);
      } else if (diff < -15) {
        // Scrolling up -> show navbar
        setIsNavVisible(true);
      }
      lastScrollYRef.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Keyboard Shortcuts: Left/Right Arrows for Chapters, F for Fullscreen, M for Menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
        if (chapter?.prevChapterNumber != null && chapter.series?.slug) {
          onNavigateChapter(chapter.prevChapterNumber, chapter.series.slug);
        } else if (chapter?.prevChapterId) {
          onNavigateChapter(chapter.prevChapterId);
        }
      } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
        if (chapter?.nextChapterNumber != null && chapter.series?.slug) {
          onNavigateChapter(chapter.nextChapterNumber, chapter.series.slug);
        } else if (chapter?.nextChapterId) {
          onNavigateChapter(chapter.nextChapterId);
        }
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
          setIsFullscreen(true);
        } else {
          document.exitFullscreen?.().catch(() => {});
          setIsFullscreen(false);
        }
      } else if (e.key.toLowerCase() === 'm' || e.key === 'Escape') {
        setIsNavVisible((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [chapter, onNavigateChapter]);

  // Hide keyboard shortcut guide pill after 4 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowShortcutToast(false), 4000);
    return () => clearTimeout(timer);
  }, []);

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
      {/* Floating Reader Navigation Bar with Auto-Hide on Scroll Down */}
      <header
        className={`sticky top-0 z-50 w-full glass border-b border-white/10 backdrop-blur-xl bg-background/90 px-4 sm:px-6 py-2.5 sm:py-3 shadow-2xl transition-all duration-300 ease-in-out ${
          isNavVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button
            onClick={() => onBackToSeries(chapter.series.slug)}
            className="text-xs text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl border border-white/10 flex items-center gap-2 transition-colors shrink-0"
          >
            ← <span className="hidden sm:inline">{chapter.series.title}</span><span className="sm:hidden">Series</span>
          </button>

          <div className="text-center min-w-0 flex-1 px-2">
            <h2 className="text-xs sm:text-sm font-bold text-white line-clamp-1">
              {chapter.title || `Ch. ${chapter.number}`}
            </h2>
            <span className="text-[10px] text-accent font-medium hidden sm:block">
              Webtoon Scroll • Press F for Fullscreen
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => {
                if (!document.fullscreenElement) {
                  document.documentElement.requestFullscreen?.().catch(() => {});
                  setIsFullscreen(true);
                } else {
                  document.exitFullscreen?.().catch(() => {});
                  setIsFullscreen(false);
                }
              }}
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 flex items-center justify-center text-xs transition-all mr-1"
              title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
              aria-label="Toggle Fullscreen"
            >
              <FontAwesomeIcon icon={isFullscreen ? faCompress : faExpand} />
            </button>

            <button
              disabled={!chapter.prevChapterId && chapter.prevChapterNumber == null}
              onClick={() => {
                if (chapter.prevChapterNumber != null && chapter.series?.slug) {
                  onNavigateChapter(chapter.prevChapterNumber, chapter.series.slug);
                } else if (chapter.prevChapterId) {
                  onNavigateChapter(chapter.prevChapterId);
                }
              }}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                chapter.prevChapterId || chapter.prevChapterNumber != null
                  ? 'bg-white/5 text-white hover:bg-accent border-white/10 hover:border-accent'
                  : 'opacity-30 border-white/5 cursor-not-allowed text-gray-500'
              }`}
            >
              ‹ Prev
            </button>

            <button
              disabled={!chapter.nextChapterId && chapter.nextChapterNumber == null}
              onClick={() => {
                if (chapter.nextChapterNumber != null && chapter.series?.slug) {
                  onNavigateChapter(chapter.nextChapterNumber, chapter.series.slug);
                } else if (chapter.nextChapterId) {
                  onNavigateChapter(chapter.nextChapterId);
                }
              }}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                chapter.nextChapterId || chapter.nextChapterNumber != null
                  ? 'bg-accent text-white border-accent shadow-glow'
                  : 'opacity-30 border-white/5 cursor-not-allowed text-gray-500'
              }`}
            >
              Next ›
            </button>
          </div>
        </div>
      </header>

      {/* Floating Keyboard Shortcut Helper Toast */}
      <AnimatePresence>
        {showShortcutToast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.25 }}
            className="fixed bottom-6 z-50 bg-[#0F1015]/90 border border-white/15 px-4 py-2 rounded-2xl shadow-2xl backdrop-blur-xl text-xs text-gray-300 flex items-center gap-3 pointer-events-none"
          >
            <FontAwesomeIcon icon={faKeyboard} className="text-rose-400" />
            <span className="flex items-center gap-1 font-mono text-[11px] text-white">
              <kbd className="bg-white/10 px-1.5 py-0.5 rounded border border-white/10">←</kbd>
              <kbd className="bg-white/10 px-1.5 py-0.5 rounded border border-white/10">→</kbd>
              Chapters
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 font-mono text-[11px] text-white">
              <kbd className="bg-white/10 px-1.5 py-0.5 rounded border border-white/10">F</kbd>
              Fullscreen
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 font-mono text-[11px] text-white">
              <kbd className="bg-white/10 px-1.5 py-0.5 rounded border border-white/10">M</kbd>
              Menu
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Webtoon Vertical Page Stream with Smart 2-Page Buffer Lazy Loading */}
      <main className="w-full max-w-3xl my-6 px-2 flex flex-col items-center gap-1">
        {chapter.pages.map((page, index) => (
          <WebtoonPageItem
            key={page.id}
            page={page}
            index={index}
            onFirstPagesLoaded={() => setIsChapterReady(true)}
          />
        ))}
      </main>

      {/* Clean End-of-Chapter Non-Intrusive Ad Placement with Anti-Redirect Protection */}
      <ChapterAdBanner key={chapter.id} isChapterReady={isChapterReady} />

      {/* Bottom End-of-Chapter Navigation */}
      <footer className="w-full max-w-2xl my-8 px-6">
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

            {(chapter.nextChapterId || chapter.nextChapterNumber != null) && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  if (chapter.nextChapterNumber != null && chapter.series?.slug) {
                    onNavigateChapter(chapter.nextChapterNumber, chapter.series.slug);
                  } else if (chapter.nextChapterId) {
                    onNavigateChapter(chapter.nextChapterId);
                  }
                }}
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
