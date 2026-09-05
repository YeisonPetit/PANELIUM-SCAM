import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faHouse,
  faCompass,
  faStar,
  faCloudArrowUp,
  faRightFromBracket,
  faUser,
  faMagnifyingGlass,
  faLock,
} from '@fortawesome/free-solid-svg-icons';
import { NotificationBell } from './NotificationBell';

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
  onGoLibrary: () => void;
  onGoFavorites: () => void;
  onOpenImporter: () => void;
  onOpenAuth: () => void;
  onOpenSearch?: () => void;
  onSelectChapter?: (slug: string, chapterNumber: number, chapterId: string) => void;
  activeView: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  health,
  onGoHome,
  onGoLibrary,
  onGoFavorites,
  onOpenImporter,
  onOpenAuth,
  onOpenSearch,
  onSelectChapter,
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
  const handleGoLibrary = () => { setMobileMenuOpen(false); onGoLibrary(); };
  const handleGoFavorites = () => {
    setMobileMenuOpen(false);
    if (!user) {
      onOpenAuth();
    } else {
      onGoFavorites();
    }
  };
  const handleOpenImporter = () => { setMobileMenuOpen(false); onOpenImporter(); };
  const handleOpenAuth = () => { setMobileMenuOpen(false); onOpenAuth(); };
  const handleOpenSearch = () => { setMobileMenuOpen(false); onOpenSearch?.(); };

  return (
    <header className="sticky top-0 z-50 glass border-b border-white/10 backdrop-blur-xl bg-background/80">
      {/* Main bar — fixed 48px height on mobile */}
      <div className="max-w-7xl mx-auto px-3 h-12 flex items-center justify-between gap-2">

        {/* Brand Logo — compact on tiny screens */}
        <div className="flex items-center gap-3">
          <motion.div
            onClick={handleGoHome}
            whileTap={{ scale: 0.96 }}
            className="cursor-pointer flex items-center gap-2 shrink-0 min-w-0"
          >
            <div className="w-7 h-7 rounded-full overflow-hidden border border-rose-500/40 shrink-0 shadow-glow">
              <img src="/favicon.png" alt="Panelium" className="w-full h-full object-cover" />
            </div>
            <span className="text-sm font-black tracking-tight leading-none whitespace-nowrap">
              Panelium<span className="text-accent">Scan</span>
            </span>
          </motion.div>

          {/* Quick Search Trigger (Desktop/Tablet) */}
          {onOpenSearch && (
            <button
              onClick={handleOpenSearch}
              className="hidden sm:flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-gray-400 hover:text-white px-3 py-1.5 rounded-xl text-xs font-medium transition-all shadow-inner group ml-2"
              title="Search Manhwa (Ctrl+K)"
            >
              <FontAwesomeIcon icon={faMagnifyingGlass} className="text-rose-500 group-hover:scale-110 transition-transform" />
              <span className="hidden lg:inline text-gray-300">Search manhwa...</span>
              <span className="lg:hidden text-gray-300">Search</span>
              <kbd className="text-[10px] bg-white/10 border border-white/10 text-gray-400 font-mono px-1.5 py-0.5 rounded ml-1">
                Ctrl K
              </kbd>
            </button>
          )}
        </div>

        {/* Desktop nav (md+) */}
        <div className="hidden md:flex items-center gap-2">
          {/* Status — admin only */}
          {isAdmin && (
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full text-xs font-semibold">
              <span className={`w-2 h-2 rounded-full ${pgOk && redisOk ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-gray-300">{pgOk && redisOk ? 'Online' : 'Connecting...'}</span>
            </div>
          )}

          <button
            onClick={handleGoHome}
            className={`px-3.5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              activeView === 'home' ? 'bg-accent text-white shadow-glow' : 'text-gray-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <FontAwesomeIcon icon={faHouse} className="text-xs" />
            Home
          </button>

          <button
            onClick={handleGoLibrary}
            className={`px-3.5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              activeView === 'library' ? 'bg-accent text-white shadow-glow' : 'text-gray-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <FontAwesomeIcon icon={faCompass} className="text-xs" />
            Browse
          </button>

          <button
            onClick={handleGoFavorites}
            className={`px-3.5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              activeView === 'favorites' ? 'bg-accent text-white shadow-glow' : 'text-gray-300 hover:bg-white/5 hover:text-white'
            }`}
            title={!user ? 'Sign in to access favorites' : 'My Favorites'}
          >
            <FontAwesomeIcon icon={faStar} className="text-xs text-amber-400" />
            <span>Favorites</span>
            {!user && (
              <span className="text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-md flex items-center gap-1 shadow-sm">
                <FontAwesomeIcon icon={faLock} className="text-[9px]" />
              </span>
            )}
          </button>

          {isAdmin && (
            <button
              onClick={handleOpenImporter}
              className={`px-3.5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                activeView === 'importer' ? 'bg-rose-600 text-white shadow-glow' : 'bg-white/5 hover:bg-white/10 text-rose-300 border border-rose-500/30'
              }`}
            >
              <FontAwesomeIcon icon={faCloudArrowUp} className="text-xs" />
              Importer
            </button>
          )}


          {onSelectChapter && (
            <NotificationBell
              onSelectChapter={onSelectChapter}
              onGoFavorites={handleGoFavorites}
              onOpenAuth={onOpenAuth}
            />
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
                      <p className="text-xs text-gray-400">Signed in as</p>
                      <p className="text-sm font-bold text-white truncate">{user.username}</p>
                      <span className="text-[10px] text-accent font-semibold">{user.email}</span>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => { setDropdownOpen(false); onOpenImporter(); }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-rose-300 hover:bg-rose-500/10 flex items-center gap-2 transition-all"
                      >
                        <FontAwesomeIcon icon={faCloudArrowUp} />
                        Importer Dashboard
                      </button>
                    )}
                    <button
                      onClick={() => { setDropdownOpen(false); logout(); }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-gray-300 hover:text-rose-400 hover:bg-white/5 flex items-center gap-2 transition-all"
                    >
                      <FontAwesomeIcon icon={faRightFromBracket} />
                      Sign Out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <button
            onClick={handleOpenAuth}
            className="bg-white/5 hover:bg-accent border border-white/15 hover:border-accent text-white font-bold px-4 py-2 rounded-xl text-sm transition-all flex items-center gap-2"
          >
            <FontAwesomeIcon icon={faUser} className="text-xs" />
            Sign In
          </button>
          )}
        </div>

        {/* Mobile right side */}
        <div className="flex md:hidden items-center gap-1.5 shrink-0">
          {onOpenSearch && (
            <button
              onClick={handleOpenSearch}
              className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-rose-400 hover:text-white flex items-center justify-center text-xs transition-all"
              aria-label="Search"
            >
              <FontAwesomeIcon icon={faMagnifyingGlass} />
            </button>
          )}

          {onSelectChapter && (
            <NotificationBell
              onSelectChapter={onSelectChapter}
              onGoFavorites={handleGoFavorites}
              onOpenAuth={onOpenAuth}
            />
          )}

          {user ? (
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-rose-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
              {user.username.charAt(0).toUpperCase()}
            </div>
          ) : (
            <button
              onClick={handleOpenAuth}
              className="bg-white/5 border border-white/15 text-white font-bold px-2.5 py-1 rounded-lg text-[11px] transition-all flex items-center"
            >
              <FontAwesomeIcon icon={faUser} className="text-xs" />
            </button>
          )}

          {/* Hamburger */}
          <button
            onClick={() => setMobileMenuOpen((p) => !p)}
            className="w-8 h-8 flex flex-col items-center justify-center gap-[5px] bg-white/5 border border-white/10 rounded-lg"
            aria-label="Menu"
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
                  <span className="text-[11px] text-gray-400 font-medium">{pgOk && redisOk ? 'Servers Online' : 'Connecting...'}</span>
                </div>
              )}

              <div className="h-px bg-white/5 my-1" />

              {onOpenSearch && (
                <button
                  onClick={handleOpenSearch}
                  className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2.5 text-gray-200 hover:bg-white/5"
                >
                  <FontAwesomeIcon icon={faMagnifyingGlass} className="w-4 text-rose-500" />
                  Search Comics
                </button>
              )}

              <button
                onClick={handleGoHome}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2.5 ${
                  activeView === 'home' ? 'bg-accent text-white' : 'text-gray-200'
                }`}
              >
                <FontAwesomeIcon icon={faHouse} className="w-4" />
                Home
              </button>

              <button
                onClick={handleGoLibrary}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2.5 ${
                  activeView === 'library' ? 'bg-accent text-white' : 'text-gray-200'
                }`}
              >
                <FontAwesomeIcon icon={faCompass} className="w-4" />
                Browse (All Comics)
              </button>

              <button
                onClick={handleGoFavorites}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-between ${
                  activeView === 'favorites' ? 'bg-accent text-white' : 'text-gray-200 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <FontAwesomeIcon icon={faStar} className="w-4 text-amber-400" />
                  <span>Favorites</span>
                </div>
                {!user && (
                  <span className="text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <FontAwesomeIcon icon={faLock} className="text-[9px]" />
                    Sign In
                  </span>
                )}
              </button>

              {isAdmin && (
                <button
                  onClick={handleOpenImporter}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2.5 ${
                    activeView === 'importer' ? 'bg-rose-600 text-white' : 'text-rose-300'
                  }`}
                >
                  <FontAwesomeIcon icon={faCloudArrowUp} className="w-4" />
                  Import Comics
                </button>
              )}


              <div className="h-px bg-white/5 my-1" />

              {user ? (
                <button
                  onClick={() => { setMobileMenuOpen(false); logout(); }}
                  className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold text-gray-300 flex items-center gap-2.5"
                >
                  <FontAwesomeIcon icon={faRightFromBracket} className="w-4" />
                  Sign Out
                </button>
              ) : (
                <button
                  onClick={handleOpenAuth}
                  className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold bg-accent/20 text-white flex items-center gap-2.5"
                >
                  <FontAwesomeIcon icon={faUser} className="w-4" />
                  Sign In / Register
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
