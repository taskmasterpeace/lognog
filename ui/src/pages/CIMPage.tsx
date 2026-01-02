import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Database,
  Layers,
  ArrowRightLeft,
  Plus,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronRight,
  Search,
  Globe,
  Monitor,
  Network,
  Lock,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import {
  getDataModels,
  createDataModel as createDataModelApi,
  updateDataModel as updateDataModelApi,
  deleteDataModel as deleteDataModelApi,
  getCIMStats,
  getFieldMappings,
  createFieldMapping as createFieldMappingApi,
  updateFieldMapping as updateFieldMappingApi,
  deleteFieldMapping as deleteFieldMappingApi,
  type DataModel,
  type FieldMapping,
} from '../api/client';

type TabType = 'models' | 'mappings';

const categoryIcons: Record<string, React.ElementType> = {
  authentication: Lock,
  network: Network,
  endpoint: Monitor,
  web: Globe,
  custom: Layers,
};

const categoryColors: Record<string, string> = {
  authentication: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/30',
  network: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30',
  endpoint: 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-900/30',
  web: 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/30',
  custom: 'text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-700',
};

const fieldTypeColors: Record<string, string> = {
  string: 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/30',
  number: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30',
  boolean: 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-900/30',
  timestamp: 'text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-900/30',
  ip: 'text-cyan-600 bg-cyan-50 dark:text-cyan-400 dark:bg-cyan-900/30',
  array: 'text-pink-600 bg-pink-50 dark:text-pink-400 dark:bg-pink-900/30',
};

export default function CIMPage() {
  const [activeTab, setActiveTab] = useState<TabType>('models');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [showModelForm, setShowModelForm] = useState(false);
  const [editingModel, setEditingModel] = useState<DataModel | null>(null);
  const [showMappingForm, setShowMappingForm] = useState(false);
  const [editingMapping, setEditingMapping] = useState<FieldMapping | null>(null);
  const [sourceFilter, setSourceFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');

  const queryClient = useQueryClient();

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['cim', 'stats'],
    queryFn: getCIMStats,
  });

  // Fetch data models
  const { data: modelsData, isLoading: modelsLoading } = useQuery({
    queryKey: ['cim', 'models', categoryFilter],
    queryFn: () => getDataModels({ category: categoryFilter || undefined }),
  });

  // Fetch field mappings
  const { data: mappingsData, isLoading: mappingsLoading } = useQuery({
    queryKey: ['cim', 'mappings', sourceFilter, modelFilter],
    queryFn: () => getFieldMappings({
      source_type: sourceFilter || undefined,
      data_model: modelFilter || undefined,
    }),
  });

  // Mutations
  const deleteModelMutation = useMutation({
    mutationFn: deleteDataModelApi,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cim'] }),
  });

  const deleteMappingMutation = useMutation({
    mutationFn: deleteFieldMappingApi,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cim'] }),
  });

  const models = modelsData?.models || [];
  const mappings = mappingsData?.mappings || [];

  const filteredModels = models.filter(m =>
    !search || m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.description?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredMappings = mappings.filter(m =>
    !search || m.source_field.toLowerCase().includes(search.toLowerCase()) ||
    m.cim_field.toLowerCase().includes(search.toLowerCase())
  );

  const uniqueSources = [...new Set(mappings.map(m => m.source_type))];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Common Information Model
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Normalize log fields for consistent queries across sources
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-sky-500" />
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {stats.total_models}
              </div>
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Data Models</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-emerald-500" />
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {stats.total_mappings}
              </div>
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Field Mappings</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {stats.by_category?.authentication || 0}
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Auth Models</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {Object.keys(stats.mappings_by_source || {}).length}
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Source Types</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('models')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'models'
                ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Database className="w-4 h-4 inline-block mr-2" />
            Data Models
          </button>
          <button
            onClick={() => setActiveTab('mappings')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'mappings'
                ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <ArrowRightLeft className="w-4 h-4 inline-block mr-2" />
            Field Mappings
          </button>
        </div>
      </div>

      {/* Data Models Tab */}
      {activeTab === 'models' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search models..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div className="relative">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="appearance-none pl-4 pr-10 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="">All Categories</option>
                <option value="authentication">Authentication</option>
                <option value="network">Network</option>
                <option value="endpoint">Endpoint</option>
                <option value="web">Web</option>
                <option value="custom">Custom</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
            <button
              onClick={() => { setEditingModel(null); setShowModelForm(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Model
            </button>
          </div>

          {/* Models List */}
          <div className="space-y-3">
            {modelsLoading ? (
              <div className="text-center py-8 text-slate-500">Loading...</div>
            ) : filteredModels.length === 0 ? (
              <div className="text-center py-8 text-slate-500">No data models found</div>
            ) : (
              filteredModels.map((model) => {
                const Icon = categoryIcons[model.category] || Layers;
                const isExpanded = expandedModel === model.name;

                return (
                  <div
                    key={model.id}
                    className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
                  >
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      onClick={() => setExpandedModel(isExpanded ? null : model.name)}
                    >
                      <div className="flex items-center gap-3">
                        <button className="p-1">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          )}
                        </button>
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${categoryColors[model.category]}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {model.name}
                            </span>
                            {model.is_builtin && (
                              <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                Built-in
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-slate-500 dark:text-slate-400">
                            {model.description}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-sm text-slate-500">
                          {model.fields.length} fields
                        </div>
                        {!model.is_builtin && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingModel(model); setShowModelForm(true); }}
                              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-4 h-4 text-slate-500" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('Delete this data model?')) {
                                  deleteModelMutation.mutate(model.name);
                                }
                              }}
                              className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Expanded Fields */}
                    {isExpanded && (
                      <div className="border-t border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-900/50">
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                          Fields
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {model.fields.map((field) => (
                            <div
                              key={field.name}
                              className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium text-slate-900 dark:text-slate-100">
                                  {field.name}
                                </span>
                                <span className={`text-xs px-2 py-0.5 rounded ${fieldTypeColors[field.type]}`}>
                                  {field.type}
                                </span>
                              </div>
                              {field.description && (
                                <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                                  {field.description}
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                {field.required && (
                                  <span className="text-xs text-red-500">Required</span>
                                )}
                                {field.aliases && field.aliases.length > 0 && (
                                  <span className="text-xs text-slate-400">
                                    Aliases: {field.aliases.slice(0, 3).join(', ')}
                                    {field.aliases.length > 3 && '...'}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Field Mappings Tab */}
      {activeTab === 'mappings' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search mappings..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div className="relative">
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="appearance-none pl-4 pr-10 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="">All Sources</option>
                {uniqueSources.map(src => (
                  <option key={src} value={src}>{src}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
            <div className="relative">
              <select
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value)}
                className="appearance-none pl-4 pr-10 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="">All Models</option>
                {models.map(m => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
            <button
              onClick={() => { setEditingMapping(null); setShowMappingForm(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Mapping
            </button>
          </div>

          {/* Mappings Table */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Source Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Source Field</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase"></th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">CIM Field</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Data Model</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Transform</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Enabled</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {mappingsLoading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                        Loading...
                      </td>
                    </tr>
                  ) : filteredMappings.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                        No field mappings found. Add mappings to normalize your log sources.
                      </td>
                    </tr>
                  ) : (
                    filteredMappings.map((mapping) => (
                      <tr key={mapping.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                            {mapping.source_type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm text-slate-900 dark:text-slate-100">
                            {mapping.source_field}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <ArrowRightLeft className="w-4 h-4 text-slate-400 mx-auto" />
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm text-sky-600 dark:text-sky-400">
                            {mapping.cim_field}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-slate-600 dark:text-slate-300">
                            {mapping.data_model}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {mapping.transform ? (
                            <span className="font-mono text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded">
                              {mapping.transform}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {mapping.enabled ? (
                            <CheckCircle className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-slate-400" />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => { setEditingMapping(mapping); setShowMappingForm(true); }}
                              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-4 h-4 text-slate-500" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('Delete this field mapping?')) {
                                  deleteMappingMutation.mutate(mapping.id);
                                }
                              }}
                              className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Model Form Modal */}
      {showModelForm && (
        <DataModelFormModal
          model={editingModel}
          onClose={() => { setShowModelForm(false); setEditingModel(null); }}
          onSave={() => {
            queryClient.invalidateQueries({ queryKey: ['cim'] });
            setShowModelForm(false);
            setEditingModel(null);
          }}
        />
      )}

      {/* Mapping Form Modal */}
      {showMappingForm && (
        <FieldMappingFormModal
          mapping={editingMapping}
          models={models}
          onClose={() => { setShowMappingForm(false); setEditingMapping(null); }}
          onSave={() => {
            queryClient.invalidateQueries({ queryKey: ['cim'] });
            setShowMappingForm(false);
            setEditingMapping(null);
          }}
        />
      )}
    </div>
  );
}

function DataModelFormModal({
  model,
  onClose,
  onSave,
}: {
  model: DataModel | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [formData, setFormData] = useState({
    name: model?.name || '',
    description: model?.description || '',
    category: model?.category || 'custom',
    fields: model?.fields || [{ name: '', type: 'string' as const, description: '' }],
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (model) {
        await updateDataModelApi(model.name, formData);
      } else {
        await createDataModelApi(formData as Partial<DataModel>);
      }
    },
    onSuccess: onSave,
  });

  const handleAddField = () => {
    setFormData({
      ...formData,
      fields: [...formData.fields, { name: '', type: 'string' as const, description: '' }],
    });
  };

  const handleRemoveField = (index: number) => {
    setFormData({
      ...formData,
      fields: formData.fields.filter((_, i) => i !== index),
    });
  };

  const handleFieldChange = (index: number, key: string, value: string) => {
    const newFields = [...formData.fields];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (newFields[index] as any)[key] = value;
    setFormData({ ...formData, fields: newFields });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {model ? 'Edit Data Model' : 'Create Data Model'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Name *
              </label>
              <input
                type="text"
                required
                disabled={!!model}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., My_Custom_Model"
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Category
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as DataModel['category'] })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
              >
                <option value="authentication">Authentication</option>
                <option value="network">Network</option>
                <option value="endpoint">Endpoint</option>
                <option value="web">Web</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
            />
          </div>

          {/* Fields */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Fields *
              </label>
              <button
                type="button"
                onClick={handleAddField}
                className="text-sm text-sky-500 hover:text-sky-600"
              >
                + Add Field
              </button>
            </div>
            <div className="space-y-2">
              {formData.fields.map((field, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={field.name}
                    onChange={(e) => handleFieldChange(index, 'name', e.target.value)}
                    placeholder="Field name"
                    className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
                  />
                  <select
                    value={field.type}
                    onChange={(e) => handleFieldChange(index, 'type', e.target.value)}
                    className="w-32 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
                  >
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                    <option value="timestamp">timestamp</option>
                    <option value="ip">ip</option>
                    <option value="array">array</option>
                  </select>
                  <input
                    type="text"
                    value={field.description || ''}
                    onChange={(e) => handleFieldChange(index, 'description', e.target.value)}
                    placeholder="Description"
                    className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
                  />
                  {formData.fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveField(index)}
                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {mutation.isPending ? 'Saving...' : model ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FieldMappingFormModal({
  mapping,
  models,
  onClose,
  onSave,
}: {
  mapping: FieldMapping | null;
  models: DataModel[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [formData, setFormData] = useState({
    source_type: mapping?.source_type || '',
    source_field: mapping?.source_field || '',
    data_model: mapping?.data_model || (models[0]?.name || ''),
    cim_field: mapping?.cim_field || '',
    transform: mapping?.transform || '',
    priority: mapping?.priority || 100,
    enabled: mapping?.enabled ?? true,
  });

  const selectedModel = models.find(m => m.name === formData.data_model);

  const mutation = useMutation({
    mutationFn: async () => {
      if (mapping) {
        await updateFieldMappingApi(mapping.id, formData);
      } else {
        await createFieldMappingApi(formData);
      }
    },
    onSuccess: onSave,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {mapping ? 'Edit Field Mapping' : 'Create Field Mapping'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Source Type *
              </label>
              <input
                type="text"
                required
                value={formData.source_type}
                onChange={(e) => setFormData({ ...formData, source_type: e.target.value })}
                placeholder="e.g., nginx, sshd, sysmon"
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Source Field *
              </label>
              <input
                type="text"
                required
                value={formData.source_field}
                onChange={(e) => setFormData({ ...formData, source_field: e.target.value })}
                placeholder="e.g., remote_addr, user"
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Data Model *
              </label>
              <select
                value={formData.data_model}
                onChange={(e) => setFormData({ ...formData, data_model: e.target.value, cim_field: '' })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
              >
                {models.map(m => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                CIM Field *
              </label>
              <select
                value={formData.cim_field}
                onChange={(e) => setFormData({ ...formData, cim_field: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
              >
                <option value="">Select field...</option>
                {selectedModel?.fields.map(f => (
                  <option key={f.name} value={f.name}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Transform (optional)
            </label>
            <input
              type="text"
              value={formData.transform}
              onChange={(e) => setFormData({ ...formData, transform: e.target.value })}
              placeholder="e.g., lower(), int(), float() * 1000"
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">
              Transforms: lower(), upper(), trim(), int(), float(), substr(0,10)
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Priority
              </label>
              <input
                type="number"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  className="w-4 h-4 text-sky-500 rounded border-slate-300 focus:ring-sky-500"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Enabled
                </span>
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {mutation.isPending ? 'Saving...' : mapping ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
