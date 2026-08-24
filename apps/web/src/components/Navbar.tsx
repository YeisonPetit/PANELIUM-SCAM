import React, { useState, useEffect, useRef } from 'react';
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const pgOk = health?.services?.postgres === 'connected';
  const redisOk = health?.services?.redis === 'connected';

  // Close menus when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Close mobile menu on route changes
  const handleGoHome = () => {
    setMobileMenuOpen(false);
    onGoHome();
  };
  const handleOpenImporter = () => {
    setMobileMenuOpen(false);
    onOpenImporter();
  };
  const handleOpenAuth = () => {
    setMobileMenuOpen(false);
    onOpenAuth();
  };

  return (
    <header className="sticky top-0 z-50 glass border-b border-white/10 backdrop-blur-xl bg-background/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">

        {/* Brand Logo */}
        <motion.div
          onClick={handleGoHome}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="cursor-pointer flex items-center gap-2.5 shrink-0"
        >
          <div className="w-8 h-8 rounded-lg overflow-hidden border border-rose-500/40 shadow-glow bg-black/60 shrink-0">
            <img
              src="/logo.jpg"
              alt="Panelium Scan"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight leading-none">
              Panelium<span className="text-accent">Scan</span>
            </h1>
            <span className="text-[9px] text-gray-400 font-medium tracking-widest uppercase hidden sm:block">
              Premium Webtoon Reader
            </span>
          </div>
        </motion.div>

        {/* Desktop nav (md+) */}
        <div className="hidden md:flex items-center gap-2.5">
          {/* Status */}
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full text-xs font-semibold">
            <span
              className={`w-2 h-2 rounded-full ${
                pgOk && redisOk ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="text-gray-300">
              {pgOk && redisOk ? 'Online' : 'Conectando...'}
            </span>
          </div>

          <button
            onClick={handleGoHome}
            className={`px-3.5 py-2 rounded-xl text-sm font-bold transition-all ${
              activeView === 'catalog'
                ? 'bg-accent text-white shadow-glow'
                : 'text-gray-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            Catálogo
          </button>

          {isAdmin && (
            <button
              onClick={handleOpenImporter}
              className={`px-3.5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 ${
                activeView === 'importer'
                  ? 'bg-rose-600 text-white shadow-glow'
                  : 'bg-white/5 hover:bg-white/10 text-rose-300 border border-rose-500/30'
              }`}
            >
              🌐 Importar
            </button>
          )}

          {/* Desktop user menu */}
          {user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen((p) => !p)}
                className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-xl transition-all"
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-rose-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-bold text-gray-200 max-w-[100px] truncate">
                  {user.username}
                </span>
                {isAdmin && (
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md">
                    Admin
                  </span>
                )}
              </button>

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
                        onClick={() => { setDropdownOpen(false); onOpenImporter(); }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-rose-300 hover:bg-rose-500/10 flex items-center gap-2 transition-all"
                      >
                        ⚙️ Panel de Importación
                      </button>
                    )}
                    <button
                      onClick={() => { setDropdownOpen(false); logout(); }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-gray-300 hover:text-rose-400 hover:bg-white/5 flex items-center gap-2 transition-all"
                    >
                      🚪 Cerrar Sesión
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <button
              onClick={handleOpenAuth}
              className="bg-white/5 hover:bg-accent border border-white/15 hover:border-accent text-white font-bold px-4 py-2 rounded-xl text-sm shadow-sm transition-all flex items-center gap-1.5"
            >
              👤 Entrar
            </button>
          )}
        </div>

        {/* Mobile right side: user avatar + hamburger */}
        <div className="flex md:hidden items-center gap-2">
          {/* Quick user avatar on mobile */}
          {user ? (
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-rose-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
              {user.username.charAt(0).toUpperCase()}
            </div>
          ) : (
            <button
              onClick={handleOpenAuth}
              className="bg-white/5 border border-white/15 text-white font-bold px-3 py-1.5 rounded-xl text-xs transition-all"
            >
              👤 Entrar
            </button>
          )}

          {/* Hamburger Button */}
          <button
            onClick={() => setMobileMenuOpen((p) => !p)}
            className="w-9 h-9 flex flex-col items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
            aria-label="Abrir menú"
          >
            <motion.span
              animate={mobileMenuOpen ? { rotate: 45, y: 7 } : { rotate: 0, y: 0 }}
              transition={{ duration: 0.2 }}
              className="w-4 h-0.5 bg-white rounded-full block"
            />
            <motion.span
              animate={mobileMenuOpen ? { opacity: 0 } : { opacity: 1 }}
              transition={{ duration: 0.15 }}
              className="w-4 h-0.5 bg-white rounded-full block"
            />
            <motion.span
              animate={mobileMenuOpen ? { rotate: -45, y: -7 } : { rotate: 0, y: 0 }}
              transition={{ duration: 0.2 }}
              className="w-4 h-0.5 bg-white rounded-full block"
            />
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            ref={mobileMenuRef}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="md:hidden overflow-hidden border-t border-white/10 bg-[#0d0d12]/95 backdrop-blur-xl"
          >
            <div className="px-4 py-3 flex flex-col gap-1">

              {/* User info if logged in */}
              {user && (
                <div className="flex items-center gap-3 px-3 py-2.5 mb-1 bg-white/5 rounded-2xl border border-white/10">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-500 to-purple-600 flex items-center justify-center text-white font-black text-sm shrink-0">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-white truncate">{user.username}</p>
                      {isAdmin && (
                        <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md shrink-0">
                          Admin
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 truncate">{user.email}</p>
                  </div>
                </div>
              )}

              {/* Status */}
              <div className="flex items-center gap-2 px-3 py-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${pgOk && redisOk ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <span className="text-xs text-gray-400 font-medium">
                  {pgOk && redisOk ? 'Servidores Online' : 'Conectando...'}
                </span>
              </div>

              <div className="h-px bg-white/5 my-1" />

              {/* Catálogo */}
              <button
                onClick={handleGoHome}
                className={`w-full text-left px-4 py-3 rounded-2xl text-sm font-bold transition-all flex items-center gap-3 ${
                  activeView === 'catalog'
                    ? 'bg-accent text-white shadow-glow'
                    : 'text-gray-200 hover:bg-white/5'
                }`}
              >
                <span>📚</span> Catálogo
              </button>

              {/* Admin import */}
              {isAdmin && (
                <button
                  onClick={handleOpenImporter}
                  className={`w-full text-left px-4 py-3 rounded-2xl text-sm font-bold transition-all flex items-center gap-3 ${
                    activeView === 'importer'
                      ? 'bg-rose-600 text-white'
                      : 'text-rose-300 hover:bg-rose-500/10'
                  }`}
                >
                  <span>🌐</span> Importar Series
                </button>
              )}

              <div className="h-px bg-white/5 my-1" />

              {/* Login / Logout */}
              {user ? (
                <button
                  onClick={() => { setMobileMenuOpen(false); logout(); }}
                  className="w-full text-left px-4 py-3 rounded-2xl text-sm font-semibold text-gray-300 hover:text-rose-400 hover:bg-white/5 transition-all flex items-center gap-3"
                >
                  <span>🚪</span> Cerrar Sesión
                </button>
              ) : (
                <button
                  onClick={handleOpenAuth}
                  className="w-full text-left px-4 py-3 rounded-2xl text-sm font-bold bg-accent/20 hover:bg-accent text-white transition-all flex items-center gap-3"
                >
                  <span>👤</span> Iniciar Sesión / Registrarse
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Navbar;
