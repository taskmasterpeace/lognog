import { useState, useEffect } from 'react';
import { useAuth, User as UserType } from '../../../contexts/AuthContext';
import {
  Users,
  UserPlus,
  UserX,
  UserCheck,
  Check,
  AlertCircle,
  Loader2,
  Clock,
  XCircle,
  RefreshCw,
} from 'lucide-react';

export default function UsersTab() {
  const {
    user,
    getUsers,
    createUser,
    updateUserRole,
    deactivateUser,
    activateUser,
  } = useAuth();

  const [allUsers, setAllUsers] = useState<UserType[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<string>('user');
  const [creatingUser, setCreatingUser] = useState(false);
  const [createUserSuccess, setCreateUserSuccess] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const users = await getUsers();
      setAllUsers(users);
    } catch (err) {
      // Provide specific error messages based on error type
      if (err instanceof Error) {
        const message = err.message.toLowerCase();
        if (message.includes('403') || message.includes('admin')) {
          setUsersError('Admin access required to view users');
        } else if (message.includes('401') || message.includes('unauthorized') || message.includes('expired')) {
          setUsersError('Session expired. Please log in again.');
        } else if (message.includes('network') || message.includes('fetch') || message.includes('insufficient')) {
          setUsersError('Network error. Please check your connection and try again.');
        } else {
          setUsersError(err.message);
        }
      } else {
        setUsersError('Failed to load users');
      }
    } finally {
      setUsersLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newEmail.trim() || !newUserPassword.trim()) return;

    setCreatingUser(true);
    setUsersError(null);
    try {
      await createUser(newUsername, newEmail, newUserPassword, newUserRole);
      setCreateUserSuccess(true);
      setShowCreateUser(false);
      setNewUsername('');
      setNewEmail('');
      setNewUserPassword('');
      setNewUserRole('user');
      await loadUsers();
      setTimeout(() => setCreateUserSuccess(false), 3000);
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await updateUserRole(userId, newRole);
      await loadUsers();
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleToggleUserActive = async (userId: string, isActive: boolean) => {
    try {
      if (isActive) {
        await deactivateUser(userId);
      } else {
        await activateUser(userId);
      }
      await loadUsers();
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Failed to update user status');
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        // Admin = honey accent (distinct, elevated)
        return 'bg-honey-100 text-honey-800 dark:bg-honey-900/30 dark:text-honey-400';
      case 'user':
        // User = neutral nog
        return 'bg-nog-100 text-nog-600 dark:bg-nog-700 dark:text-nog-400';
      case 'readonly':
        // Read-only = lighter neutral
        return 'bg-nog-50 text-nog-500 dark:bg-nog-800 dark:text-nog-500';
      default:
        return 'bg-nog-100 text-nog-600 dark:bg-nog-700 dark:text-nog-400';
    }
  };

  return (
    <section className="bg-white dark:bg-nog-800 rounded-xl shadow-sm border border-nog-200 dark:border-nog-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-nog-900 dark:text-nog-100 flex items-center gap-2">
          <Users className="w-5 h-5" />
          User Management
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={loadUsers}
            disabled={usersLoading}
            className="p-2 text-nog-400 hover:text-nog-600 dark:hover:text-nog-300 hover:bg-nog-100 dark:hover:bg-nog-700 rounded-lg transition-colors"
            title="Refresh users"
          >
            <RefreshCw className={`w-4 h-4 ${usersLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowCreateUser(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-honey-500 hover:bg-honey-600 text-nog-900 text-sm font-medium rounded-lg transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Add User
          </button>
        </div>
      </div>

      <p className="text-sm text-nog-500 dark:text-nog-400 mb-6">
        Manage user accounts, roles, and access permissions.
      </p>

      {/* Success message */}
      {createUserSuccess && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 flex items-center gap-2 text-green-700 dark:text-green-300 text-sm">
          <Check className="w-4 h-4" />
          User created successfully
        </div>
      )}

      {/* Error message */}
      {usersError && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 flex items-center gap-2 text-red-700 dark:text-red-300 text-sm">
          <AlertCircle className="w-4 h-4" />
          {usersError}
        </div>
      )}

      {/* Create user form */}
      {showCreateUser && (
        <div className="mb-6 p-4 bg-nog-50 dark:bg-nog-900/50 rounded-lg border border-nog-200 dark:border-nog-700">
          <h3 className="font-medium text-nog-900 dark:text-nog-100 mb-4 flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Create New User
          </h3>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-nog-700 dark:text-nog-300 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  required
                  pattern="[a-zA-Z0-9_-]+"
                  className="input"
                  placeholder="johndoe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-nog-700 dark:text-nog-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                  className="input"
                  placeholder="john@example.com"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-nog-700 dark:text-nog-300 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  name="new-user-password"
                  autoComplete="new-password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  required
                  minLength={8}
                  className="input"
                  placeholder="Min 8 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-nog-700 dark:text-nog-300 mb-1">
                  Role
                </label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value)}
                  className="input"
                >
                  <option value="user">User</option>
                  <option value="readonly">Read Only</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creatingUser}
                className="flex items-center gap-2 px-4 py-2 bg-honey-500 hover:bg-honey-600 text-nog-900 font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {creatingUser ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create User'
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateUser(false)}
                className="px-4 py-2 text-nog-600 hover:text-nog-800 dark:text-nog-400 dark:hover:text-nog-200 font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users list */}
      {usersLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-nog-400" />
        </div>
      ) : allUsers.length === 0 ? (
        <div className="text-center py-8 text-nog-500 dark:text-nog-400">
          No users found
        </div>
      ) : (
        <div className="space-y-3">
          {allUsers.map((u) => {
            const isCurrentUser = u.id === user?.id;
            return (
              <div
                key={u.id}
                className={`p-4 rounded-lg border ${
                  u.is_active
                    ? 'bg-white dark:bg-nog-900 border-nog-200 dark:border-nog-700'
                    : 'bg-nog-50 dark:bg-nog-900/50 border-nog-200 dark:border-nog-700 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium text-nog-900 dark:text-nog-100">
                        {u.username}
                        {isCurrentUser && (
                          <span className="ml-2 text-xs text-nog-500 dark:text-nog-400">(you)</span>
                        )}
                      </h4>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getRoleBadgeColor(u.role)}`}>
                        {u.role}
                      </span>
                      {!u.is_active && (
                        <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs rounded-full flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-nog-500 dark:text-nog-400 mt-1">{u.email}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-nog-400 dark:text-nog-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Last login: {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}
                      </span>
                      <span>
                        Created: {new Date(u.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  {!isCurrentUser && (
                    <div className="flex items-center gap-2">
                      {/* Role selector */}
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        className="px-2 py-1 text-sm border border-nog-300 dark:border-nog-600 rounded bg-white dark:bg-nog-800 text-nog-700 dark:text-nog-300"
                      >
                        <option value="user">User</option>
                        <option value="readonly">Read Only</option>
                        <option value="admin">Admin</option>
                      </select>

                      {/* Activate/Deactivate button */}
                      <button
                        onClick={() => handleToggleUserActive(u.id, u.is_active)}
                        className={`p-2 rounded-lg transition-colors ${
                          u.is_active
                            ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                            : 'text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20'
                        }`}
                        title={u.is_active ? 'Deactivate user' : 'Activate user'}
                      >
                        {u.is_active ? (
                          <UserX className="w-4 h-4" />
                        ) : (
                          <UserCheck className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Info footer */}
      <div className="mt-6 pt-4 border-t border-nog-200 dark:border-nog-700">
        <p className="text-xs text-nog-500 dark:text-nog-400">
          <strong>Roles:</strong> Admin has full access. User can search and view dashboards. Read Only can only view data.
        </p>
      </div>
    </section>
  );
}
