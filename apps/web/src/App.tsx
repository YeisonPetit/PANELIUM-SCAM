import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useParams, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Catalog, Series } from './components/Catalog';
import { SeriesDetail, SeriesDetailData } from './components/SeriesDetail';
import { WebtoonReader } from './components/WebtoonReader';
import { MangaDexImporter } from './components/MangaDexImporter';
import { FavoritesView } from './components/FavoritesView';
import { AuthModal } from './components/AuthModal';
import { NotFound } from './components/NotFound';

const API_BASE = '';

function SeriesDetailPage({
  readChapters,
  seriesList,
  onSelectChapter,
}: {
  readChapters: string[];
  seriesList: Series[];
  onSelectChapter: (chapterId: string, chapterNumber: number) => void;
}) {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [seriesData, setSeriesData] = useState<SeriesDetailData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`${API_BASE}/api/series/${slug}`)
      .then((res) => res.json())
      .then((data) => {
        setSeriesData(data);
        if (data?.title) {
          document.title = `${data.title} - Read Online | Panelium Scan`;
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load series detail:', err);
        setLoading(false);
      });
  }, [slug]);

  return (
    <SeriesDetail
      series={seriesData}
      loading={loading}
      onBack={() => navigate('/')}
      onSelectChapter={(chapId, chapNumber) => {
        onSelectChapter(chapId, chapNumber);
        navigate(`/${slug}/chapter/${chapNumber}`);
      }}
      readChapters={readChapters}
      allSeries={seriesList}
      onSelectSeries={(sSlug) => navigate(`/series/${sSlug}`)}
    />
  );
}

function WebtoonReaderPage({
  onSelectChapter,
}: {
  onSelectChapter: (chapterId: string) => void;
}) {
  const { slug, chapterNumber, chapterId } = useParams<{
    slug?: string;
    chapterNumber?: string;
    chapterId?: string;
  }>();
  const navigate = useNavigate();

  return (
    <WebtoonReader
      slug={slug}
      chapterNumber={chapterNumber}
      chapterId={chapterId}
      onBackToSeries={(seriesSlug) => navigate(`/series/${seriesSlug}`)}
      onNavigateChapter={(nextTarget, seriesSlug) => {
        if (seriesSlug) {
          navigate(`/${seriesSlug}/chapter/${nextTarget}`);
        } else {
          navigate(`/chapter/${nextTarget}`);
        }
      }}
      onChapterLoaded={(loadedChapter) => {
        if (loadedChapter?.id) {
          onSelectChapter(loadedChapter.id);
        }
      }}
    />
  );
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token, isAdmin } = useAuth();

  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [health, setHealth] = useState<any>(null);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [readChapters, setReadChapters] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('read-chapters');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [latestChapters, setLatestChapters] = useState<any[]>([]);

  // Calculate active view based on URL route
  const getActiveView = () => {
    if (location.pathname.includes('/chapter/')) return 'reader';
    if (location.pathname.startsWith('/series/')) return 'detail';
    if (location.pathname === '/favorites') return 'favorites';
    if (location.pathname === '/importer') return 'importer';
    if (location.pathname === '/library') return 'library';
    return 'home';
  };

  // Sync document title & Google Analytics on route transitions
  useEffect(() => {
    if (location.pathname === '/') {
      document.title = 'Panelium Scan - Read Manhwa, Manga & Webtoons Online Free';
    } else if (location.pathname === '/library') {
      document.title = 'Comics Library | Panelium Scan';
    } else if (location.pathname === '/favorites') {
      document.title = 'My Favorites | Panelium Scan';
    } else if (location.pathname === '/importer') {
      document.title = 'Import Comics | Panelium Scan';
    }

    // Google Analytics 4 pageview tracking for SPA navigation
    if (typeof (window as any).gtag === 'function') {
      (window as any).gtag('config', 'G-ZD9X150ZL3', {
        page_path: location.pathname + location.search,
      });
    }
  }, [location.pathname, location.search]);

  // Poll API health endpoint
  useEffect(() => {
    const fetchHealth = () => {
      fetch(`${API_BASE}/health`)
        .then((res) => res.json())
        .then((data) => setHealth(data))
        .catch(() => setHealth({ status: 'offline', services: { postgres: 'disconnected', redis: 'disconnected' } }));
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  // Fetch Catalog Series List
  const refreshCatalog = useCallback(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/series`)
      .then((res) => res.json())
      .then((resData) => {
        setSeriesList(resData.data || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load series catalog:', err);
        setLoading(false);
      });
  }, []);

  const refreshLatestChapters = useCallback(() => {
    fetch(`${API_BASE}/api/chapters/latest`)
      .then((res) => res.json())
      .then((data) => setLatestChapters(data || []))
      .catch((err) => console.error('Failed to load latest updates:', err));
  }, []);

  useEffect(() => {
    refreshCatalog();
    refreshLatestChapters();
  }, [refreshCatalog, refreshLatestChapters]);

  // Smart polling: refresh latest chapters every 5 min, but only when tab is visible.
  useEffect(() => {
    const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
    const interval = setInterval(refreshLatestChapters, POLL_INTERVAL);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshLatestChapters();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refreshLatestChapters]);

  const handleSelectChapter = (chapterId: string) => {
    // Add to local storage read history
    if (!readChapters.includes(chapterId)) {
      const updated = [...readChapters, chapterId];
      setReadChapters(updated);
      try {
        localStorage.setItem('read-chapters', JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to persist read status:', err);
      }
    }

    // If logged in, sync history with PostgreSQL database
    if (token) {
      fetch(`${API_BASE}/api/user/history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ chapterId, page: 1 }),
      }).catch((err) => console.error('History sync error:', err));
    }
  };

  const handleGoHome = () => {
    refreshCatalog();
    navigate('/');
  };

  const handleGoLibrary = () => {
    navigate('/library');
  };

  const handleGoFavorites = () => {
    navigate('/favorites');
  };

  const handleOpenImporter = () => {
    navigate('/importer');
  };

  const handleSeriesImported = (slug: string) => {
    refreshCatalog();
    navigate(`/series/${slug}`);
  };

  const currentView = getActiveView();

  return (
    <div className="min-h-screen bg-transparent text-gray-200 font-sans selection:bg-accent selection:text-white relative">
      {/* Dynamic Background Mesh */}
      <div className="bg-mesh-container">
        <div className="bg-mesh-glow-1 animate-blob"></div>
        <div className="bg-mesh-glow-2 animate-blob" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Hide navbar while in reader mode for immersive reading */}
      {currentView !== 'reader' && (
        <Navbar
          health={health}
          onGoHome={handleGoHome}
          onGoLibrary={handleGoLibrary}
          onGoFavorites={handleGoFavorites}
          onOpenImporter={handleOpenImporter}
          onOpenAuth={() => setIsAuthModalOpen(true)}
          activeView={currentView}
        />
      )}

      {/* Login & Register Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      <Routes>
        <Route
          path="/"
          element={
            <Catalog
              seriesList={seriesList}
              loading={loading}
              onSelectSeries={(slug) => navigate(`/series/${slug}`)}
              latestChapters={latestChapters}
              onSelectChapter={(seriesSlug, chapNumber, chapId) => {
                handleSelectChapter(chapId);
                navigate(`/${seriesSlug}/chapter/${chapNumber}`);
              }}
              viewMode="home"
              onGoLibrary={handleGoLibrary}
            />
          }
        />

        <Route
          path="/library"
          element={
            <Catalog
              seriesList={seriesList}
              loading={loading}
              onSelectSeries={(slug) => navigate(`/series/${slug}`)}
              latestChapters={latestChapters}
              onSelectChapter={(seriesSlug, chapNumber, chapId) => {
                handleSelectChapter(chapId);
                navigate(`/${seriesSlug}/chapter/${chapNumber}`);
              }}
              viewMode="library"
            />
          }
        />

        <Route
          path="/favorites"
          element={
            <FavoritesView
              seriesList={seriesList}
              loading={loading}
              onSelectSeries={(slug) => navigate(`/series/${slug}`)}
              onSelectChapter={(seriesSlug, chapNumber, chapId) => {
                handleSelectChapter(chapId);
                navigate(`/${seriesSlug}/chapter/${chapNumber}`);
              }}
              onGoExplore={handleGoLibrary}
            />
          }
        />

        <Route
          path="/series/:slug"
          element={
            <SeriesDetailPage
              readChapters={readChapters}
              seriesList={seriesList}
              onSelectChapter={handleSelectChapter}
            />
          }
        />

        {/* Both canonical routes supported: /series/:slug/chapter/:chapterNumber and /:slug/chapter/:chapterNumber */}
        <Route
          path="/series/:slug/chapter/:chapterNumber"
          element={<WebtoonReaderPage onSelectChapter={handleSelectChapter} />}
        />

        <Route
          path="/:slug/chapter/:chapterNumber"
          element={<WebtoonReaderPage onSelectChapter={handleSelectChapter} />}
        />

        {/* Legacy ID route */}
        <Route
          path="/chapter/:chapterId"
          element={<WebtoonReaderPage onSelectChapter={handleSelectChapter} />}
        />

        {/* Protected Importer Route: Admin Only */}
        <Route
          path="/importer"
          element={
            isAdmin ? (
              <MangaDexImporter onSeriesImported={handleSeriesImported} />
            ) : (
              <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
                <div className="glass p-10 sm:p-12 rounded-3xl border border-white/10 max-w-md shadow-2xl">
                  <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-3xl mx-auto mb-4">
                    🔒
                  </div>
                  <h2 className="text-2xl font-black text-white mb-2">Restricted Access</h2>
                  <p className="text-gray-400 text-sm leading-relaxed mb-6">
                    The comic importer panel is reserved exclusively for Administrator accounts.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                      onClick={() => setIsAuthModalOpen(true)}
                      className="bg-accent hover:bg-accent/80 text-white font-bold px-6 py-3 rounded-xl shadow-glow transition-all"
                    >
                      Sign In as Admin
                    </button>
                    <button
                      onClick={handleGoHome}
                      className="bg-white/5 hover:bg-white/10 text-gray-300 font-bold px-6 py-3 rounded-xl border border-white/10 transition-all"
                    >
                      Back to Home
                    </button>
                  </div>
                </div>
              </div>
            )
          }
        />

        <Route
          path="*"
          element={<NotFound onGoHome={handleGoHome} />}
        />
      </Routes>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
