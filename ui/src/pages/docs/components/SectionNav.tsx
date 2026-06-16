import {
  BookOpen,
  Search,
  Terminal,
  Server,
  FileText,
  Brain,
  Bot,
} from 'lucide-react';
import type { DocSection } from '../DocsPage';

export default function SectionNav({ active, onChange }: { active: DocSection; onChange: (s: DocSection) => void }) {
  const sections: { id: DocSection; label: string; shortLabel: string; icon: React.ElementType }[] = [
    { id: 'getting-started', label: 'Getting Started', shortLabel: 'Start', icon: BookOpen },
    { id: 'syslog-format', label: 'Syslog Format', shortLabel: 'Syslog', icon: FileText },
    { id: 'ingestion', label: 'Sending Logs', shortLabel: 'Ingest', icon: Server },
    { id: 'query', label: 'Query Language', shortLabel: 'Query', icon: Search },
    { id: 'knowledge', label: 'Knowledge Objects', shortLabel: 'Knowledge', icon: Brain },
    { id: 'dashboards', label: 'Dashboards', shortLabel: 'Dash', icon: FileText },
    { id: 'mcp', label: 'Claude AI (MCP)', shortLabel: 'AI', icon: Bot },
    { id: 'api', label: 'API Reference', shortLabel: 'API', icon: Terminal },
  ];

  return (
    <nav className="flex flex-wrap gap-1.5 sm:gap-2 mb-4 sm:mb-8 -mx-1 px-1 overflow-x-auto pb-2 scrollbar-hide">
      {sections.map((s) => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          className={`flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm sm:text-base font-medium transition-all whitespace-nowrap flex-shrink-0 ${
            active === s.id
              ? 'bg-honey-500 text-nog-900 shadow-md shadow-honey-500/25'
              : 'bg-white dark:bg-nog-800 text-nog-600 dark:text-nog-300 border border-nog-200 dark:border-nog-700 hover:border-nog-300 dark:hover:border-nog-600 hover:bg-nog-50 dark:hover:bg-nog-700'
          }`}
        >
          <s.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className="hidden sm:inline">{s.label}</span>
          <span className="sm:hidden">{s.shortLabel}</span>
        </button>
      ))}
    </nav>
  );
}
