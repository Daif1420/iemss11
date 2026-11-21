import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (next: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyThemeToDom(mode: ThemeMode) {
  const root = document.documentElement;
  root.setAttribute('data-theme', mode);
  if (mode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  try {
    localStorage.setItem('iems-theme', mode);
  } catch {
    // ignore storage errors
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      return localStorage.getItem('iems-theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    applyThemeToDom(theme);
  }, [theme]);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
