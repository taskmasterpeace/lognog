// Field suggestions hook - fetches fields and field values from API with caching

import { useState, useCallback, useRef, useEffect } from 'react';
import { Suggestion } from './autocomplete-types';
import { discoverFields, getFieldValues as fetchFieldValuesApi } from '../../api/client';

interface FieldCache {
  fields: Suggestion[];
  timestamp: number;
}

interface ValueCache {
  [fieldName: string]: {
    values: Suggestion[];
    timestamp: number;
  };
}

const FIELD_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const VALUE_CACHE_TTL = 2 * 60 * 1000; // 2 minutes
const DEBOUNCE_MS = 300;

export function useFieldSuggestions() {
  const [fields, setFields] = useState<Suggestion[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, Suggestion[]>>({});
  const [loading, setLoading] = useState(false);

  const fieldCacheRef = useRef<FieldCache | null>(null);
  const valueCacheRef = useRef<ValueCache>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const pendingFieldRef = useRef<string | null>(null);

  // Fetch all available fields
  const fetchFields = useCallback(async () => {
    // Check cache
    if (
      fieldCacheRef.current &&
      Date.now() - fieldCacheRef.current.timestamp < FIELD_CACHE_TTL
    ) {
      setFields(fieldCacheRef.current.fields);
      return;
    }

    setLoading(true);
    try {
      const data = await discoverFields({ limit: 100 });

      // Combine core and discovered fields
      const allFields: string[] = [];

      // Add core fields
      if (data.core) {
        data.core.forEach((f) => {
          if (!allFields.includes(f.name)) {
            allFields.push(f.name);
          }
        });
      }

      // Add discovered fields
      if (data.discovered) {
        data.discovered.forEach((f) => {
          if (!allFields.includes(f.name)) {
            allFields.push(f.name);
          }
        });
      }

      const fieldSuggestions: Suggestion[] = allFields.map((name, i) => ({
        id: `discovered-${name}`,
        label: name,
        insertText: name,
        category: 'field' as const,
        description: 'Field',
        score: 50 - i,
      }));

      fieldCacheRef.current = {
        fields: fieldSuggestions,
        timestamp: Date.now(),
      };

      setFields(fieldSuggestions);
    } catch (err) {
      console.error('Failed to fetch fields:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch values for a specific field (debounced)
  const fetchFieldValues = useCallback((fieldName: string) => {
    // Normalize field name
    const normalizedField = fieldName.toLowerCase();

    // Skip fields that are known to not have useful values (timestamps, messages, etc)
    const skipFields = ['timestamp', 'message', 'raw', '_time', '_raw'];
    if (skipFields.includes(normalizedField)) {
      return;
    }

    // Check cache
    const cached = valueCacheRef.current[normalizedField];
    if (cached && Date.now() - cached.timestamp < VALUE_CACHE_TTL) {
      setFieldValues((prev) => ({ ...prev, [normalizedField]: cached.values }));
      return;
    }

    // Don't re-fetch if already pending for this field
    if (pendingFieldRef.current === normalizedField) {
      return;
    }

    // Clear existing timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    pendingFieldRef.current = normalizedField;

    // Debounce API call
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const values = await fetchFieldValuesApi(normalizedField, 50);

        const valueSuggestions: Suggestion[] = values
          .slice(0, 50)
          .map((item, i) => {
            const displayValue = String(item.value);
            return {
              id: `value-${normalizedField}-${i}`,
              label: displayValue,
              insertText: needsQuotes(displayValue) ? `"${displayValue}"` : displayValue,
              category: 'value' as const,
              description: item.count ? `Count: ${item.count}` : undefined,
              score: 50 - i,
            };
          });

        valueCacheRef.current[normalizedField] = {
          values: valueSuggestions,
          timestamp: Date.now(),
        };

        setFieldValues((prev) => ({ ...prev, [normalizedField]: valueSuggestions }));
      } catch (err) {
        // Cache empty result to avoid repeated failed API calls
        valueCacheRef.current[normalizedField] = {
          values: [],
          timestamp: Date.now(),
        };
        // Only log error if it's not a 404 (field doesn't have values endpoint)
        if (err && (err as { status?: number }).status !== 404) {
          console.error(`Failed to fetch values for ${normalizedField}:`, err);
        }
      } finally {
        setLoading(false);
        pendingFieldRef.current = null;
      }
    }, DEBOUNCE_MS);
  }, []);

  // Clear cache and refresh
  const refresh = useCallback(() => {
    fieldCacheRef.current = null;
    valueCacheRef.current = {};
    fetchFields();
  }, [fetchFields]);

  // Initial fetch
  useEffect(() => {
    fetchFields();
  }, [fetchFields]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return {
    fields,
    fieldValues,
    loading,
    fetchFieldValues,
    refresh,
  };
}

function needsQuotes(value: string): boolean {
  // Quote if contains spaces, special chars, or operators
  return /[\s|=<>!~"']/.test(value);
}
