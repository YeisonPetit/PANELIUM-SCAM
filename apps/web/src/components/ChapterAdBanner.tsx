import React, { useEffect, useRef } from 'react';

interface ChapterAdBannerProps {
  slotId?: string;
  className?: string;
}

export const ChapterAdBanner: React.FC<ChapterAdBannerProps> = ({
  slotId = 'ad-chapter-bottom',
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // If third-party ad networks (like Adsterra or Monetag) need trigger on dynamic load
    try {
      if ((window as any).adsbygoogle) {
        ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
      }
    } catch (e) {
      // ignore
    }
  }, []);

  return (
    <div className={`w-full max-w-3xl my-6 px-3 ${className}`}>
      <div className="glass rounded-2xl p-3 sm:p-4 border border-white/5 bg-white/[0.02] flex flex-col items-center justify-center min-h-[120px] sm:min-h-[160px] text-center relative overflow-hidden transition-all hover:border-white/10">
        
        {/* Subtle Label */}
        <span className="text-[9px] sm:text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-2 block">
          Sponsored
        </span>

        {/* Ad Insertion Container */}
        <div
          id={slotId}
          ref={containerRef}
          className="w-full flex items-center justify-center min-h-[90px] text-xs text-gray-400"
        >
          {/* Default Clean Fallback / Ad Placement Target */}
          <div className="border border-dashed border-white/10 rounded-xl w-full max-w-[728px] h-[90px] flex flex-col items-center justify-center p-3 text-center">
            <span className="text-[11px] font-semibold text-gray-400 tracking-wide">
              Panelium Scan Ad Space
            </span>
            <span className="text-[10px] text-gray-400 mt-0.5">
              High-CTR Clean Banner Slot (728x90 / 300x250)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChapterAdBanner;
