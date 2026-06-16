import {
  BookOpen,
  Search,
  Calculator,
  Code,
  Braces,
  TrendingUp,
  FileCode,
} from 'lucide-react';
import type { QuerySubsection } from '../DocsPage';

export default function QuerySubNav({ active, onChange }: { active: QuerySubsection; onChange: (s: QuerySubsection) => void }) {
  const subsections: { id: QuerySubsection; label: string; shortLabel: string; icon: React.ElementType }[] = [
    { id: 'intro', label: 'Introduction', shortLabel: 'Intro', icon: BookOpen },
    { id: 'basic-search', label: 'Basic Searching', shortLabel: 'Search', icon: Search },
    { id: 'filtering', label: 'Filtering & Transforming', shortLabel: 'Filter', icon: Code },
    { id: 'aggregations', label: 'Aggregations & Stats', shortLabel: 'Stats', icon: TrendingUp },
    { id: 'eval-functions', label: 'Eval Functions', shortLabel: 'Eval', icon: Calculator },
    { id: 'advanced-commands', label: 'Advanced Commands', shortLabel: 'Advanced', icon: Braces },
    { id: 'examples', label: 'Use Case Examples', shortLabel: 'Examples', icon: FileCode },
  ];

  return (
    <div className="flex flex-nowrap sm:flex-wrap gap-1.5 sm:gap-2 mb-4 sm:mb-6 pl-2 sm:pl-4 border-l-2 border-honey-200 dark:border-honey-800 overflow-x-auto pb-2 scrollbar-hide -mr-4 pr-4">
      {subsections.map((s) => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${
            active === s.id
              ? 'bg-honey-100 dark:bg-honey-900/40 text-honey-700 dark:text-honey-300'
              : 'text-nog-600 dark:text-nog-400 hover:bg-nog-100 dark:hover:bg-nog-800'
          }`}
        >
          <s.icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          <span className="hidden sm:inline">{s.label}</span>
          <span className="sm:hidden">{s.shortLabel}</span>
        </button>
      ))}
    </div>
  );
}
