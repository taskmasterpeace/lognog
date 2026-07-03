import { X, Keyboard } from 'lucide-react';

interface ShortcutsModalProps {
  onClose: () => void;
}

interface Shortcut {
  keys: string[];
  description: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ['/'], description: 'Focus the query input' },
  { keys: ['t'], description: 'Open the time range picker' },
  { keys: ['l'], description: 'Toggle live tail' },
  { keys: ['?'], description: 'Show this shortcuts cheat sheet' },
  { keys: ['Ctrl', 'Enter'], description: 'Run the current search' },
  { keys: ['Ctrl', 'K'], description: 'Focus the query input' },
  { keys: ['Esc'], description: 'Close modals and dropdowns' },
];

/**
 * On-brand keyboard shortcuts cheat sheet overlay for the Search page.
 * Matches the app's modal styling (rounded 0.625rem cards, subtle borders,
 * chocolate/cream brand palette, 0.2s transitions).
 */
export default function ShortcutsModal({ onClose }: ShortcutsModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-nog-800 rounded-lg shadow-xl max-w-md w-full animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <div className="flex items-center justify-between p-4 border-b border-nog-200 dark:border-nog-700">
          <h3 className="font-semibold text-nog-900 dark:text-nog-100 flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-honey-500" />
            Keyboard Shortcuts
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-nog-100 dark:hover:bg-nog-700 rounded transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-nog-500 dark:text-nog-400" />
          </button>
        </div>
        <div className="p-4 space-y-2">
          {SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.description}
              className="flex items-center justify-between gap-4 py-1.5"
            >
              <span className="text-sm text-nog-700 dark:text-nog-300">
                {shortcut.description}
              </span>
              <span className="flex items-center gap-1 flex-shrink-0">
                {shortcut.keys.map((key, i) => (
                  <kbd
                    key={i}
                    className="inline-flex items-center justify-center min-w-[1.75rem] px-2 py-1 text-xs font-medium text-nog-600 dark:text-nog-300 bg-nog-100 dark:bg-nog-700 border border-nog-200 dark:border-nog-600 rounded"
                  >
                    {key}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
        <div className="px-4 pb-4 pt-1 text-xs text-nog-400 dark:text-nog-500">
          Shortcuts are disabled while typing in a text field.
        </div>
      </div>
    </div>
  );
}
