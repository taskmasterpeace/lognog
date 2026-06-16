import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import SectionNav from './components/SectionNav';
import GettingStartedSection from './sections/GettingStartedSection';
import QueryLanguageSection from './sections/QueryLanguageSection';
import MCPSection from './sections/MCPSection';
import SyslogFormatSection from './sections/SyslogFormatSection';
import APIReferenceSection from './sections/APIReferenceSection';
import LogIngestionSection from './sections/LogIngestionSection';
import DashboardsSection from './sections/DashboardsSection';
import KnowledgeSection from './sections/KnowledgeSection';

export type DocSection =
  | 'query'
  | 'ingestion'
  | 'dashboards'
  | 'getting-started'
  | 'api'
  | 'syslog-format'
  | 'knowledge'
  | 'mcp';

export type QuerySubsection =
  | 'intro'
  | 'basic-search'
  | 'filtering'
  | 'aggregations'
  | 'eval-functions'
  | 'advanced-commands'
  | 'examples';

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState<DocSection>('query');

  return (
    <div className="min-h-full bg-nog-50 dark:bg-nog-900">
      {/* Header */}
      <div className="bg-white dark:bg-nog-800 border-b border-nog-200 dark:border-nog-700 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
          <div className="flex items-center gap-2 sm:gap-3 mb-2">
            <div className="p-1.5 sm:p-2 bg-honey-50 dark:bg-honey-900/30 rounded-lg">
              <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-honey-600 dark:text-honey-400" />
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-nog-900 dark:text-nog-100">Documentation</h1>
          </div>
          <p className="text-sm sm:text-base text-nog-600 dark:text-nog-400">
            Everything you need to know about using LogNog for log management.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        <SectionNav active={activeSection} onChange={setActiveSection} />

        {activeSection === 'getting-started' && <GettingStartedSection />}
        {activeSection === 'syslog-format' && <SyslogFormatSection />}
        {activeSection === 'ingestion' && <LogIngestionSection />}
        {activeSection === 'query' && <QueryLanguageSection />}
        {activeSection === 'knowledge' && <KnowledgeSection />}
        {activeSection === 'dashboards' && <DashboardsSection />}
        {activeSection === 'mcp' && <MCPSection />}
        {activeSection === 'api' && <APIReferenceSection />}
      </div>
    </div>
  );
}
