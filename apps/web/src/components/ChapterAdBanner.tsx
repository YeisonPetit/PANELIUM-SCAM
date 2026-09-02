import React, { useEffect, useRef } from 'react';

interface ChapterAdBannerProps {
  className?: string;
}

export const ChapterAdBanner: React.FC<ChapterAdBannerProps> = ({
  className = '',
}) => {
  const adContainerRef = useRef<HTMLDivElement>(null);
  const isProduction =
    import.meta.env.PROD &&
    typeof window !== 'undefined' &&
    !['localhost', '127.0.0.1'].includes(window.location.hostname);

  useEffect(() => {
    if (!isProduction) return;

    const container = adContainerRef.current;
    if (!container) return;

    // Clear previous contents on chapter transition
    container.innerHTML = '';

    // Create container div required by Adsterra
    const targetDiv = document.createElement('div');
    targetDiv.id = 'container-5dd8b0c74200491f13a97fb92625227c';
    container.appendChild(targetDiv);

    // Create and execute Adsterra script
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.async = true;
    script.setAttribute('data-cfasync', 'false');
    script.src = 'https://pl31140823.profitableratecpmnetwork.com/5dd8b0c74200491f13a97fb92625227c/invoke.js';
    container.appendChild(script);

    return () => {
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [isProduction]);

  return (
    <div className={`w-full max-w-3xl my-6 px-3 ${className}`}>
      <div className="glass rounded-2xl p-3 sm:p-4 border border-white/10 bg-white/[0.02] flex flex-col items-center justify-center min-h-[140px] text-center relative overflow-hidden transition-all hover:border-white/20 shadow-lg">
        
        {/* Subtle Label */}
        <span className="text-[9px] sm:text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-2 block">
          Sponsored {!isProduction && '(Modo Desarrollo - Inactivo)'}
        </span>

        {/* Adsterra Native Banner Injection Target */}
        {isProduction ? (
          <div
            ref={adContainerRef}
            className="w-full flex items-center justify-center min-h-[90px] overflow-hidden"
          />
        ) : (
          <div className="w-full flex flex-col items-center justify-center min-h-[90px] border border-dashed border-white/10 rounded-xl bg-white/[0.01] p-3 text-xs text-gray-400">
            <span className="font-medium text-gray-300">Espacio de Publicidad (Adsterra)</span>
            <span className="text-[11px] text-gray-500 mt-0.5">
              Script deshabilitado en entorno local para proteger tu cuenta de impresiones y clics inválidos.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChapterAdBanner;

