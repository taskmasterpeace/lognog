import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Database,
  Shield,
  Globe,
  Server,
  Code,
  X,
  Copy,
  Check,
  Search,
  Info,
  FileCode,
  AlertCircle,
  CheckCircle2,
  Plus,
} from 'lucide-react';
import { getTemplatesByCategory, getTemplateStats, SourceTemplate } from '../api/client';
import AddDataSourceWizard from '../components/AddDataSourceWizard';

const CATEGORY_ICONS = {
  database: Database,
  security: Shield,
  web: Globe,
  system: Server,
  application: Code,
};

const CATEGORY_COLORS = {
  database: 'text-blue-500 bg-blue-100 dark:bg-blue-900/30',
  security: 'text-red-500 bg-red-100 dark:bg-red-900/30',
  web: 'text-green-500 bg-green-100 dark:bg-green-900/30',
  system: 'text-purple-500 bg-purple-100 dark:bg-purple-900/30',
  application: 'text-orange-500 bg-orange-100 dark:bg-orange-900/30',
};

export default function DataSourcesPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<SourceTemplate | null>(null);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const { data: templatesByCategory, isLoading } = useQuery({
    queryKey: ['templates', 'by-category'],
    queryFn: getTemplatesByCategory,
  });

  const { data: stats } = useQuery({
    queryKey: ['templates', 'stats'],
    queryFn: getTemplateStats,
  });

  const handleCopy = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const openTemplateSetup = (template: SourceTemplate) => {
    setSelectedTemplate(template);
    setShowSetupModal(true);
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const categories = templatesByCategory
    ? Object.keys(templatesByCategory).filter(
        (cat) => (templatesByCategory as Record<string, SourceTemplate[]>)[cat].length > 0
      )
    : [];

  const allTemplates = templatesByCategory
    ? Object.values(templatesByCategory as Record<string, SourceTemplate[]>).flat()
    : [];

  const filteredTemplates =
    selectedCategory === 'all'
      ? allTemplates
      : (templatesByCategory as Record<string, SourceTemplate[]>)?.[selectedCategory] || [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Database className="w-7 h-7 text-sky-500" />
            Data Sources
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Configure log sources with pre-built templates for common platforms and applications
          </p>
        </div>
        <button
          onClick={() => setShowWizard(true)}
          className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-medium shadow-sm transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Data Source
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="text-sm text-slate-500 dark:text-slate-400">Total Templates</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{stats.total}</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="text-sm text-slate-500 dark:text-slate-400">Built-in</div>
            <div className="text-2xl font-bold text-sky-500 mt-1">{stats.built_in}</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="text-sm text-slate-500 dark:text-slate-400">Custom</div>
            <div className="text-2xl font-bold text-purple-500 mt-1">{stats.custom}</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="text-sm text-slate-500 dark:text-slate-400">Categories</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
              {Object.keys(stats.by_category).filter((k) => stats.by_category[k] > 0).length}
            </div>
          </div>
        </div>
      )}

      {/* Category Filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            selectedCategory === 'all'
              ? 'bg-sky-500 text-white'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
          }`}
        >
          All Templates ({allTemplates.length})
        </button>
        {categories.map((category) => {
          const Icon = CATEGORY_ICONS[category as keyof typeof CATEGORY_ICONS];
          const count = (templatesByCategory as Record<string, SourceTemplate[]>)[category]?.length || 0;
          return (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                selectedCategory === category
                  ? 'bg-sky-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              <Icon className="w-4 h-4" />
              {category.charAt(0).toUpperCase() + category.slice(1)} ({count})
            </button>
          );
        })}
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTemplates.map((template) => {
          const Icon = CATEGORY_ICONS[template.category];
          const colorClass = CATEGORY_COLORS[template.category];

          return (
            <div
              key={template.id}
              className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => openTemplateSetup(template)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`p-3 rounded-lg ${colorClass}`}>
                  <Icon className="w-6 h-6" />
                </div>
                {template.built_in ? (
                  <span className="px-2 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded">
                    Built-in
                  </span>
                ) : null}
              </div>

              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{template.name}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">{template.description}</p>

              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded capitalize">{template.category}</span>
                {template.field_extractions && template.field_extractions.length > 0 && (
                  <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded">
                    {template.field_extractions.length} fields
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredTemplates.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <Search className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
            No templates found
          </h3>
          <p className="text-slate-500 dark:text-slate-400">
            Try selecting a different category or browse all templates
          </p>
        </div>
      )}

      {/* Setup Modal */}
      {showSetupModal && selectedTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {(() => {
                  const Icon = CATEGORY_ICONS[selectedTemplate.category];
                  const colorClass = CATEGORY_COLORS[selectedTemplate.category];
                  return (
                    <div className={`p-2 rounded-lg ${colorClass}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                  );
                })()}
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {selectedTemplate.name}
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{selectedTemplate.description}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowSetupModal(false);
                  setSelectedTemplate(null);
                }}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Setup Instructions */}
              {selectedTemplate.setup_instructions && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    <Info className="w-5 h-5 text-sky-500" />
                    Setup Instructions
                  </div>
                  <div className="prose dark:prose-invert max-w-none bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
                    <pre className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                      {selectedTemplate.setup_instructions}
                    </pre>
                  </div>
                </div>
              )}

              {/* Agent Configuration Example */}
              {selectedTemplate.agent_config_example && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                      <FileCode className="w-5 h-5 text-purple-500" />
                      LogNog In Agent Configuration
                    </div>
                    <button
                      onClick={() => handleCopy(selectedTemplate.agent_config_example!, 'agent')}
                      className="px-3 py-1 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded flex items-center gap-2"
                    >
                      {copiedSection === 'agent' ? (
                        <>
                          <Check className="w-4 h-4 text-green-500" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <div className="bg-slate-900 dark:bg-black rounded-lg p-4 overflow-x-auto">
                    <pre className="text-sm text-slate-100 font-mono">{selectedTemplate.agent_config_example}</pre>
                  </div>
                </div>
              )}

              {/* Syslog Configuration Example */}
              {selectedTemplate.syslog_config_example && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                      <Server className="w-5 h-5 text-green-500" />
                      Syslog Configuration
                    </div>
                    <button
                      onClick={() => handleCopy(selectedTemplate.syslog_config_example!, 'syslog')}
                      className="px-3 py-1 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded flex items-center gap-2"
                    >
                      {copiedSection === 'syslog' ? (
                        <>
                          <Check className="w-4 h-4 text-green-500" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <div className="bg-slate-900 dark:bg-black rounded-lg p-4 overflow-x-auto">
                    <pre className="text-sm text-slate-100 font-mono">{selectedTemplate.syslog_config_example}</pre>
                  </div>
                </div>
              )}

              {/* Field Extractions */}
              {selectedTemplate.field_extractions && selectedTemplate.field_extractions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    <Database className="w-5 h-5 text-blue-500" />
                    Field Extractions ({selectedTemplate.field_extractions.length})
                  </div>
                  <div className="space-y-2">
                    {selectedTemplate.field_extractions.map((extraction, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-700"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-mono font-semibold text-slate-900 dark:text-slate-100">
                              {extraction.field_name}
                            </code>
                            {extraction.required && (
                              <span className="px-2 py-0.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">
                                Required
                              </span>
                            )}
                            <span className="px-2 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded">
                              {extraction.pattern_type}
                            </span>
                          </div>
                        </div>
                        {extraction.description && (
                          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{extraction.description}</p>
                        )}
                        <code className="text-xs font-mono text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 px-2 py-1 rounded">
                          {extraction.pattern}
                        </code>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sample Log */}
              {selectedTemplate.sample_log && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    <FileCode className="w-5 h-5 text-orange-500" />
                    Sample Log Line
                  </div>
                  <div className="bg-slate-900 dark:bg-black rounded-lg p-4 overflow-x-auto">
                    <pre className="text-sm text-slate-100 font-mono whitespace-pre-wrap">
                      {selectedTemplate.sample_log}
                    </pre>
                  </div>
                </div>
              )}

              {/* Sample Query */}
              {selectedTemplate.sample_query && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    <Search className="w-5 h-5 text-sky-500" />
                    Example Query
                  </div>
                  <div className="bg-sky-50 dark:bg-sky-900/20 rounded-lg p-4">
                    <code className="text-sm font-mono text-sky-900 dark:text-sky-100">
                      {selectedTemplate.sample_query}
                    </code>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                {selectedTemplate.built_in ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    This is a built-in template
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-orange-500" />
                    Custom template
                  </>
                )}
              </div>
              <button
                onClick={() => {
                  setShowSetupModal(false);
                  setSelectedTemplate(null);
                }}
                className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Data Source Wizard */}
      <AddDataSourceWizard
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        onComplete={() => {
          // Optionally refresh or show a success message
        }}
      />
    </div>
  );
}
