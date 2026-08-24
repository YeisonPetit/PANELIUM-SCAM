import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';

export interface ImporterItem {
  id: string;
  title: string;
  description?: string;
  coverUrl: string;
  status?: string;
  type?: string;
  author: string;
  lastChapter?: string;
}

interface MangaDexImporterProps {
  onSeriesImported: (slug: string) => void;
}

const API_BASE = '';

interface ExistingSeriesItem {
  id: string;
  title: string;
  slug: string;
  sourceUrl: string | null;
}

export const MangaDexImporter: React.FC<MangaDexImporterProps> = ({ onSeriesImported }) => {
  const [activeSource, setActiveSource] = useState<'weebcentral' | 'mangadex'>('weebcentral');
  const [query, setQuery] = useState<string>('');
  const [results, setResults] = useState<ImporterItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importedSlugs, setImportedSlugs] = useState<Record<string, string>>({});
  
  // Existing series from DB
  const [existingSeries, setExistingSeries] = useState<ExistingSeriesItem[]>([]);

  // Load existing series from DB to mark already-imported items
  const loadExistingSeries = useCallback(() => {
    fetch(`${API_BASE}/api/series`)
      .then((res) => res.json())
      .then((json) => {
        setExistingSeries(json.data || []);
      })
      .catch(() => {/* ignore, non-critical */});
  }, []);

  useEffect(() => {
    loadExistingSeries();
  }, [loadExistingSeries]);

  // Perform search
  const performSearch = useCallback((searchTerm: string) => {
    setLoading(true);
    const endpoint =
      activeSource === 'weebcentral'
        ? `${API_BASE}/api/manganato/search?q=${encodeURIComponent(searchTerm)}`
        : `${API_BASE}/api/mangadex/search?q=${encodeURIComponent(searchTerm)}`;

    fetch(endpoint)
      .then((res) => res.json())
      .then((json) => {
        setResults(json.data || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to search source:', err);
        setResults([]);
        setLoading(false);
      });
  }, [activeSource]);

  // Trigger search immediately when source tab switches (reset query too)
  useEffect(() => {
    setQuery('');
    performSearch('');
  }, [activeSource]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search-as-you-type (400ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(query);
    }, 400);
    return () => clearTimeout(timer);
  }, [query, performSearch]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(query);
  };

  const { token } = useAuth();

  const handleImport = async (item: ImporterItem) => {
    setImportingId(item.id);
    try {
      const endpoint =
        activeSource === 'weebcentral'
          ? `${API_BASE}/api/manganato/import`
          : `${API_BASE}/api/mangadex/import`;

      const payload =
        activeSource === 'weebcentral'
          ? { seriesId: item.id }
          : { mangaDexId: item.id, languages: ['en'] }; // English only as requested

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al importar');


      const newSlug = json.series.slug;
      setImportedSlugs((prev) => ({ ...prev, [item.id]: newSlug }));
      
      // Update local state instantly so the UI updates
      setExistingSeries((prev) => [
        ...prev,
        {
          id: json.series.id,
          title: json.series.title,
          slug: newSlug,
          sourceUrl: json.series.sourceUrl || `${activeSource}:${item.id}`,
        },
      ]);

      setImportingId(null);
    } catch (err) {
      console.error('Error importing series:', err);
      setImportingId(null);
      alert('Failed to import series. Please try again.');
    }
  };

  // Reliable checker to determine if item is already imported
  const getImportedSlug = (itemId: string, itemTitle: string) => {
    // 1. Check if imported during this session
    if (importedSlugs[itemId]) {
      return importedSlugs[itemId];
    }
    
    // 2. Check by sourceUrl
    const targetSourceUrl = `${activeSource}:${itemId}`;
    const matchedUrl = existingSeries.find(
      (s) => s.sourceUrl === targetSourceUrl || s.sourceUrl === itemId
    );
    if (matchedUrl) return matchedUrl.slug;

    // 3. Fallback: match by title (case-insensitive)
    const normalizedTitle = itemTitle.toLowerCase().trim();
    const matchedTitle = existingSeries.find(
      (s) => s.title.toLowerCase().trim() === normalizedTitle
    );
    if (matchedTitle) return matchedTitle.slug;

    return null;
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Header Banner */}
      <div className="glass p-8 rounded-3xl mb-10 border border-white/10 relative overflow-hidden shadow-glow">
        <div className="absolute inset-0 bg-gradient-to-r from-red-600/20 via-accent/20 to-transparent pointer-events-none" />
        <div className="relative z-10 max-w-3xl">
          <span className="inline-block bg-accent/20 text-accent border border-accent/30 text-xs font-bold px-3 py-1 rounded-full mb-4">
            🌐 Live Importer {activeSource === 'weebcentral' ? '(WeebCentral)' : '(MangaDex)'}
          </span>
          
          <h2 className="text-4xl md:text-5xl font-black text-white mb-3 tracking-tight">
            Import Manhwas & Mangas
          </h2>
          <p className="text-gray-300 text-lg leading-relaxed mb-6">
            {activeSource === 'weebcentral'
              ? 'Search and import English manhwas and mangas from WeebCentral. Includes popular titles with HD covers and automated updates.'
              : 'Search and import English translated titles directly from MangaDex. Access their global community library with 1 click.'}
          </p>

          {/* Tab Selector */}
          <div className="flex gap-2 mb-6 bg-black/40 p-1.5 rounded-2xl border border-white/10 w-fit">
            <button
              type="button"
              onClick={() => setActiveSource('weebcentral')}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                activeSource === 'weebcentral'
                  ? 'bg-accent text-white shadow-glow'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              🌐 WeebCentral (English)
            </button>
            <button
              type="button"
              onClick={() => setActiveSource('mangadex')}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                activeSource === 'mangadex'
                  ? 'bg-accent text-white shadow-glow'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              🎯 MangaDex
            </button>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search titles on ${activeSource === 'weebcentral' ? 'WeebCentral' : 'MangaDex'}...`}
                className="w-full bg-background/90 border border-white/15 focus:border-accent text-white px-5 py-3.5 rounded-2xl outline-none transition-all placeholder:text-gray-500 shadow-inner"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="bg-background/90 border border-white/15 px-4 py-3.5 rounded-2xl text-xs font-bold text-gray-400">
                🇬🇧 English Only
              </span>

              <button
                type="submit"
                className="bg-accent hover:bg-accent/80 text-white font-bold px-6 py-3.5 rounded-2xl shadow-glow transition-all"
              >
                Search
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-bold text-white flex items-center gap-2">
          {query.trim() ? `Search Results for "${query}"` : `Popular on ${activeSource === 'weebcentral' ? 'WeebCentral' : 'MangaDex'}`}
          <span className="text-xs bg-white/10 px-2.5 py-1 rounded-full text-accent">{results.length}</span>
        </h3>
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <div className="inline-block w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mb-4 shadow-glow" />
          <p className="text-gray-400 font-medium">Querying servers...</p>
        </div>
      ) : results.length === 0 ? (
        <div className="glass p-12 rounded-3xl text-center border border-white/10">
          <span className="text-4xl mb-3 block">🔍</span>
          <h4 className="text-xl font-bold text-white mb-2">No titles found</h4>
          <p className="text-gray-400 text-sm">Try searching for a different keyword or title.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {results.map((item, idx) => {
            const isImporting = importingId === item.id;
            const resolvedSlug = getImportedSlug(item.id, item.title);
            const isImported = !!resolvedSlug;

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
                className={`group glass rounded-2xl overflow-hidden flex flex-col justify-between transition-all shadow-lg ${
                  isImported
                    ? 'border border-emerald-500/40 hover:border-emerald-400/60'
                    : 'border border-white/10 hover:border-accent/40'
                }`}
              >
                <div>
                  {/* Cover */}
                  <div className="relative aspect-[3/4] overflow-hidden bg-white/5">
                    <img
                      src={item.coverUrl}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-85" />

                    {/* Already imported overlay */}
                    {isImported && (
                      <div className="absolute inset-0 bg-emerald-900/30 flex items-center justify-center">
                        <div className="bg-emerald-500/90 backdrop-blur-sm text-white text-xs font-black px-3 py-1.5 rounded-full border border-emerald-400/50 shadow-lg flex items-center gap-1.5">
                          <span>✓</span><span>En tu biblioteca</span>
                        </div>
                      </div>
                    )}

                    {/* Top badges */}
                    <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[90%] font-semibold">
                      {item.type && (
                        <span className="bg-background/80 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-white/10">
                          {item.type}
                        </span>
                      )}
                      {item.status && (
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                          item.status === 'ONGOING'
                            ? 'bg-emerald-500/85 text-white border-emerald-500/20'
                            : item.status === 'COMPLETED'
                            ? 'bg-blue-500/85 text-white border-blue-500/20'
                            : 'bg-yellow-500/85 text-white border-yellow-500/20'
                        }`}>
                          {item.status}
                        </span>
                      )}
                    </div>

                    {/* Readable chapters indicator */}
                    <div className="absolute bottom-3 left-3 right-3">
                      <div className="flex flex-wrap gap-1 items-center">
                        <span className="bg-emerald-600/90 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-400/30 flex items-center gap-1">
                          ✓ Readable
                        </span>
                        {item.lastChapter && (
                          <span className="bg-accent/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                            {item.lastChapter}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <h4 className="text-lg font-bold text-white line-clamp-1 mb-1 group-hover:text-accent transition-colors">
                      {item.title}
                    </h4>
                    <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed mb-3">
                      {item.description || 'No description available.'}
                    </p>

                    <div className="flex flex-wrap gap-1 mb-4">
                      {item.author && (
                        <span className="text-[10px] bg-white/5 text-gray-300 px-2 py-0.5 rounded border border-white/5">
                          ✍️ {item.author}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Import Action Button */}
                <div className="p-4 pt-0">
                  {isImported ? (
                    <button
                      onClick={() => onSeriesImported(resolvedSlug!)}
                      className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all"
                    >
                      <span>✓ Ya importado • Ir a leer</span>
                      <span>→</span>
                    </button>
                  ) : (
                    <button
                      disabled={isImporting}
                      onClick={() => handleImport(item)}
                      className={`w-full font-bold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2 ${
                        isImporting
                          ? 'bg-accent/40 text-white cursor-wait'
                          : 'bg-accent hover:bg-accent/80 text-white shadow-glow'
                      }`}
                    >
                      {isImporting ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Importing Chapters...</span>
                        </>
                      ) : (
                        <>
                          <span>⚡ Import to Panelium</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};
