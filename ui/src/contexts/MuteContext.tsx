import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { getMutedValues, updateMutedValues, MutedValues } from '../api/client';

const STORAGE_KEY = 'lognog_muted_values';

const DEFAULT_MUTED_VALUES: MutedValues = {
  app_name: [],
  index_name: [],
  hostname: [],
};

interface MuteContextType {
  mutedValues: MutedValues;
  isLoading: boolean;
  isMuted: (field: string, value: string) => boolean;
  toggleMute: (field: string, value: string) => void;
  addMute: (field: string, value: string) => void;
  removeMute: (field: string, value: string) => void;
  getMutedCount: () => number;
  getMutedCountByField: (field: string) => number;
}

const MuteContext = createContext<MuteContextType | null>(null);

export function MuteProvider({ children }: { children: ReactNode }) {
  const [mutedValues, setMutedValues] = useState<MutedValues>(() => {
    // Load from localStorage first for instant access
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_MUTED_VALUES;
    } catch {
      return DEFAULT_MUTED_VALUES;
    }
  });
  const [isLoading, setIsLoading] = useState(true);

  // Sync from server on mount
  useEffect(() => {
    const loadFromServer = async () => {
      const token = localStorage.getItem('lognog_access_token');
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const serverValues = await getMutedValues();
        setMutedValues(serverValues);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serverValues));
      } catch (err) {
        console.error('Failed to load muted values:', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadFromServer();
  }, []);

  // Save to localStorage whenever mutedValues changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mutedValues));
  }, [mutedValues]);

  const isMuted = useCallback((field: string, value: string): boolean => {
    const fieldValues = mutedValues[field as keyof MutedValues];
    return fieldValues?.includes(value) ?? false;
  }, [mutedValues]);

  const addMute = useCallback(async (field: string, value: string) => {
    if (!['app_name', 'index_name', 'hostname'].includes(field)) return;

    const fieldKey = field as keyof MutedValues;

    // Optimistically update local state
    setMutedValues(prev => {
      if (prev[fieldKey].includes(value)) return prev;
      const updated = { ...prev, [field]: [...prev[fieldKey], value] };

      // Sync to server in background
      const token = localStorage.getItem('lognog_access_token');
      if (token) {
        updateMutedValues(updated).catch(err => {
          console.error('Failed to sync mute to server:', err);
        });
      }

      return updated;
    });
  }, []);

  const removeMute = useCallback(async (field: string, value: string) => {
    if (!['app_name', 'index_name', 'hostname'].includes(field)) return;

    const fieldKey = field as keyof MutedValues;

    // Optimistically update local state
    setMutedValues(prev => {
      const updated = { ...prev, [field]: prev[fieldKey].filter(v => v !== value) };

      // Sync to server in background
      const token = localStorage.getItem('lognog_access_token');
      if (token) {
        updateMutedValues(updated).catch(err => {
          console.error('Failed to sync unmute to server:', err);
        });
      }

      return updated;
    });
  }, []);

  const toggleMute = useCallback((field: string, value: string) => {
    if (isMuted(field, value)) {
      removeMute(field, value);
    } else {
      addMute(field, value);
    }
  }, [isMuted, addMute, removeMute]);

  const getMutedCount = useCallback((): number => {
    return mutedValues.app_name.length + mutedValues.index_name.length + mutedValues.hostname.length;
  }, [mutedValues]);

  const getMutedCountByField = useCallback((field: string): number => {
    return mutedValues[field as keyof MutedValues]?.length ?? 0;
  }, [mutedValues]);

  const value: MuteContextType = {
    mutedValues,
    isLoading,
    isMuted,
    toggleMute,
    addMute,
    removeMute,
    getMutedCount,
    getMutedCountByField,
  };

  return (
    <MuteContext.Provider value={value}>
      {children}
    </MuteContext.Provider>
  );
}

export function useMute() {
  const context = useContext(MuteContext);
  if (!context) {
    throw new Error('useMute must be used within a MuteProvider');
  }
  return context;
}
