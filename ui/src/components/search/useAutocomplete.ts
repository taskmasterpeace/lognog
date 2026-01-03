// Core autocomplete hook - orchestrates context detection, suggestions, and keyboard navigation

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Suggestion, AutocompleteState, SuggestionCategory } from './autocomplete-types';
import {
  commandsToSuggestions,
  AGGREGATION_FUNCTIONS,
  EVAL_FUNCTIONS,
  OPERATORS,
  LOGICAL_OPERATORS,
  CORE_FIELDS,
  SPAN_VALUES,
  SORT_KEYWORDS,
  BY_KEYWORD,
  AS_KEYWORD,
} from './autocomplete-data';
import { useContextDetection } from './useContextDetection';
import { useFieldSuggestions } from './useFieldSuggestions';

interface UseAutocompleteOptions {
  query: string;
  cursorPosition: number;
  queryHistory: string[];
  enabled?: boolean;
}

const COMMANDS_SUGGESTIONS = commandsToSuggestions();
const MAX_SUGGESTIONS = 15;

export function useAutocomplete(options: UseAutocompleteOptions) {
  const { query, cursorPosition, queryHistory, enabled = true } = options;

  const [state, setState] = useState<AutocompleteState>({
    isOpen: false,
    suggestions: [],
    selectedIndex: 0,
    loading: false,
    context: null,
  });

  const context = useContextDetection(query, cursorPosition);
  const { fields, fieldValues, loading: fieldsLoading, fetchFieldValues } = useFieldSuggestions();

  // Generate suggestions based on context
  const suggestions = useMemo((): Suggestion[] => {
    if (!enabled) return [];

    const { type, prefix, fieldName, commandName } = context;
    let items: Suggestion[] = [];

    switch (type) {
      case 'start':
        // History first, then commands, then fields
        const historySuggestions = queryHistory.slice(0, 5).map((q, i) => ({
          id: `history-${i}`,
          label: q.length > 60 ? q.slice(0, 57) + '...' : q,
          insertText: q,
          category: 'history' as SuggestionCategory,
          description: 'Recent query',
          score: 200 - i,
        }));
        items = [...historySuggestions, ...COMMANDS_SUGGESTIONS, ...CORE_FIELDS, ...fields];
        break;

      case 'after-pipe':
        items = [...COMMANDS_SUGGESTIONS];
        break;

      case 'aggregation':
        items = [...AGGREGATION_FUNCTIONS];
        break;

      case 'eval-expression':
        items = [...EVAL_FUNCTIONS, ...CORE_FIELDS, ...fields];
        break;

      case 'field-name':
      case 'by-clause':
        items = [...CORE_FIELDS, ...fields];
        break;

      case 'field-value':
        if (fieldName && fieldValues[fieldName.toLowerCase()]) {
          items = fieldValues[fieldName.toLowerCase()];
        }
        break;

      case 'span-value':
        items = [...SPAN_VALUES];
        break;

      case 'operator':
        items = [...OPERATORS, ...LOGICAL_OPERATORS];
        break;

      case 'command-args':
        // Suggest based on command
        if (commandName === 'sort') {
          items = [...SORT_KEYWORDS, ...CORE_FIELDS, ...fields];
        } else if (commandName === 'stats' || commandName === 'timechart') {
          items = [BY_KEYWORD, AS_KEYWORD, ...AGGREGATION_FUNCTIONS];
        } else {
          items = [...CORE_FIELDS, ...fields, ...OPERATORS];
        }
        break;

      default:
        items = [...COMMANDS_SUGGESTIONS, ...CORE_FIELDS, ...fields];
    }

    // Filter by prefix
    if (prefix) {
      const lowerPrefix = prefix.toLowerCase();
      items = items.filter(
        (s) =>
          s.label.toLowerCase().startsWith(lowerPrefix) ||
          s.label.toLowerCase().includes(lowerPrefix)
      );

      // Boost exact prefix matches
      items = items.map((s) => ({
        ...s,
        score: s.label.toLowerCase().startsWith(lowerPrefix)
          ? s.score + 100
          : s.score + 50,
      }));
    }

    // Remove duplicates by id
    const seen = new Set<string>();
    items = items.filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });

    // Sort by score descending, then alphabetically
    items.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.label.localeCompare(b.label);
    });

    return items.slice(0, MAX_SUGGESTIONS);
  }, [context, fields, fieldValues, queryHistory, enabled]);

  // Update state when suggestions change
  useEffect(() => {
    if (!enabled) {
      setState((prev) => ({ ...prev, isOpen: false, suggestions: [] }));
      return;
    }

    setState((prev) => ({
      ...prev,
      suggestions,
      selectedIndex: 0,
      context,
      isOpen: suggestions.length > 0 && context.type !== 'unknown',
      loading: fieldsLoading,
    }));

    // Fetch field values if needed
    if (context.type === 'field-value' && context.fieldName) {
      fetchFieldValues(context.fieldName);
    }
  }, [suggestions, context, fieldsLoading, fetchFieldValues, enabled]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!state.isOpen || state.suggestions.length === 0) {
        return false;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setState((prev) => ({
            ...prev,
            selectedIndex: Math.min(prev.selectedIndex + 1, prev.suggestions.length - 1),
          }));
          return true;

        case 'ArrowUp':
          e.preventDefault();
          setState((prev) => ({
            ...prev,
            selectedIndex: Math.max(prev.selectedIndex - 1, 0),
          }));
          return true;

        case 'Tab':
        case 'Enter':
          if (state.suggestions[state.selectedIndex]) {
            e.preventDefault();
            return true; // Caller should handle selection
          }
          return false;

        case 'Escape':
          e.preventDefault();
          setState((prev) => ({ ...prev, isOpen: false }));
          return true;

        default:
          return false;
      }
    },
    [state.isOpen, state.suggestions, state.selectedIndex]
  );

  // Get currently selected suggestion
  const getSelectedSuggestion = useCallback((): Suggestion | null => {
    return state.suggestions[state.selectedIndex] || null;
  }, [state.suggestions, state.selectedIndex]);

  // Select a specific suggestion by index
  const selectByIndex = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      selectedIndex: Math.max(0, Math.min(index, prev.suggestions.length - 1)),
    }));
  }, []);

  // Close dropdown
  const close = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // Open dropdown
  const open = useCallback(() => {
    if (suggestions.length > 0) {
      setState((prev) => ({ ...prev, isOpen: true }));
    }
  }, [suggestions.length]);

  return {
    isOpen: state.isOpen,
    suggestions: state.suggestions,
    selectedIndex: state.selectedIndex,
    loading: state.loading,
    context: state.context,
    handleKeyDown,
    getSelectedSuggestion,
    selectByIndex,
    close,
    open,
  };
}
