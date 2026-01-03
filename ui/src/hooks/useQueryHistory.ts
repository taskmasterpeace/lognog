// Query history hook - persists recent queries to localStorage

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'lognog_query_history';
const MAX_HISTORY = 100;

export function useQueryHistory() {
  const [history, setHistory] = useState<string[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setHistory(parsed);
        }
      }
    } catch (err) {
      console.error('Failed to load query history:', err);
    }
  }, []);

  // Save to localStorage
  const saveHistory = useCallback((newHistory: string[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
    } catch (err) {
      console.error('Failed to save query history:', err);
    }
  }, []);

  // Add query to history
  const addQuery = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;

      // Skip if it's just a simple wildcard search
      if (trimmed === 'search *' || trimmed === '*') return;

      setHistory((prev) => {
        // Remove duplicates (case-insensitive)
        const filtered = prev.filter((q) => q.toLowerCase() !== trimmed.toLowerCase());
        // Add to front, limit size
        const newHistory = [trimmed, ...filtered].slice(0, MAX_HISTORY);
        saveHistory(newHistory);
        return newHistory;
      });
    },
    [saveHistory]
  );

  // Remove a specific query from history
  const removeQuery = useCallback(
    (query: string) => {
      setHistory((prev) => {
        const newHistory = prev.filter((q) => q !== query);
        saveHistory(newHistory);
        return newHistory;
      });
    },
    [saveHistory]
  );

  // Clear all history
  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    history,
    addQuery,
    removeQuery,
    clearHistory,
  };
}
