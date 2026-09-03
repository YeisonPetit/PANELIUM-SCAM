import React, { useEffect, useRef, useState } from 'react';

interface ChapterAdBannerProps {
  isChapterReady?: boolean;
  className?: string;
}

export const ChapterAdBanner: React.FC<ChapterAdBannerProps> = ({
  isChapterReady = false,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const adContainerRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [adLoaded, setAdLoaded] = useState(false);

  const isProduction =
    import.meta.env.PROD &&
    typeof window !== 'undefined' &&
    !['localhost', '127.0.0.1'].includes(window.location.hostname);

  // 1. Only observe viewport intersection once the chapter has actually finished loading
  useEffect(() => {
    if (!isChapterReady) {
      setIsInView(false);
      setAdLoaded(false);
      return;
    }

    const currentEl = containerRef.current;
    if (!currentEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '250px', // Load just as user approaches the end of chapter
      }
    );

    observer.observe(currentEl);

    return () => {
      observer.disconnect();
    };
  }, [isChapterReady]);

  // 2. Inject official Adsterra script into DOM once chapter is ready and user reaches the end
  useEffect(() => {
    if (!isProduction || !isChapterReady || !isInView) return;

    const container = adContainerRef.current;
    if (!container) return;

    // Clear previous contents on chapter transition
    container.innerHTML = '';

    // Create container div required by Adsterra Native Banner
    const targetDiv = document.createElement('div');
    targetDiv.id = 'container-5dd8b0c74200491f13a97fb92625227c';
    targetDiv.className = 'w-full flex items-center justify-center';
    container.appendChild(targetDiv);

    // Enforce target="_blank" on all Adsterra links so clicks open in a new tab
    // and never redirect or replace the reader
    const observer = new MutationObserver(() => {
      const links = targetDiv.querySelectorAll('a');
      links.forEach((a) => {
        if (a.getAttribute('target') !== '_blank') {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
        }
      });
    });
    observer.observe(targetDiv, { childList: true, subtree: true });

    // Inject official Adsterra invoke.js script
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.async = true;
    script.setAttribute('data-cfasync', 'false');
    script.src = 'https://pl31140823.profitableratecpmnetwork.com/5dd8b0c74200491f13a97fb92625227c/invoke.js';
    container.appendChild(script);

    setAdLoaded(true);

    return () => {
      observer.disconnect();
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [isProduction, isChapterReady, isInView]);

  return (
    <div ref={containerRef} className={`w-full max-w-4xl my-8 px-2 sm:px-4 ${className}`}>
      <div className="glass rounded-2xl p-4 sm:p-6 border border-white/10 bg-white/[0.02] flex flex-col items-center justify-center min-h-[160px] text-center relative transition-all hover:border-white/20 shadow-xl">
        
        {/* Subtle Label */}
        <span className="text-[10px] sm:text-[11px] uppercase tracking-widest text-gray-400 font-semibold mb-3 block">
          Sponsored {!isProduction && '(Modo Desarrollo - Inactivo)'}
        </span>

        {/* Target Container */}
        {isProduction ? (
          <div className="w-full flex flex-col items-center justify-center min-h-[100px]">
            {/* Loading state until chapter is fully ready & reached */}
            {(!isChapterReady || !isInView) && (
              <div className="flex items-center gap-2 text-xs text-gray-400 py-4">
                <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span>
                  {!isChapterReady
                    ? 'Cargando contenido...'
                    : 'Cargando patrocinador...'}
                </span>
              </div>
            )}

            <div
              ref={adContainerRef}
              className={`w-full flex items-center justify-center min-h-[100px] transition-opacity duration-300 ${
                adLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </div>
        ) : (
          <div className="w-full flex flex-col items-center justify-center min-h-[120px] border border-dashed border-white/10 rounded-xl bg-white/[0.01] p-4 text-xs text-gray-400">
            <span className="font-medium text-gray-300 text-sm mb-1">Espacio de Publicidad Oficial (Adsterra)</span>
            <span className="text-[11px] text-gray-500 max-w-md">
              {!isChapterReady
                ? '⏳ Esperando a que el capítulo y las páginas terminen de cargar.'
                : '✅ Capítulo listo. El script se ejecuta directamente en paneliumscan.com con target="_blank" para registrar 100% de impresiones y clics sin redirecciones.'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChapterAdBanner;

