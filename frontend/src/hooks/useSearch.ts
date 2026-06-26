import { useState, useEffect } from 'react';
import axios from 'axios';

export interface SearchSuggestion {
  ticker: string;
  name: string;
  sector: string;
}

interface UseSearchReturn {
  suggestions: SearchSuggestion[];
  loading: boolean;
  error: string | null;
}

const API_BASE = '/api';

export function useSearch(query: string): UseSearchReturn {
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query || query.trim().length === 0) {
      setSuggestions([]);
      setError(null);
      return;
    }

    // Debounce search to avoid too many requests
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await axios.get(`${API_BASE}/stocks/search?q=${encodeURIComponent(query)}`);
        setSuggestions(response.data.suggestions || []);
      } catch (err) {
        const errorMsg = axios.isAxiosError(err) 
          ? err.response?.data?.error || 'Failed to search stocks'
          : 'An error occurred';
        setError(errorMsg);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [query]);

  return { suggestions, loading, error };
}
