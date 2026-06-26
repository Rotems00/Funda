import React, { useState, useRef, useEffect } from 'react';
import { useSearch, SearchSuggestion } from '../hooks/useSearch';
import { CompanyLogo } from './CompanyLogo';

interface TickerAutocompleteProps {
  onSelectTicker: (ticker: string) => void;
}

export const TickerAutocomplete: React.FC<TickerAutocompleteProps> = ({ onSelectTicker }) => {
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const { suggestions, loading } = useSearch(query);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (ticker: string) => {
    setQuery(ticker);
    onSelectTicker(ticker);
    setShowDropdown(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim()) {
      handleSelect(query.toUpperCase());
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  return (
    <div className="ticker-autocomplete" ref={dropdownRef}>
      <div className="search-input-wrapper">
        <input
          type="text"
          className="search-input"
          placeholder="Search ticker (e.g., MELI, NVDA, PLTR)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value.toUpperCase());
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
        />
        {loading && <span className="search-loading">⟳</span>}
      </div>

      {showDropdown && query.length > 0 && (
        <div className="autocomplete-dropdown">
          {loading && (
            <div className="dropdown-item loading">Searching...</div>
          )}

          {!loading && suggestions.length > 0 && (
            <>
              {suggestions.map((suggestion: SearchSuggestion) => (
                <div
                  key={suggestion.ticker}
                  className="dropdown-item"
                  onClick={() => handleSelect(suggestion.ticker)}
                >
                  <CompanyLogo ticker={suggestion.ticker} className="suggestion-logo" />
                  <div className="suggestion-ticker">{suggestion.ticker}</div>
                  <div className="suggestion-details">
                    <div className="suggestion-name">{suggestion.name}</div>
                    <div className="suggestion-sector">{suggestion.sector}</div>
                  </div>
                </div>
              ))}
            </>
          )}

          {!loading && query.length > 0 && suggestions.length === 0 && (
            <div className="dropdown-item no-results">No stocks found</div>
          )}
        </div>
      )}
    </div>
  );
};
