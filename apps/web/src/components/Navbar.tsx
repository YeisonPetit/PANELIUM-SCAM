import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';

interface HealthState {
  status: string;
  services?: {
    postgres?: string;
    redis?: string;
  };
}

interface NavbarProps {
  health: HealthState | null;
  onGoHome: () => void;
  onOpenImporter: () => void;
  onOpenAuth: () => void;
  activeView: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  health,
  onGoHome,
  onOpenImporter,
  onOpenAuth,
  activeView,
}) => {
  const { user, isAdmin, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const pgOk = health?.services?.postgres === 'connected';
  const redisOk = health?.services?.redis === 'connected';

  return (
    <header className="sticky top-0 z-50 glass border-b border-white/10 backdrop-blur-xl bg-background/80 px-4 sm:px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand Logo */}
        <motion.div
          onClick={onGoHome}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="cursor-pointer flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-xl overflow-hidden border border-rose-500/40 shadow-glow bg-black/60 flex items-center justify-center shrink-0">
            <img
              src="/logo.jpg"
              alt="Panelium Scan Logo"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight leading-none">
              Panelium<span className="text-accent">Scan</span>
            </h1>
            <span className="text-[10px] text-gray-400 font-medium tracking-widest uppercase">
              Premium Webtoon Reader
            </span>
          </div>
        </motion.div>

        {/* Status Indicator */}
        <div className="hidden lg:flex items-center gap-2 bg-white/5 border border-white/10 px-3.5 py-1.5 rounded-full text-xs font-semibold">
          <span
            className={`w-2 h-2 rounded-full ${
              pgOk && redisOk ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`}
          />
          <span className="text-gray-300">
            {pgOk && redisOk ? 'Servidores Online' : 'Sincronizando'}
          </span>
        </div>

        {/* Navigation Actions & User Menu */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <button
            onClick={onGoHome}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeView === 'catalog'
                ? 'bg-accent text-white shadow-glow'
                : 'text-gray-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            Catálogo
          </button>

          {/* Admin-only Import Button */}
          {isAdmin && (
            <button
              onClick={onOpenImporter}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 ${
                activeView === 'importer'
                  ? 'bg-rose-600 text-white shadow-glow'
                  : 'bg-white/5 hover:bg-white/10 text-rose-300 border border-rose-500/30'
              }`}
            >
              <span>🌐 Importar</span>
            </button>
          )}

          {/* User Section */}
          {user ? (
            <div className="relative">
              <button
                onClick={() => setDropdownOpen((prev) => !prev)}
                className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-xl transition-all"
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-rose-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs sm:text-sm font-bold text-gray-200 hidden sm:inline max-w-[100px] truncate">
                  {user.username}
                </span>
                {isAdmin && (
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md">
                    Admin
                  </span>
                )}
              </button>

              {/* User Dropdown */}
              <AnimatePresence>
                {dropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-48 glass rounded-2xl border border-white/15 p-2 shadow-2xl z-50 bg-[#12131A]"
                  >
                    <div className="px-3 py-2 border-b border-white/5 mb-1">
                      <p className="text-xs text-gray-400">Conectado como</p>
                      <p className="text-sm font-bold text-white truncate">{user.username}</p>
                      <span className="text-[10px] text-accent font-semibold">{user.email}</span>
                    </div>

                    {isAdmin && (
                      <button
                        onClick={() => {
                          setDropdownOpen(false);
                          onOpenImporter();
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-rose-300 hover:bg-rose-500/10 flex items-center gap-2 transition-all"
                      >
                        <span>⚙️ Panel de Importación</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        logout();
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-gray-300 hover:text-rose-400 hover:bg-white/5 flex items-center gap-2 transition-all"
                    >
                      <span>🚪 Cerrar Sesión</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="bg-white/5 hover:bg-accent border border-white/15 hover:border-accent text-white font-bold px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm shadow-sm transition-all flex items-center gap-1.5"
            >
              <span>👤 Entrar</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
