// Individual suggestion row component

// SuggestionItem component
import { Suggestion, SuggestionCategory } from './autocomplete-types';

interface SuggestionItemProps {
  suggestion: Suggestion;
  isSelected: boolean;
  onClick: () => void;
}

const CATEGORY_STYLES: Record<SuggestionCategory, { bg: string; text: string; label: string }> = {
  command: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Cmd' },
  aggregation: { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'Agg' },
  'eval-function': { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Func' },
  field: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Field' },
  value: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', label: 'Val' },
  operator: { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'Op' },
  keyword: { bg: 'bg-pink-500/20', text: 'text-pink-400', label: 'Key' },
  history: { bg: 'bg-slate-500/20', text: 'text-slate-400', label: 'History' },
};

export function SuggestionItem({ suggestion, isSelected, onClick }: SuggestionItemProps) {
  const categoryStyle = CATEGORY_STYLES[suggestion.category];

  return (
    <div
      className={`
        px-3 py-2 cursor-pointer flex items-start justify-between gap-2
        transition-colors duration-75
        ${isSelected
          ? 'bg-amber-500/20 dark:bg-amber-500/10'
          : 'hover:bg-slate-100 dark:hover:bg-nog-700/50'
        }
      `}
      onClick={onClick}
      role="option"
      aria-selected={isSelected}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-slate-900 dark:text-white truncate">
            {suggestion.label}
          </span>
          <span
            className={`
              text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide
              ${categoryStyle.bg} ${categoryStyle.text}
            `}
          >
            {categoryStyle.label}
          </span>
        </div>

        {suggestion.description && (
          <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
            {suggestion.description}
          </div>
        )}

        {/* Show syntax hint when selected */}
        {suggestion.syntax && isSelected && (
          <div className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-1.5 bg-slate-100 dark:bg-nog-900/50 px-2 py-1 rounded">
            {suggestion.syntax}
          </div>
        )}
      </div>

      {/* Show example on hover for selected item */}
      {suggestion.example && isSelected && (
        <div className="text-xs text-slate-400 dark:text-slate-500 hidden lg:block whitespace-nowrap">
          {suggestion.example}
        </div>
      )}
    </div>
  );
}
