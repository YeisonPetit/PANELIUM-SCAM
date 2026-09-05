
import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass, faXmark } from '@fortawesome/free-solid-svg-icons';

interface GlobalSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  placeholder?: string;
  className?: string;
}

export const GlobalSearchBar: React.FC<GlobalSearchBarProps> = ({
  value,
  onChange,
  onFocus,
  placeholder = 'Search all manhwa, manga, or authors...',
  className = '',
}) => {
  return (
    <div className={`relative ${className}`}>
      <FontAwesomeIcon
        icon={faMagnifyingGlass}
        className="absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 text-rose-500 text-base sm:text-lg pointer-events-none"
      />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        className="w-full bg-white/5 border border-white/15 focus:border-rose-500 focus:bg-white/10 rounded-2xl pl-12 sm:pl-14 pr-12 py-3.5 sm:py-4 text-sm sm:text-base text-white placeholder-gray-400 outline-none transition-all shadow-inner"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 hover:text-white p-1 transition-colors"
          aria-label="Clear search"
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      )}
    </div>
  );
};
