import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Plus,
  Trash2,
  Loader2,
  Edit2,
  Tag,
  Database,
  Zap,
  Play,
  Filter,
  FileText,
  Check,
  XCircle,
} from 'lucide-react';
import {
  getFieldExtractions,
  createFieldExtraction,
  updateFieldExtraction,
  deleteFieldExtraction,
  testFieldExtraction,
  getEventTypes,
  createEventType,
  updateEventType,
  deleteEventType,
  getTags,
  createTag,
  deleteTag,
  getLookups,
  createLookup,
  updateLookup,
  deleteLookup,
  getWorkflowActions,
  createWorkflowAction,
  updateWorkflowAction,
  deleteWorkflowAction,
  FieldExtraction,
  EventType,
  Lookup,
  WorkflowAction,
  TestExtractionResult,
} from '../api/client';

type Tab = 'extractions' | 'events' | 'tags' | 'lookups' | 'workflows';

export default function KnowledgePage() {
  const [activeTab, setActiveTab] = useState<Tab>('extractions');

  const tabs = [
    { id: 'extractions' as Tab, label: 'Field Extractions', icon: Filter, color: 'sky' },
    { id: 'events' as Tab, label: 'Event Types', icon: FileText, color: 'purple' },
    { id: 'tags' as Tab, label: 'Tags', icon: Tag, color: 'emerald' },
    { id: 'lookups' as Tab, label: 'Lookups', icon: Database, color: 'amber' },
    { id: 'workflows' as Tab, label: 'Workflow Actions', icon: Zap, color: 'rose' },
  ];

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Knowledge Management</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                Configure field extractions, event types, tags, lookups, and workflow actions
              </p>
            </div>
            <div className="flex items-center gap-2">
              <BookOpen className="w-8 h-8 text-sky-500" />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 flex gap-2 overflow-x-auto scrollbar-thin">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-all whitespace-nowrap ${
                  isActive
                    ? `border-${tab.color}-500 text-${tab.color}-600 bg-${tab.color}-50/50`
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="font-medium text-sm">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === 'extractions' && <FieldExtractionsTab />}
        {activeTab === 'events' && <EventTypesTab />}
        {activeTab === 'tags' && <TagsTab />}
        {activeTab === 'lookups' && <LookupsTab />}
        {activeTab === 'workflows' && <WorkflowActionsTab />}
      </div>
    </div>
  );
}

// ========== Field Extractions Tab ==========
function FieldExtractionsTab() {
  const [showModal, setShowModal] = useState(false);
  const [editingExtraction, setEditingExtraction] = useState<FieldExtraction | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testPattern, setTestPattern] = useState('');
  const [testSample, setTestSample] = useState('');
  const [testResult, setTestResult] = useState<TestExtractionResult | null>(null);
  const [testing, setTesting] = useState(false);

  const queryClient = useQueryClient();

  const { data: extractions, isLoading } = useQuery({
    queryKey: ['fieldExtractions'],
    queryFn: getFieldExtractions,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFieldExtraction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fieldExtractions'] });
    },
  });

  const handleEdit = (extraction: FieldExtraction) => {
    setEditingExtraction(extraction);
    setShowModal(true);
  };

  const handleTest = (pattern: string) => {
    setTestPattern(pattern);
    setTestResult(null);
    setShowTestModal(true);
  };

  const runTest = async () => {
    setTesting(true);
    try {
      const result = await testFieldExtraction(testPattern, testSample, 'regex');
      setTestResult(result);
    } catch (err) {
      setTestResult({
        success: false,
        error: String(err),
        matches: [],
      });
    } finally {
      setTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Field Extractions</h2>
          <p className="text-sm text-slate-500 mt-1">
            Extract custom fields from log messages using regex or grok patterns
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Add Extraction
        </button>
      </div>

      {extractions && extractions.length > 0 ? (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Source Type</th>
                <th>Field Name</th>
                <th>Pattern Type</th>
                <th>Pattern</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {extractions.map((extraction) => (
                <tr key={extraction.id}>
                  <td className="font-medium text-slate-900">{extraction.name}</td>
                  <td>
                    <span className="badge badge-info">{extraction.source_type}</span>
                  </td>
                  <td>
                    <code className="code">{extraction.field_name}</code>
                  </td>
                  <td>
                    <span className="text-xs uppercase text-slate-500">{extraction.pattern_type}</span>
                  </td>
                  <td>
                    <code className="code text-xs max-w-md truncate block">
                      {extraction.pattern}
                    </code>
                  </td>
                  <td>
                    {extraction.enabled ? (
                      <span className="badge badge-success">Enabled</span>
                    ) : (
                      <span className="badge bg-slate-100 text-slate-600">Disabled</span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleTest(extraction.pattern)}
                        className="p-2 text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                        title="Test Pattern"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEdit(extraction)}
                        className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(extraction.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Filter className="w-8 h-8 text-sky-600" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-2">No field extractions</h3>
          <p className="text-sm text-slate-500 mb-4">
            Create your first field extraction to parse custom fields from logs
          </p>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Add Field Extraction
          </button>
        </div>
      )}

      {showModal && (
        <FieldExtractionModal
          extraction={editingExtraction}
          onClose={() => {
            setShowModal(false);
            setEditingExtraction(null);
          }}
        />
      )}

      {showTestModal && (
        <TestPatternModal
          pattern={testPattern}
          sample={testSample}
          setSample={setTestSample}
          result={testResult}
          testing={testing}
          onTest={runTest}
          onClose={() => setShowTestModal(false)}
        />
      )}
    </>
  );
}

function FieldExtractionModal({
  extraction,
  onClose,
}: {
  extraction: FieldExtraction | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(extraction?.name || '');
  const [sourceType, setSourceType] = useState(extraction?.source_type || '');
  const [fieldName, setFieldName] = useState(extraction?.field_name || '');
  const [pattern, setPattern] = useState(extraction?.pattern || '');
  const [patternType, setPatternType] = useState<'regex' | 'grok'>(extraction?.pattern_type || 'regex');
  const [enabled, setEnabled] = useState(extraction?.enabled ?? true);

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      extraction
        ? updateFieldExtraction(extraction.id, { name, source_type: sourceType, field_name: fieldName, pattern, pattern_type: patternType, enabled })
        : createFieldExtraction(name, sourceType, fieldName, pattern, patternType, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fieldExtractions'] });
      onClose();
    },
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal animate-slide-up max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="text-lg font-semibold text-slate-900">
            {extraction ? 'Edit Field Extraction' : 'Add Field Extraction'}
          </h3>
        </div>

        <div className="modal-body space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Extract user_id"
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Source Type</label>
              <input
                type="text"
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value)}
                placeholder="syslog, apache, etc."
                className="input"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Field Name</label>
              <input
                type="text"
                value={fieldName}
                onChange={(e) => setFieldName(e.target.value)}
                placeholder="user_id"
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Pattern Type</label>
              <select value={patternType} onChange={(e) => setPatternType(e.target.value as 'regex' | 'grok')} className="input">
                <option value="regex">Regex</option>
                <option value="grok">Grok</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Pattern</label>
            <textarea
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder={patternType === 'regex' ? 'user_id=([0-9]+)' : '%{WORD:user_id}'}
              rows={3}
              className="input font-mono text-sm resize-none"
            />
            <p className="text-xs text-slate-500 mt-1">
              {patternType === 'regex'
                ? 'Use named groups or parentheses to capture values'
                : 'Use grok patterns like %{PATTERN:field_name}'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500"
            />
            <label htmlFor="enabled" className="text-sm font-medium text-slate-700">
              Enable this extraction
            </label>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!name || !sourceType || !fieldName || !pattern || mutation.isPending}
            className="btn-primary"
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {extraction ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TestPatternModal({
  pattern,
  sample,
  setSample,
  result,
  testing,
  onTest,
  onClose,
}: {
  pattern: string;
  sample: string;
  setSample: (s: string) => void;
  result: TestExtractionResult | null;
  testing: boolean;
  onTest: () => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal animate-slide-up max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="text-lg font-semibold text-slate-900">Test Pattern</h3>
        </div>

        <div className="modal-body space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Pattern</label>
            <code className="code block p-3 text-xs">{pattern}</code>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Sample Log</label>
            <textarea
              value={sample}
              onChange={(e) => setSample(e.target.value)}
              placeholder="Paste a sample log message here..."
              rows={3}
              className="input font-mono text-sm resize-none"
            />
          </div>

          {result && (
            <div className={`p-4 rounded-lg border ${result.success ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-start gap-2 mb-2">
                {result.success ? (
                  <>
                    <Check className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-emerald-900">Match Found</h4>
                      <p className="text-sm text-emerald-700 mt-1">
                        {result.matches.length} field(s) extracted
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-red-900">No Match</h4>
                      <p className="text-sm text-red-700 mt-1">{result.error}</p>
                    </div>
                  </>
                )}
              </div>

              {result.success && result.matches.length > 0 && (
                <div className="mt-3 space-y-2">
                  {result.matches.map((match, idx) => (
                    <div key={idx} className="bg-white p-2 rounded border border-emerald-200">
                      <code className="text-xs">
                        <span className="text-emerald-700 font-semibold">{match.field}:</span>{' '}
                        <span className="text-slate-700">{match.value}</span>
                      </code>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary">
            Close
          </button>
          <button
            onClick={onTest}
            disabled={!sample || testing}
            className="btn-primary"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Test Pattern
          </button>
        </div>
      </div>
    </div>
  );
}

// ========== Event Types Tab ==========
function EventTypesTab() {
  const [showModal, setShowModal] = useState(false);
  const [editingEventType, setEditingEventType] = useState<EventType | null>(null);

  const queryClient = useQueryClient();

  const { data: eventTypes, isLoading } = useQuery({
    queryKey: ['eventTypes'],
    queryFn: getEventTypes,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEventType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eventTypes'] });
    },
  });

  const handleEdit = (eventType: EventType) => {
    setEditingEventType(eventType);
    setShowModal(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Event Types</h2>
          <p className="text-sm text-slate-500 mt-1">
            Define event types to categorize log events based on search criteria
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Add Event Type
        </button>
      </div>

      {eventTypes && eventTypes.length > 0 ? (
        <div className="space-y-3">
          {eventTypes.map((eventType) => (
            <div key={eventType.id} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-slate-900">{eventType.name}</h3>
                    {eventType.enabled ? (
                      <span className="badge badge-success">Enabled</span>
                    ) : (
                      <span className="badge bg-slate-100 text-slate-600">Disabled</span>
                    )}
                    <span className="text-xs text-slate-500">Priority: {eventType.priority}</span>
                  </div>
                  {eventType.description && (
                    <p className="text-sm text-slate-600 mb-2">{eventType.description}</p>
                  )}
                  <code className="code text-xs">{eventType.search_string}</code>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => handleEdit(eventType)}
                    className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(eventType.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-purple-600" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-2">No event types</h3>
          <p className="text-sm text-slate-500 mb-4">
            Create event types to categorize and identify specific types of events
          </p>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Add Event Type
          </button>
        </div>
      )}

      {showModal && (
        <EventTypeModal
          eventType={editingEventType}
          onClose={() => {
            setShowModal(false);
            setEditingEventType(null);
          }}
        />
      )}
    </>
  );
}

function EventTypeModal({
  eventType,
  onClose,
}: {
  eventType: EventType | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(eventType?.name || '');
  const [searchString, setSearchString] = useState(eventType?.search_string || '');
  const [description, setDescription] = useState(eventType?.description || '');
  const [priority, setPriority] = useState(eventType?.priority || 5);
  const [enabled, setEnabled] = useState(eventType?.enabled ?? true);

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      eventType
        ? updateEventType(eventType.id, { name, search_string: searchString, description, priority, enabled })
        : createEventType(name, searchString, description, priority, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eventTypes'] });
      onClose();
    },
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal animate-slide-up max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="text-lg font-semibold text-slate-900">
            {eventType ? 'Edit Event Type' : 'Add Event Type'}
          </h3>
        </div>

        <div className="modal-body space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Failed Login Attempts"
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Search String (DSL)</label>
            <textarea
              value={searchString}
              onChange={(e) => setSearchString(e.target.value)}
              placeholder="search app=ssh message~'Failed password' | filter severity<=3"
              rows={3}
              className="input font-mono text-sm resize-none"
            />
            <p className="text-xs text-slate-500 mt-1">
              Use Spunk DSL syntax to define the event matching criteria
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Events indicating failed SSH login attempts"
              rows={2}
              className="input resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Priority (1-10, higher = evaluated first)
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={priority}
              onChange={(e) => setPriority(parseInt(e.target.value) || 5)}
              className="input"
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="event-enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500"
            />
            <label htmlFor="event-enabled" className="text-sm font-medium text-slate-700">
              Enable this event type
            </label>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!name || !searchString || mutation.isPending}
            className="btn-primary"
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {eventType ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ========== Tags Tab ==========
function TagsTab() {
  const [tagName, setTagName] = useState('');
  const [tagField, setTagField] = useState('');
  const [tagValue, setTagValue] = useState('');

  const queryClient = useQueryClient();

  const { data: tags, isLoading } = useQuery({
    queryKey: ['tags'],
    queryFn: getTags,
  });

  const createMutation = useMutation({
    mutationFn: () => createTag(tagName, tagField, tagValue),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      setTagName('');
      setTagField('');
      setTagValue('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTag,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">Tags</h2>
        <p className="text-sm text-slate-500 mt-1">
          Add descriptive tags to events based on field values
        </p>
      </div>

      {/* Add Tag Form */}
      <div className="card p-5 mb-6">
        <h3 className="font-semibold text-slate-900 mb-4">Add New Tag</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Tag Name</label>
            <input
              type="text"
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              placeholder="production"
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Field</label>
            <input
              type="text"
              value={tagField}
              onChange={(e) => setTagField(e.target.value)}
              placeholder="hostname"
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Value Pattern</label>
            <input
              type="text"
              value={tagValue}
              onChange={(e) => setTagValue(e.target.value)}
              placeholder="prod-*"
              className="input"
            />
          </div>
        </div>
        <div className="mt-4">
          <button
            onClick={() => createMutation.mutate()}
            disabled={!tagName || !tagField || !tagValue || createMutation.isPending}
            className="btn-primary"
          >
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Tag
          </button>
        </div>
      </div>

      {/* Tags List */}
      {tags && tags.length > 0 ? (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Tag Name</th>
                <th>Field</th>
                <th>Value Pattern</th>
                <th>Created</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tags.map((tag) => (
                <tr key={tag.id}>
                  <td>
                    <span className="badge badge-success">
                      <Tag className="w-3 h-3" />
                      {tag.tag_name}
                    </span>
                  </td>
                  <td>
                    <code className="code">{tag.field_name}</code>
                  </td>
                  <td>
                    <code className="code">{tag.field_value}</code>
                  </td>
                  <td className="text-sm text-slate-500">
                    {new Date(tag.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => deleteMutation.mutate(tag.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Tag className="w-8 h-8 text-emerald-600" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-2">No tags</h3>
          <p className="text-sm text-slate-500">
            Add tags to categorize and enrich your log events
          </p>
        </div>
      )}
    </>
  );
}

// ========== Lookups Tab ==========
function LookupsTab() {
  const [showModal, setShowModal] = useState(false);
  const [editingLookup, setEditingLookup] = useState<Lookup | null>(null);

  const queryClient = useQueryClient();

  const { data: lookups, isLoading } = useQuery({
    queryKey: ['lookups'],
    queryFn: getLookups,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteLookup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lookups'] });
    },
  });

  const handleEdit = (lookup: Lookup) => {
    setEditingLookup(lookup);
    setShowModal(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Lookups</h2>
          <p className="text-sm text-slate-500 mt-1">
            Define lookup tables to enrich log data with additional context
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Add Lookup
        </button>
      </div>

      {lookups && lookups.length > 0 ? (
        <div className="space-y-3">
          {lookups.map((lookup) => (
            <div key={lookup.id} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-slate-900">{lookup.name}</h3>
                    <span className="badge badge-info">{lookup.lookup_type}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-600 mb-2">
                    <span>
                      <strong>Key:</strong> <code className="code text-xs">{lookup.key_field}</code>
                    </span>
                    <span>
                      <strong>Output:</strong> <code className="code text-xs">{lookup.output_fields}</code>
                    </span>
                  </div>
                  {lookup.lookup_data && (
                    <details className="mt-2">
                      <summary className="text-xs text-sky-600 cursor-pointer hover:text-sky-700">
                        View data
                      </summary>
                      <pre className="mt-2 p-3 bg-slate-50 rounded border border-slate-200 text-xs overflow-auto max-h-40">
                        {JSON.stringify(JSON.parse(lookup.lookup_data), null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => handleEdit(lookup)}
                    className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(lookup.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Database className="w-8 h-8 text-amber-600" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-2">No lookups</h3>
          <p className="text-sm text-slate-500 mb-4">
            Create lookup tables to enrich your logs with additional data
          </p>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Add Lookup
          </button>
        </div>
      )}

      {showModal && (
        <LookupModal
          lookup={editingLookup}
          onClose={() => {
            setShowModal(false);
            setEditingLookup(null);
          }}
        />
      )}
    </>
  );
}

function LookupModal({
  lookup,
  onClose,
}: {
  lookup: Lookup | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(lookup?.name || '');
  const [lookupType, setLookupType] = useState<'CSV' | 'Manual'>(lookup?.lookup_type || 'Manual');
  const [keyField, setKeyField] = useState(lookup?.key_field || '');
  const [outputFields, setOutputFields] = useState(lookup?.output_fields || '');
  const [lookupData, setLookupData] = useState(
    lookup?.lookup_data ? JSON.stringify(JSON.parse(lookup.lookup_data), null, 2) : '{\n  "example_key": {\n    "field1": "value1",\n    "field2": "value2"\n  }\n}'
  );

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => {
      try {
        JSON.parse(lookupData); // Validate JSON
      } catch (e) {
        throw new Error('Invalid JSON in lookup data');
      }
      return lookup
        ? updateLookup(lookup.id, { name, lookup_type: lookupType, key_field: keyField, output_fields: outputFields, lookup_data: lookupData })
        : createLookup(name, lookupType, keyField, outputFields, lookupData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lookups'] });
      onClose();
    },
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal animate-slide-up max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="text-lg font-semibold text-slate-900">
            {lookup ? 'Edit Lookup' : 'Add Lookup'}
          </h3>
        </div>

        <div className="modal-body space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="user_info_lookup"
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Type</label>
              <select
                value={lookupType}
                onChange={(e) => setLookupType(e.target.value as 'CSV' | 'Manual')}
                className="input"
              >
                <option value="Manual">Manual (JSON)</option>
                <option value="CSV">CSV File</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Key Field</label>
              <input
                type="text"
                value={keyField}
                onChange={(e) => setKeyField(e.target.value)}
                placeholder="user_id"
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Output Fields (comma-separated)
              </label>
              <input
                type="text"
                value={outputFields}
                onChange={(e) => setOutputFields(e.target.value)}
                placeholder="username, department, email"
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Lookup Data (JSON)
            </label>
            <textarea
              value={lookupData}
              onChange={(e) => setLookupData(e.target.value)}
              rows={10}
              className="input font-mono text-xs resize-none"
            />
            <p className="text-xs text-slate-500 mt-1">
              Format: key-value pairs where keys match the key field and values contain output fields
            </p>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!name || !keyField || !outputFields || !lookupData || mutation.isPending}
            className="btn-primary"
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {lookup ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ========== Workflow Actions Tab ==========
function WorkflowActionsTab() {
  const [showModal, setShowModal] = useState(false);
  const [editingAction, setEditingAction] = useState<WorkflowAction | null>(null);

  const queryClient = useQueryClient();

  const { data: actions, isLoading } = useQuery({
    queryKey: ['workflowActions'],
    queryFn: getWorkflowActions,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWorkflowAction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflowActions'] });
    },
  });

  const handleEdit = (action: WorkflowAction) => {
    setEditingAction(action);
    setShowModal(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Workflow Actions</h2>
          <p className="text-sm text-slate-500 mt-1">
            Define actions that can be triggered from log events
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Add Action
        </button>
      </div>

      {actions && actions.length > 0 ? (
        <div className="space-y-3">
          {actions.map((action) => (
            <div key={action.id} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-slate-900">{action.name}</h3>
                    <span className="badge badge-info">{action.action_type}</span>
                  </div>
                  <div className="text-sm text-slate-600 space-y-1">
                    <p>
                      <strong>Label:</strong> {action.label}
                    </p>
                    <p>
                      <strong>Field:</strong> <code className="code text-xs">{action.field_name}</code>
                    </p>
                    <p>
                      <strong>Action:</strong> <code className="code text-xs">{action.action_value}</code>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => handleEdit(action)}
                    className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(action.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8 text-rose-600" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-2">No workflow actions</h3>
          <p className="text-sm text-slate-500 mb-4">
            Create workflow actions to enable quick actions from log events
          </p>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Add Workflow Action
          </button>
        </div>
      )}

      {showModal && (
        <WorkflowActionModal
          action={editingAction}
          onClose={() => {
            setShowModal(false);
            setEditingAction(null);
          }}
        />
      )}
    </>
  );
}

function WorkflowActionModal({
  action,
  onClose,
}: {
  action: WorkflowAction | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(action?.name || '');
  const [label, setLabel] = useState(action?.label || '');
  const [fieldName, setFieldName] = useState(action?.field_name || '');
  const [actionType, setActionType] = useState<'url' | 'search'>(action?.action_type || 'url');
  const [actionValue, setActionValue] = useState(action?.action_value || '');

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      action
        ? updateWorkflowAction(action.id, { name, label, field_name: fieldName, action_type: actionType, action_value: actionValue })
        : createWorkflowAction(name, label, fieldName, actionType, actionValue),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflowActions'] });
      onClose();
    },
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal animate-slide-up max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="text-lg font-semibold text-slate-900">
            {action ? 'Edit Workflow Action' : 'Add Workflow Action'}
          </h3>
        </div>

        <div className="modal-body space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="lookup_ip_whois"
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Label</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Lookup IP in WHOIS"
                className="input"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Field Name</label>
              <input
                type="text"
                value={fieldName}
                onChange={(e) => setFieldName(e.target.value)}
                placeholder="source_ip"
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Action Type</label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value as 'url' | 'search')}
                className="input"
              >
                <option value="url">URL</option>
                <option value="search">Search</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Action Value</label>
            <textarea
              value={actionValue}
              onChange={(e) => setActionValue(e.target.value)}
              placeholder={
                actionType === 'url'
                  ? 'https://whois.domaintools.com/$field_value$'
                  : 'search source_ip=$field_value$ | stats count by hostname'
              }
              rows={2}
              className="input font-mono text-sm resize-none"
            />
            <p className="text-xs text-slate-500 mt-1">
              {actionType === 'url'
                ? 'Use $field_value$ as placeholder for the field value'
                : 'Use $field_value$ in the search query to reference the field value'}
            </p>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!name || !label || !fieldName || !actionValue || mutation.isPending}
            className="btn-primary"
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {action ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
