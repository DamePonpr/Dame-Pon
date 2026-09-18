import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => Promise<void>;
  isReady: boolean;
}

const THEME_STORAGE_KEY = '@dame-pon/theme-preference';
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(THEME_STORAGE_KEY).then((storedPreference) => {
      if (!active) return;
      if (isThemePreference(storedPreference)) setPreferenceState(storedPreference);
      setIsReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isReady) return;
    Appearance.setColorScheme(preference === 'system' ? undefined : preference);
  }, [isReady, preference]);

  const setPreference = async (nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, nextPreference);
  };

  const value = useMemo(
    () => ({ preference, setPreference, isReady }),
    [isReady, preference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemePreference() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useThemePreference must be used within a ThemeProvider');
  return context;
}