import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBell,
  faCheck,
  faBolt,
  faStar,
  faLock,
  faBookOpen,
} from '@fortawesome/free-solid-svg-icons';

export interface NotificationItem {
  id: string;
  type: 'NEW_CHAPTER' | 'MULTIPLE_NEW' | 'START_READING' | 'UP_TO_DATE';
  chapterId: string;
  chapterNumber: number;
  chapterTitle?: string | null;
  seriesId: string;
  seriesTitle: string;
  seriesSlug: string;
  seriesCover: string;
  message: string;
  badgeText: string;
  unreadCount: number;
  createdAt: string;
  isRead: boolean;
}

interface NotificationBellProps {
  onSelectChapter: (seriesSlug: string, chapterNumber: number, chapterId: string) => void;
  onGoFavorites: () => void;
  onOpenAuth: () => void;
}

function timeAgo(dateStr?: string): string {
  if (!dateStr) return 'Just now';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  onSelectChapter,
  onGoFavorites,
  onOpenAuth,
}) => {
  const { token, user } = useAuth();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    if (!token || !user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    try {
      const res = await fetch('/api/user/notifications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  }, [token, user]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 45000); // Poll every 45s
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTriggerClick = () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    setIsOpen((prev) => !prev);
  };

  const handleMarkAllRead = async () => {
    if (!token) return;
    const unreadIds = notifications.filter((n) => !n.isRead).map((n) => n.chapterId);
    if (unreadIds.length === 0) return;

    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);

    try {
      await fetch('/api/user/notifications/mark-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ chapterIds: unreadIds }),
      });
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    setIsOpen(false);
    if (!notif.isRead && token) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      fetch('/api/user/notifications/mark-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ chapterIds: [notif.chapterId] }),
      }).catch(console.error);
    }

    onSelectChapter(notif.seriesSlug, notif.chapterNumber, notif.chapterId);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={handleTriggerClick}
        className="relative w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-gray-300 hover:text-white flex items-center justify-center text-xs transition-all group"
        title={user ? 'Chapter Updates' : 'Sign in to get chapter notifications'}
        aria-label="Notifications"
      >
        <FontAwesomeIcon
          icon={faBell}
          className={`${unreadCount > 0 ? 'text-rose-400 animate-bounce' : 'group-hover:scale-110'} transition-transform`}
        />
        
        {/* Unread badge for logged in users */}
        {user && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-rose-500 text-white font-black text-[10px] px-1 rounded-full flex items-center justify-center shadow-[0_0_12px_rgba(244,63,94,0.8)]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}

        {/* Small Lock indicator for guest users */}
        {!user && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-500/90 text-black text-[8px] rounded-full flex items-center justify-center font-bold shadow-sm">
            <FontAwesomeIcon icon={faLock} />
          </span>
        )}
      </button>

      {/* Dropdown Menu (Logged in only) */}
      <AnimatePresence>
        {isOpen && user && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#0F1015]/95 border border-white/15 rounded-2xl shadow-2xl backdrop-blur-2xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faBolt} className="text-rose-500 text-xs" />
                  Favorites Updates
                </span>
                {unreadCount > 0 && (
                  <span className="bg-rose-500/20 text-rose-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-rose-500/30">
                    {unreadCount} new
                  </span>
                )}
              </div>

              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1 font-semibold transition-colors"
                >
                  <FontAwesomeIcon icon={faCheck} className="text-[10px]" />
                  Mark all read
                </button>
              )}
            </div>

            {/* Notifications List */}
            <div className="max-h-[380px] overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
              {notifications.length === 0 ? (
                <div className="py-10 px-4 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-3 text-gray-400">
                    <FontAwesomeIcon icon={faBell} className="text-base" />
                  </div>
                  <p className="text-sm font-bold text-white mb-1">No updates right now</p>
                  <p className="text-xs text-gray-400 max-w-xs mx-auto mb-4">
                    Add manhwas to your Favorites to receive updates when new chapters release.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onGoFavorites();
                    }}
                    className="text-xs text-amber-300 hover:underline inline-flex items-center gap-1 font-semibold"
                  >
                    <FontAwesomeIcon icon={faStar} className="text-[10px]" />
                    Go to Favorites
                  </button>
                </div>
              ) : (
                notifications.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${
                      !item.isRead
                        ? 'bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.08)]'
                        : 'hover:bg-white/5 border border-white/5 bg-white/[0.02]'
                    }`}
                  >
                    {/* Comic Thumbnail */}
                    <div className="w-11 h-16 rounded-lg overflow-hidden shrink-0 border border-white/10 bg-white/5 shadow-sm">
                      <img
                        src={item.seriesCover}
                        alt={item.seriesTitle}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <h4 className="text-xs font-bold text-white truncate max-w-[170px]">
                          {item.seriesTitle}
                        </h4>
                        <span className="text-[10px] text-gray-400 shrink-0">
                          {timeAgo(item.createdAt)}
                        </span>
                      </div>

                      {/* Message text */}
                      <p
                        className={`text-xs font-semibold leading-tight ${
                          item.type === 'NEW_CHAPTER' || item.type === 'MULTIPLE_NEW'
                            ? 'text-rose-400'
                            : item.type === 'START_READING'
                            ? 'text-amber-300'
                            : 'text-gray-300'
                        }`}
                      >
                        {item.message}
                      </p>

                      {/* Pill Badge */}
                      <div className="flex items-center gap-2 mt-1.5">
                        <span
                          className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md flex items-center gap-1 ${
                            item.type === 'NEW_CHAPTER' || item.type === 'MULTIPLE_NEW'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : item.type === 'START_READING'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-white/10 text-gray-400 border border-white/10'
                          }`}
                        >
                          {item.type === 'START_READING' ? (
                            <FontAwesomeIcon icon={faBookOpen} className="text-[8px]" />
                          ) : (
                            <FontAwesomeIcon icon={faBolt} className="text-[8px]" />
                          )}
                          {item.badgeText}
                        </span>
                      </div>
                    </div>

                    {/* Unread red dot */}
                    {!item.isRead && (
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0 shadow-[0_0_10px_rgba(244,63,94,0.9)] animate-pulse" />
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="p-2 border-t border-white/5 bg-black/20 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onGoFavorites();
                  }}
                  className="text-xs text-gray-400 hover:text-white font-semibold transition-colors"
                >
                  Manage all favorites →
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBell;

