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

  const handleGoHome = () => { setMobileMenuOpen(false); onGoHome(); };
  const handleOpenImporter = () => { setMobileMenuOpen(false); onOpenImporter(); };
  const handleOpenAuth = () => { setMobileMenuOpen(false); onOpenAuth(); };

  return (
    <header className="sticky top-0 z-50 glass border-b border-white/10 backdrop-blur-xl bg-background/80">
      {/* Main bar — fixed 48px height on mobile */}
      <div className="max-w-7xl mx-auto px-3 h-12 flex items-center justify-between gap-2">

        {/* Brand Logo — compact on tiny screens */}
        <motion.div
          onClick={handleGoHome}
          whileTap={{ scale: 0.96 }}
          className="cursor-pointer flex items-center gap-2 shrink-0 min-w-0"
        >
          <div className="w-7 h-7 rounded-lg overflow-hidden border border-rose-500/40 shrink-0">
            <img src="/logo.jpg" alt="Panelium" className="w-full h-full object-cover" />
          </div>
          <span className="text-sm font-black tracking-tight leading-none whitespace-nowrap">
            Panelium<span className="text-accent">Scan</span>
          </span>
        </motion.div>

        {/* Desktop nav (md+) */}
        <div className="hidden md:flex items-center gap-2">
          {/* Status — admin only */}
          {isAdmin && (
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full text-xs font-semibold">
              <span className={`w-2 h-2 rounded-full ${pgOk && redisOk ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-gray-300">{pgOk && redisOk ? 'Online' : 'Conectando...'}</span>
            </div>
          )}

          <button
            onClick={handleGoHome}
            className={`px-3.5 py-2 rounded-xl text-sm font-bold transition-all ${
              activeView === 'catalog' ? 'bg-accent text-white shadow-glow' : 'text-gray-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            Catálogo
          </button>

          {isAdmin && (
            <button
              onClick={handleOpenImporter}
              className={`px-3.5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 ${
                activeView === 'importer' ? 'bg-rose-600 text-white shadow-glow' : 'bg-white/5 hover:bg-white/10 text-rose-300 border border-rose-500/30'
              }`}
            >
              🌐 Importar
            </button>
          )}

          {user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen((p) => !p)}
                className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-xl transition-all"
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-rose-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-bold text-gray-200 max-w-[100px] truncate">{user.username}</span>
                {isAdmin && (
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md">Admin</span>
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
              className="bg-white/5 hover:bg-accent border border-white/15 hover:border-accent text-white font-bold px-4 py-2 rounded-xl text-sm transition-all"
            >
              👤 Entrar
            </button>
          )}
        </div>

        {/* Mobile right side */}
        <div className="flex md:hidden items-center gap-1.5 shrink-0">
          {user ? (
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-rose-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
              {user.username.charAt(0).toUpperCase()}
            </div>
          ) : (
            <button
              onClick={handleOpenAuth}
              className="bg-white/5 border border-white/15 text-white font-bold px-2.5 py-1 rounded-lg text-[11px] transition-all"
            >
              👤
            </button>
          )}

          {/* Hamburger */}
          <button
            onClick={() => setMobileMenuOpen((p) => !p)}
            className="w-8 h-8 flex flex-col items-center justify-center gap-[5px] bg-white/5 border border-white/10 rounded-lg"
            aria-label="Menú"
          >
            <motion.span
              animate={mobileMenuOpen ? { rotate: 45, y: 7 } : { rotate: 0, y: 0 }}
              transition={{ duration: 0.18 }}
              className="w-4 h-[2px] bg-white rounded-full block"
            />
            <motion.span
              animate={mobileMenuOpen ? { opacity: 0, scaleX: 0 } : { opacity: 1, scaleX: 1 }}
              transition={{ duration: 0.12 }}
              className="w-4 h-[2px] bg-white rounded-full block"
            />
            <motion.span
              animate={mobileMenuOpen ? { rotate: -45, y: -7 } : { rotate: 0, y: 0 }}
              transition={{ duration: 0.18 }}
              className="w-4 h-[2px] bg-white rounded-full block"
            />
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            ref={mobileMenuRef}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="md:hidden overflow-hidden border-t border-white/10 bg-[#0d0d12]/96 backdrop-blur-xl"
          >
            <div className="px-3 py-3 flex flex-col gap-1">
              {/* User info */}
              {user && (
                <div className="flex items-center gap-2.5 px-3 py-2.5 mb-1 bg-white/5 rounded-2xl border border-white/10">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-500 to-purple-600 flex items-center justify-center text-white font-black text-xs shrink-0">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-white truncate">{user.username}</p>
                      {isAdmin && (
                        <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md shrink-0">Admin</span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 truncate">{user.email}</p>
                  </div>
                </div>
              )}

              {/* Status — admin only */}
              {isAdmin && (
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${pgOk && redisOk ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  <span className="text-[11px] text-gray-400 font-medium">{pgOk && redisOk ? 'Servidores Online' : 'Conectando...'}</span>
                </div>
              )}

              <div className="h-px bg-white/5 my-1" />

              <button
                onClick={handleGoHome}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2.5 ${
                  activeView === 'catalog' ? 'bg-accent text-white' : 'text-gray-200'
                }`}
              >
                📚 Catálogo
              </button>

              {isAdmin && (
                <button
                  onClick={handleOpenImporter}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2.5 ${
                    activeView === 'importer' ? 'bg-rose-600 text-white' : 'text-rose-300'
                  }`}
                >
                  🌐 Importar Series
                </button>
              )}

              <div className="h-px bg-white/5 my-1" />

              {user ? (
                <button
                  onClick={() => { setMobileMenuOpen(false); logout(); }}
                  className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold text-gray-300 flex items-center gap-2.5"
                >
                  🚪 Cerrar Sesión
                </button>
              ) : (
                <button
                  onClick={handleOpenAuth}
                  className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold bg-accent/20 text-white flex items-center gap-2.5"
                >
                  👤 Iniciar Sesión / Registrarse
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
