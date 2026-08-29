import React from 'react';
import { motion } from 'framer-motion';

interface NotFoundProps {
  onGoHome: () => void;
}

export const NotFound: React.FC<NotFoundProps> = ({ onGoHome }) => {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-6 py-20 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="glass p-10 sm:p-14 rounded-3xl border border-white/10 max-w-lg shadow-2xl relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-rose-600/15 via-transparent to-purple-600/15 pointer-events-none" />
        
        <div className="w-16 h-16 rounded-2xl overflow-hidden border border-rose-500/40 shadow-glow bg-black/60 mx-auto mb-4">
          <img src="/logo.jpg" alt="Panelium Scan" className="w-full h-full object-cover" />
        </div>

        <span className="text-6xl sm:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-purple-500 mb-4 block">
          404
        </span>

        <h2 className="text-2xl sm:text-3xl font-black text-white mb-3">
          Page Not Found
        </h2>

        <p className="text-gray-400 text-sm sm:text-base leading-relaxed mb-8">
          The comic or chapter you're looking for doesn't exist or has been moved. Head back to the catalog to keep exploring.
        </p>

        <button
          onClick={onGoHome}
          className="bg-accent hover:bg-accent/80 text-white font-bold px-8 py-3.5 rounded-2xl shadow-glow transition-all flex items-center justify-center gap-2 mx-auto"
        >
          <span>← Back to Catalog</span>
        </button>
      </motion.div>
    </div>

  );
};

export default NotFound;
