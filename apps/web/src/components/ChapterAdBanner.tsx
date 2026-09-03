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

  // 2. Inject ad into an isolated sandboxed iframe only after chapter is ready & in view
  useEffect(() => {
    if (!isProduction || !isChapterReady || !isInView) return;

    const targetDiv = adContainerRef.current;
    if (!targetDiv) return;

    // Small stabilization delay so layout is completely settled
    const timer = setTimeout(() => {
      targetDiv.innerHTML = '';

      // Create isolated sandboxed iframe:
      // Notice: NO 'allow-top-navigation' - this strictly blocks third-party scripts
      // from redirecting Panelium Scan or hijacking browser history / back button.
      const iframe = document.createElement('iframe');
      iframe.setAttribute(
        'sandbox',
        'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox'
      );
      iframe.setAttribute('title', 'Sponsored Advertisement');
      iframe.setAttribute('loading', 'lazy');
      iframe.style.width = '100%';
      iframe.style.minHeight = '140px';
      iframe.style.border = 'none';
      iframe.style.overflow = 'hidden';
      iframe.style.background = 'transparent';

      iframe.srcdoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <base target="_blank">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: transparent;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100px;
      overflow: hidden;
      font-family: system-ui, -apple-system, sans-serif;
    }
  </style>
</head>
<body>
  <div id="container-5dd8b0c74200491f13a97fb92625227c"></div>
  <script type="text/javascript" data-cfasync="false" src="https://pl31140823.profitableratecpmnetwork.com/5dd8b0c74200491f13a97fb92625227c/invoke.js"></script>
</body>
</html>`;

      targetDiv.appendChild(iframe);
      setAdLoaded(true);
    }, 600);

    return () => {
      clearTimeout(timer);
      if (targetDiv) {
        targetDiv.innerHTML = '';
      }
    };
  }, [isProduction, isChapterReady, isInView]);

  return (
    <div ref={containerRef} className={`w-full max-w-3xl my-6 px-3 ${className}`}>
      <div className="glass rounded-2xl p-3 sm:p-4 border border-white/10 bg-white/[0.02] flex flex-col items-center justify-center min-h-[140px] text-center relative overflow-hidden transition-all hover:border-white/20 shadow-lg">
        
        {/* Subtle Label */}
        <span className="text-[9px] sm:text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-2 block">
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
                    ? 'Cargando capítulo antes de mostrar publicidad...'
                    : 'Cargando patrocinador...'}
                </span>
              </div>
            )}

            <div
              ref={adContainerRef}
              className={`w-full flex items-center justify-center min-h-[90px] overflow-hidden transition-opacity duration-300 ${
                adLoaded ? 'opacity-100' : 'opacity-0 h-0 min-h-0'
              }`}
            />
          </div>
        ) : (
          <div className="w-full flex flex-col items-center justify-center min-h-[90px] border border-dashed border-white/10 rounded-xl bg-white/[0.01] p-3 text-xs text-gray-400">
            <span className="font-medium text-gray-300">Espacio de Publicidad (Adsterra)</span>
            <span className="text-[11px] text-gray-500 mt-0.5">
              {!isChapterReady
                ? '⏳ Esperando a que el capítulo y las imágenes terminen de cargar.'
                : '✅ Capítulo listo. El anuncio se activará de forma aislada en producción sin redirigir al lector.'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChapterAdBanner;

