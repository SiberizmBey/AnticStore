import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { AccentColor, ThemeMode, UIStyle } from '../types';

export const ACCENT_PALETTES: Record<
  AccentColor,
  {
    name: string;
    accent: string;
    hover: string;
    active: string;
    subtle: string;
    border: string;
    text: string;
    lightText: string;
    rgb: string;
  }
> = {
  anticpurple: {
    name: 'AnticStore Moru (Varsayılan)',
    accent: '#982376',
    hover: '#7e1c62',
    active: '#65144e',
    subtle: 'rgba(152, 35, 118, 0.18)',
    border: 'rgba(152, 35, 118, 0.42)',
    text: '#e28cc9',
    lightText: '#861e68',
    rgb: '180, 74, 146',
  },
  purple: {
    name: 'Menekşe Moru',
    accent: '#9333ea',
    hover: '#7e22ce',
    active: '#6b21a8',
    subtle: 'rgba(147, 51, 234, 0.16)',
    border: 'rgba(147, 51, 234, 0.38)',
    text: '#d8b4fe',
    lightText: '#7e22ce',
    rgb: '168, 85, 247',
  },
  indigo: {
    name: 'Çivit',
    accent: '#6366f1',
    hover: '#4f46e5',
    active: '#4338ca',
    subtle: 'rgba(99, 102, 241, 0.15)',
    border: 'rgba(99, 102, 241, 0.35)',
    text: '#a5b4fc',
    lightText: '#4338ca',
    rgb: '99, 102, 241',
  },
  emerald: {
    name: 'Zümrüt',
    accent: '#10b981',
    hover: '#059669',
    active: '#047857',
    subtle: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.35)',
    text: '#6ee7b7',
    lightText: '#047857',
    rgb: '16, 185, 129',
  },
  blue: {
    name: 'Okyanus',
    accent: '#3b82f6',
    hover: '#2563eb',
    active: '#1d4ed8',
    subtle: 'rgba(59, 130, 246, 0.15)',
    border: 'rgba(59, 130, 246, 0.35)',
    text: '#93c5fd',
    lightText: '#1d4ed8',
    rgb: '59, 130, 246',
  },
  rose: {
    name: 'Gül Pembesi',
    accent: '#e11d48',
    hover: '#be123c',
    active: '#9f1239',
    subtle: 'rgba(225, 29, 72, 0.15)',
    border: 'rgba(225, 29, 72, 0.35)',
    text: '#fda4af',
    lightText: '#be123c',
    rgb: '225, 29, 72',
  },
  amber: {
    name: 'Kehribar',
    accent: '#f59e0b',
    hover: '#d97706',
    active: '#b45309',
    subtle: 'rgba(245, 158, 11, 0.15)',
    border: 'rgba(245, 158, 11, 0.35)',
    text: '#fcd34d',
    lightText: '#b45309',
    rgb: '245, 158, 11',
  },
  cyan: {
    name: 'Turkuaz',
    accent: '#06b6d4',
    hover: '#0891b2',
    active: '#0e7490',
    subtle: 'rgba(6, 182, 212, 0.15)',
    border: 'rgba(6, 182, 212, 0.35)',
    text: '#67e8f9',
    lightText: '#0e7490',
    rgb: '6, 182, 212',
  },
};

interface ThemeContextType {
  activeTheme: ThemeMode;
  resolvedTheme: 'amoled' | 'dark' | 'light';
  activeAccent: AccentColor;
  activeUIStyle: UIStyle;
  setTheme: (theme: ThemeMode) => void;
  setAccent: (accent: AccentColor) => void;
  setUIStyle: (style: UIStyle) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

function resolveSystemTheme(): 'dark' | 'light' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [activeTheme, setActiveThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('anticstore_theme_v2') as ThemeMode;
    return saved === 'system' || saved === 'dark' || saved === 'light' || saved === 'amoled'
      ? saved
      : 'system';
  });

  const [resolvedTheme, setResolvedTheme] = useState<'amoled' | 'dark' | 'light'>(() => {
    const saved = localStorage.getItem('anticstore_theme_v2') as ThemeMode;
    if (!saved || saved === 'system') return resolveSystemTheme();
    return saved === 'dark' || saved === 'light' || saved === 'amoled' ? saved : resolveSystemTheme();
  });

  const [activeAccent, setActiveAccentState] = useState<AccentColor>(() => {
    const saved = localStorage.getItem('anticstore_accent_v3') as AccentColor;
    return saved && ACCENT_PALETTES[saved] ? saved : 'anticpurple';
  });

  const [activeUIStyle, setActiveUIStyleState] = useState<UIStyle>(() => {
    const saved = (localStorage.getItem('anticstore_ui_style') || localStorage.getItem('koza_ui_style')) as UIStyle;
    return saved === 'win11' || saved === 'win10' || saved === 'gama' ? saved : 'gama';
  });

  const applyUIStyle = useCallback((style: UIStyle) => {
    setActiveUIStyleState(style);
    localStorage.setItem('anticstore_ui_style', style);
    document.documentElement.setAttribute('data-style', style);
    document.documentElement.classList.remove('style-gama', 'style-win11', 'style-win10');
    document.documentElement.classList.add(`style-${style}`);
  }, []);

  const applyAccentToDom = useCallback(
    (accent: AccentColor, effectiveTheme: 'amoled' | 'dark' | 'light') => {
      const pal = ACCENT_PALETTES[accent] || ACCENT_PALETTES.anticpurple;
      const isLight = effectiveTheme === 'light';
      const root = document.documentElement;
      const resolvedAccent = isLight ? pal.hover : pal.accent;
      const resolvedText = isLight ? pal.lightText : pal.text;

      root.style.setProperty('--accent', resolvedAccent);
      root.style.setProperty('--accent-hover', isLight ? pal.active : pal.hover);
      root.style.setProperty('--accent-active', pal.active);
      root.style.setProperty('--accent-subtle', pal.subtle);
      root.style.setProperty('--accent-border', pal.border);
      root.style.setProperty('--accent-text', resolvedText);
      root.style.setProperty('--btn-primary-bg', resolvedAccent);
      root.style.setProperty('--btn-primary-hover', isLight ? pal.active : pal.hover);
      root.style.setProperty('--badge-bg', pal.subtle);
      root.style.setProperty('--badge-border', pal.border);
      root.style.setProperty('--badge-text', resolvedText);
      root.style.setProperty('--scrollbar-thumb-hover', resolvedAccent);
      root.style.setProperty('--main-theme', resolvedAccent);
      root.style.setProperty('--s-main-theme', resolvedText);
    },
    []
  );

  const applyEffectiveTheme = useCallback(
    (mode: ThemeMode, accent: AccentColor) => {
      const effective: 'amoled' | 'dark' | 'light' =
        mode === 'system' ? resolveSystemTheme() : mode;
      setResolvedTheme(effective);
      document.documentElement.setAttribute('data-theme', effective);
      document.documentElement.classList.remove('amoled', 'dark', 'light');
      document.documentElement.classList.add(effective);
      applyAccentToDom(accent, effective);
    },
    [applyAccentToDom]
  );

  const setTheme = useCallback(
    (theme: ThemeMode) => {
      setActiveThemeState(theme);
      localStorage.setItem('anticstore_theme_v2', theme);
      applyEffectiveTheme(theme, activeAccent);
    },
    [activeAccent, applyEffectiveTheme]
  );

  const setAccent = useCallback(
    (accent: AccentColor) => {
      setActiveAccentState(accent);
      localStorage.setItem('anticstore_accent_v3', accent);
      applyAccentToDom(accent, resolvedTheme);
    },
    [applyAccentToDom, resolvedTheme]
  );

  useEffect(() => {
    applyEffectiveTheme(activeTheme, activeAccent);
    applyUIStyle(activeUIStyle);
  }, []);

  useEffect(() => {
    if (activeTheme !== 'system' || typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const handleChange = () => {
      applyEffectiveTheme('system', activeAccent);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [activeTheme, activeAccent, applyEffectiveTheme]);

  return (
    <ThemeContext.Provider
      value={{
        activeTheme,
        resolvedTheme,
        activeAccent,
        activeUIStyle,
        setTheme,
        setAccent,
        setUIStyle: applyUIStyle,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
