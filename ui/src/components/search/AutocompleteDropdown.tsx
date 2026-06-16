// Autocomplete dropdown container component

import { useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Suggestion } from './autocomplete-types';
import { SuggestionItem } from './SuggestionItem';

interface AutocompleteDropdownProps {
  suggestions: Suggestion[];
  selectedIndex: number;
  loading: boolean;
  onSelect: (suggestion: Suggestion) => void;
}

export function AutocompleteDropdown({
  suggestions,
  selectedIndex,
  loading,
  onSelect,
}: AutocompleteDropdownProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && listRef.current.children[selectedIndex]) {
      const selected = listRef.current.children[selectedIndex] as HTMLElement;
      selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  if (suggestions.length === 0 && !loading) {
    return null;
  }

  return (
    <div
      className="
        absolute z-50 w-full mt-1
        bg-white dark:bg-nog-800
        border border-nog-200 dark:border-nog-700
        rounded-lg shadow-xl
        max-h-80 overflow-hidden
        animate-fade-in
      "
      style={{ minWidth: '320px' }}
      role="listbox"
    >
      {/* Loading indicator */}
      {loading && (
        <div className="px-4 py-2 text-nog-500 dark:text-nog-400 text-sm flex items-center gap-2 border-b border-nog-100 dark:border-nog-700">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading suggestions...
        </div>
      )}

      {/* Suggestions list */}
      <div ref={listRef} className="overflow-y-auto max-h-64">
        {suggestions.map((suggestion, index) => (
          <SuggestionItem
            key={suggestion.id}
            suggestion={suggestion}
            isSelected={index === selectedIndex}
            onClick={() => onSelect(suggestion)}
          />
        ))}
      </div>

      {/* Footer with keyboard hints */}
      {suggestions.length > 0 && (
        <div className="px-3 py-1.5 text-[11px] text-nog-400 dark:text-nog-500 border-t border-nog-100 dark:border-nog-700 bg-nog-50 dark:bg-nog-900/50 flex items-center gap-4">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-nog-200 dark:bg-nog-700 rounded text-[10px]">↑</kbd>
            <kbd className="px-1 py-0.5 bg-nog-200 dark:bg-nog-700 rounded text-[10px]">↓</kbd>
            Navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-nog-200 dark:bg-nog-700 rounded text-[10px]">Tab</kbd>
            Select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-nog-200 dark:bg-nog-700 rounded text-[10px]">Esc</kbd>
            Close
          </span>
        </div>
      )}
    </div>
  );
}
