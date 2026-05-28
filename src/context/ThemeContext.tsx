import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';

type Theme = 'light' | 'dark' | 'neutral' | 'warm' | 'ocean' | 'minimal' | 'system';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  accentColor: string;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    return stored || 'light';
  });

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    if (stored === 'light' || stored === 'dark') return stored;
    if (stored === 'neutral' || stored === 'warm' || stored === 'ocean') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const accentColorMap: Record<string, string> = {
    light: '#ffffff',
    dark: '#ffffff',
    neutral: '#ffffff',
    warm: '#ffffff',
    ocean: '#ffffff',
  };

  const applyTheme = useCallback((t: 'light' | 'dark' | 'neutral' | 'warm' | 'ocean' | 'minimal') => {
    const root = document.documentElement;
    root.removeAttribute('data-theme');
    if (t !== 'light' && t !== 'dark') {
      root.setAttribute('data-theme', t);
    } else if (t === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    if (t === 'dark') {
      setResolvedTheme('dark');
    } else {
      setResolvedTheme('light');
    }
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem('theme', t);

    if (t === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(isDark ? 'dark' : 'light');
    } else if (t === 'light' || t === 'dark') {
      applyTheme(t);
    } else {
      applyTheme(t);
    }
  }, [applyTheme]);

  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    if (stored === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => {
        applyTheme(e.matches ? 'dark' : 'light');
      };
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [applyTheme]);

  useEffect(() => {
    if (theme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(isDark ? 'dark' : 'light');
    } else if (theme === 'light' || theme === 'dark') {
      applyTheme(theme);
    } else {
      applyTheme(theme);
    }
  }, []);

  const resolvedAccent = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? '#ffffff' : '#ffffff')
    : accentColorMap[theme] || '#ffffff';

  const value = useMemo(() => ({
    theme, resolvedTheme, setTheme, accentColor: resolvedAccent
  }), [theme, resolvedTheme, setTheme, resolvedAccent]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
