import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  User,
  UserCog,
  Bot,
  Globe,
  Plus,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  Shield,
  ShieldAlert,
  CheckCircle,
  XCircle,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react';
import {
  getIdentities,
  getIdentityStats,
  createIdentity,
  updateIdentity,
  deleteIdentity,
  discoverIdentities,
  type Identity,
} from '../api/client';

const identityTypeIcons: Record<string, React.ElementType> = {
  user: User,
  service_account: UserCog,
  system: Bot,
  external: Globe,
};

const identityTypeLabels: Record<string, string> = {
  user: 'User',
  service_account: 'Service Account',
  system: 'System',
  external: 'External',
};

const statusColors: Record<string, string> = {
  active: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/30',
  inactive: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/30',
  disabled: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30',
};

function RiskBadge({ value }: { value: number }) {
  const color = value >= 80 ? 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30'
    : value >= 60 ? 'text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-900/30'
    : value >= 40 ? 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/30'
    : 'text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-700';

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {value}
    </span>
  );
}

export default function IdentitiesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [privilegedFilter, setPrivilegedFilter] = useState<string>('');
  const [showForm, setShowForm] = useState(false);
  const [editingIdentity, setEditingIdentity] = useState<Identity | null>(null);

  // Fetch identities
  const { data: identitiesData, isLoading } = useQuery({
    queryKey: ['identities', search, typeFilter, statusFilter, privilegedFilter],
    queryFn: () => getIdentities({
      search: search || undefined,
      identity_type: typeFilter || undefined,
      status: statusFilter || undefined,
      is_privileged: privilegedFilter || undefined,
    }),
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['identities', 'stats'],
    queryFn: getIdentityStats,
  });

  // Discovery mutation
  const discoverMutation = useMutation({
    mutationFn: () => discoverIdentities(24),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['identities'] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteIdentity(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['identities'] });
    },
  });

  const identities = identitiesData?.identities || [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Identities</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage users, service accounts, and external identities
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => discoverMutation.mutate()}
            disabled={discoverMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${discoverMutation.isPending ? 'animate-spin' : ''}`} />
            Discover
          </button>
          <button
            onClick={() => { setEditingIdentity(null); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Identity
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stats.total}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Total Identities</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {stats.privileged_count}
              </div>
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Privileged</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {stats.by_type?.user || 0}
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Users</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {stats.by_type?.service_account || 0}
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Service Accounts</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search identities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div className="relative">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="appearance-none pl-4 pr-10 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">All Types</option>
            <option value="user">User</option>
            <option value="service_account">Service Account</option>
            <option value="system">System</option>
            <option value="external">External</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none pl-4 pr-10 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="disabled">Disabled</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={privilegedFilter}
            onChange={(e) => setPrivilegedFilter(e.target.value)}
            className="appearance-none pl-4 pr-10 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">All Privilege</option>
            <option value="true">Privileged Only</option>
            <option value="false">Non-Privileged</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Identities Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Identity</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Privileged</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Risk</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Department</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Last Seen</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Loading...
                  </td>
                </tr>
              ) : identities.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No identities found. Try running discovery or add one manually.
                  </td>
                </tr>
              ) : (
                identities.map((identity) => {
                  const Icon = identityTypeIcons[identity.identity_type] || User;
                  return (
                    <tr key={identity.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            identity.is_privileged
                              ? 'bg-amber-100 dark:bg-amber-900/30'
                              : 'bg-slate-100 dark:bg-slate-700'
                          }`}>
                            <Icon className={`w-4 h-4 ${
                              identity.is_privileged
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-slate-600 dark:text-slate-300'
                            }`} />
                          </div>
                          <div>
                            <div className="font-medium text-slate-900 dark:text-slate-100">
                              {identity.display_name || identity.identifier}
                            </div>
                            {identity.display_name && (
                              <div className="text-xs text-slate-500">{identity.identifier}</div>
                            )}
                            {identity.email && (
                              <div className="text-xs text-slate-400">{identity.email}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-600 dark:text-slate-300">
                          {identityTypeLabels[identity.identity_type] || identity.identity_type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${statusColors[identity.status]}`}>
                          {identity.status === 'active' && <CheckCircle className="w-3 h-3" />}
                          {identity.status === 'inactive' && <AlertTriangle className="w-3 h-3" />}
                          {identity.status === 'disabled' && <XCircle className="w-3 h-3" />}
                          {identity.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {identity.is_privileged ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/30">
                            <Shield className="w-3 h-3" />
                            Yes
                          </span>
                        ) : (
                          <span className="text-sm text-slate-400">No</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <RiskBadge value={identity.risk_score} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-600 dark:text-slate-300">
                          {identity.department || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          {identity.last_seen ? new Date(identity.last_seen).toLocaleDateString() : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => { setEditingIdentity(identity); setShowForm(true); }}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4 text-slate-500" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Delete this identity?')) {
                                deleteMutation.mutate(identity.id);
                              }
                            }}
                            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Identity Form Modal */}
      {showForm && (
        <IdentityFormModal
          identity={editingIdentity}
          onClose={() => { setShowForm(false); setEditingIdentity(null); }}
          onSave={() => {
            queryClient.invalidateQueries({ queryKey: ['identities'] });
            setShowForm(false);
            setEditingIdentity(null);
          }}
        />
      )}
    </div>
  );
}

function IdentityFormModal({
  identity,
  onClose,
  onSave,
}: {
  identity: Identity | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [formData, setFormData] = useState({
    identity_type: identity?.identity_type || 'user',
    identifier: identity?.identifier || '',
    display_name: identity?.display_name || '',
    email: identity?.email || '',
    department: identity?.department || '',
    title: identity?.title || '',
    manager: identity?.manager || '',
    is_privileged: identity?.is_privileged || false,
    risk_score: identity?.risk_score || 0,
    status: identity?.status || 'active',
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (identity) {
        await updateIdentity(identity.id, formData);
      } else {
        await createIdentity(formData);
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
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {identity ? 'Edit Identity' : 'Add Identity'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Type
              </label>
              <select
                value={formData.identity_type}
                onChange={(e) => setFormData({ ...formData, identity_type: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
              >
                <option value="user">User</option>
                <option value="service_account">Service Account</option>
                <option value="system">System</option>
                <option value="external">External</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Identifier *
            </label>
            <input
              type="text"
              required
              value={formData.identifier}
              onChange={(e) => setFormData({ ...formData, identifier: e.target.value })}
              placeholder="Username, email, or unique ID"
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                placeholder="Full name"
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Department
              </label>
              <input
                type="text"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Title
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Manager
            </label>
            <input
              type="text"
              value={formData.manager}
              onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Risk Score (0-100)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={formData.risk_score}
                onChange={(e) => setFormData({ ...formData, risk_score: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_privileged}
                  onChange={(e) => setFormData({ ...formData, is_privileged: e.target.checked })}
                  className="w-4 h-4 text-amber-500 rounded border-slate-300 focus:ring-amber-500"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Privileged Account
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
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {mutation.isPending ? 'Saving...' : identity ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
