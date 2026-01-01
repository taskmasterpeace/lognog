import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getSystemTheme(): ResolvedTheme {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'system') {
    return getSystemTheme();
  }
  return theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    // Check localStorage first
    const stored = localStorage.getItem('lognog_theme') as Theme | null;
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
    return 'system';
  });

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(theme));

  // Load theme from preferences API when authenticated
  useEffect(() => {
    const loadPreferences = async () => {
      const token = localStorage.getItem('lognog_access_token');
      if (!token) return;

      try {
        const response = await fetch('/api/settings/preferences', {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          if (data.theme && (data.theme === 'light' || data.theme === 'dark' || data.theme === 'system')) {
            setThemeState(data.theme);
            localStorage.setItem('lognog_theme', data.theme);
          }
        }
      } catch (err) {
        console.error('Failed to load theme preference:', err);
      }
    };

    loadPreferences();
  }, []);

  // Apply theme to document
  useEffect(() => {
    const root = window.document.documentElement;
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);

    // Remove both classes first
    root.classList.remove('light', 'dark');

    // Add current theme class
    root.classList.add(resolved);

    // Persist to localStorage
    localStorage.setItem('lognog_theme', theme);
  }, [theme]);

  // Listen for system preference changes when using 'system' theme
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      if (theme === 'system') {
        const resolved = getSystemTheme();
        setResolvedTheme(resolved);
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(resolved);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      if (prev === 'light') return 'dark';
      if (prev === 'dark') return 'system';
      return 'light';
    });
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
  }, []);

  const value: ThemeContextType = {
    theme,
    resolvedTheme,
    toggleTheme,
    setTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
