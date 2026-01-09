// Main SearchAutocomplete wrapper component

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Search } from 'lucide-react';
import { AutocompleteDropdown } from './AutocompleteDropdown';
import { useAutocomplete } from './useAutocomplete';
import { Suggestion } from './autocomplete-types';

interface SearchAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  queryHistory: string[];
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

export function SearchAutocomplete({
  value,
  onChange,
  onSubmit,
  queryHistory,
  placeholder = 'Enter search query...',
  className = '',
  autoFocus = false,
  disabled = false,
}: SearchAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cursorPosition, setCursorPosition] = useState(0);

  // Track cursor position on selection change
  const handleSelect = useCallback(() => {
    if (inputRef.current) {
      setCursorPosition(inputRef.current.selectionStart || 0);
    }
  }, []);

  // Handle suggestion selection
  const handleSuggestionSelect = useCallback(
    (suggestion: Suggestion) => {
      if (!inputRef.current) return;

      const pos = cursorPosition;
      const beforeCursor = value.slice(0, pos);
      const afterCursor = value.slice(pos);

      // Find where the current "word" starts (prefix to replace)
      const prefixMatch = beforeCursor.match(/[\w._-]*$/);
      const prefixLength = prefixMatch ? prefixMatch[0].length : 0;
      const insertPos = pos - prefixLength;

      // Build new value
      let insertText = suggestion.insertText;

      // For history items, replace entire query
      if (suggestion.category === 'history') {
        onChange(insertText);
        requestAnimationFrame(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            const newPos = insertText.length;
            inputRef.current.setSelectionRange(newPos, newPos);
            setCursorPosition(newPos);
          }
        });
        close();
        return;
      }

      // Normal insertion
      const newValue = value.slice(0, insertPos) + insertText + afterCursor;
      onChange(newValue);

      // Position cursor after inserted text
      requestAnimationFrame(() => {
        if (inputRef.current) {
          const newPos = insertPos + insertText.length;
          inputRef.current.focus();
          inputRef.current.setSelectionRange(newPos, newPos);
          setCursorPosition(newPos);
        }
      });

      close();
    },
    [value, cursorPosition, onChange]
  );

  const {
    isOpen,
    suggestions,
    selectedIndex,
    loading,
    handleKeyDown: autocompleteKeyDown,
    getSelectedSuggestion,
    close,
  } = useAutocomplete({
    query: value,
    cursorPosition,
    queryHistory,
    enabled: !disabled,
  });

  // Handle input keydown
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Let autocomplete handle navigation keys when open
      if (isOpen) {
        if (['ArrowDown', 'ArrowUp', 'Escape'].includes(e.key)) {
          autocompleteKeyDown(e);
          return;
        }

        // Tab or Enter selects current suggestion
        if (e.key === 'Tab' || (e.key === 'Enter' && suggestions.length > 0)) {
          const selected = getSelectedSuggestion();
          if (selected) {
            e.preventDefault();
            handleSuggestionSelect(selected);
            return;
          }
        }
      }

      // Enter submits (when autocomplete closed or no suggestions)
      if (e.key === 'Enter' && !e.shiftKey) {
        if (!isOpen || suggestions.length === 0) {
          e.preventDefault();
          onSubmit();
        }
      }
    },
    [isOpen, suggestions, autocompleteKeyDown, getSelectedSuggestion, handleSuggestionSelect, onSubmit]
  );

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [close]);

  // Update cursor position when value changes externally
  useEffect(() => {
    if (inputRef.current) {
      setCursorPosition(inputRef.current.selectionStart || value.length);
    }
  }, [value]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Search icon */}
      <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-slate-400 dark:text-slate-500 pointer-events-none" />

      {/* Input */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          handleSelect();
        }}
        onKeyDown={onKeyDown}
        onSelect={handleSelect}
        onClick={handleSelect}
        onFocus={handleSelect}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        data-search-input
        className="
          w-full h-11 sm:h-12
          pl-10 sm:pl-12 pr-4
          bg-nog-50 dark:bg-nog-900
          border border-slate-200 dark:border-nog-700
          rounded-lg
          text-slate-900 dark:text-white
          placeholder-slate-400 dark:placeholder-slate-500
          font-mono text-sm
          transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent
          focus:bg-white dark:focus:bg-nog-800
          disabled:opacity-50 disabled:cursor-not-allowed
        "
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-autocomplete="list"
      />

      {/* Autocomplete dropdown */}
      {isOpen && (
        <AutocompleteDropdown
          suggestions={suggestions}
          selectedIndex={selectedIndex}
          loading={loading}
          onSelect={handleSuggestionSelect}
        />
      )}
    </div>
  );
}
