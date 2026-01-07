import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { LoginNotification } from '../api/client';

const API_BASE = '/api';

export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user' | 'readonly';
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  permissions: string;
  last_used: string | null;
  expires_at: string | null;
  is_active: number;
  created_at: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setupRequired: boolean | null;
  loginNotifications: LoginNotification[];
}

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setup: (username: string, email: string, password: string) => Promise<void>;
  refreshAuth: () => Promise<void>;
  getApiKeys: () => Promise<ApiKey[]>;
  createApiKey: (name: string, permissions?: string[], expiresInDays?: number) => Promise<{ apiKey: string; keyData: ApiKey }>;
  revokeApiKey: (keyId: string) => Promise<void>;
  // Admin functions
  getUsers: () => Promise<User[]>;
  createUser: (username: string, email: string, password: string, role: string) => Promise<User>;
  updateUserRole: (userId: string, role: string) => Promise<void>;
  deactivateUser: (userId: string) => Promise<void>;
  activateUser: (userId: string) => Promise<void>;
  // Login notifications
  clearLoginNotifications: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Token management
const ACCESS_TOKEN_KEY = 'lognog_access_token';
const REFRESH_TOKEN_KEY = 'lognog_refresh_token';

function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

// Helper to read CSRF token from cookie
function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)lognog_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// Token refresh lock to prevent multiple simultaneous refresh attempts
let refreshPromise: Promise<boolean> | null = null;

// Authenticated request helper
export async function authFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  // Wait for any ongoing token refresh to complete before making request
  if (refreshPromise) {
    await refreshPromise;
  }

  const token = getAccessToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  // Add CSRF token for state-changing methods
  const method = options.method?.toUpperCase() || 'GET';
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      (headers as Record<string, string>)['X-CSRF-Token'] = csrfToken;
    }
  }

  let response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // Ensure cookies are sent
  });

  // If 401 and we have a refresh token, try to refresh
  if (response.status === 401 && getRefreshToken()) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      // Retry with new token
      (headers as Record<string, string>)['Authorization'] = `Bearer ${getAccessToken()}`;
      response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include',
      });
    }
  }

  return response;
}

async function refreshTokens(): Promise<boolean> {
  // If a refresh is already in progress, wait for it
  if (refreshPromise) {
    return refreshPromise;
  }

  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  // Create a new refresh promise that other requests will wait for
  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        clearTokens();
        return false;
      }

      const data = await response.json();
      setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      clearTokens();
      return false;
    } finally {
      // Clear the promise when done
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    setupRequired: null,
    loginNotifications: [],
  });

  // Check if setup is required
  const checkSetup = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/setup-required`);
      const data = await response.json();
      return data.setupRequired;
    } catch {
      return null;
    }
  }, []);

  // Refresh authentication state
  const refreshAuth = useCallback(async () => {
    const token = getAccessToken();

    if (!token) {
      const setupRequired = await checkSetup();
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        setupRequired,
        loginNotifications: [],
      });
      return;
    }

    try {
      const response = await authFetch('/auth/me');

      if (response.ok) {
        const user = await response.json();
        setState((prev) => ({
          ...prev,
          user,
          isAuthenticated: true,
          isLoading: false,
          setupRequired: false,
        }));
      } else {
        clearTokens();
        const setupRequired = await checkSetup();
        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          setupRequired,
          loginNotifications: [],
        });
      }
    } catch {
      clearTokens();
      const setupRequired = await checkSetup();
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        setupRequired,
        loginNotifications: [],
      });
    }
  }, [checkSetup]);

  // Initialize auth state on mount
  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  // Login
  const login = async (username: string, password: string) => {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();
    setTokens(data.accessToken, data.refreshToken);
    setState({
      user: data.user,
      isAuthenticated: true,
      isLoading: false,
      setupRequired: false,
      loginNotifications: data.notifications || [],
    });
  };

  // Logout
  const logout = async () => {
    try {
      await authFetch('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore errors on logout
    }
    clearTokens();
    setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      setupRequired: false,
      loginNotifications: [],
    });
  };

  // Clear login notifications (after they've been dismissed)
  const clearLoginNotifications = () => {
    setState((prev) => ({
      ...prev,
      loginNotifications: [],
    }));
  };

  // Initial setup
  const setup = async (username: string, email: string, password: string) => {
    const response = await fetch(`${API_BASE}/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Setup failed');
    }

    // After setup, log in automatically
    await login(username, password);
  };

  // API Keys management
  const getApiKeys = async (): Promise<ApiKey[]> => {
    const response = await authFetch('/auth/api-keys');
    if (!response.ok) throw new Error('Failed to get API keys');
    return response.json();
  };

  const createApiKey = async (
    name: string,
    permissions: string[] = ['read'],
    expiresInDays?: number
  ): Promise<{ apiKey: string; keyData: ApiKey }> => {
    const response = await authFetch('/auth/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name, permissions, expiresInDays }),
    });
    if (!response.ok) throw new Error('Failed to create API key');
    return response.json();
  };

  const revokeApiKey = async (keyId: string): Promise<void> => {
    const response = await authFetch(`/auth/api-keys/${keyId}/revoke`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to revoke API key');
  };

  // Admin: Get all users
  const getUsers = async (): Promise<User[]> => {
    const response = await authFetch('/auth/users');
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get users');
    }
    return response.json();
  };

  // Admin: Create a new user
  const createUser = async (
    username: string,
    email: string,
    password: string,
    role: string
  ): Promise<User> => {
    const response = await authFetch('/auth/users', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, role }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create user');
    }
    const data = await response.json();
    return data.user;
  };

  // Admin: Update user role
  const updateUserRole = async (userId: string, role: string): Promise<void> => {
    const response = await authFetch(`/auth/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update user role');
    }
  };

  // Admin: Deactivate user
  const deactivateUser = async (userId: string): Promise<void> => {
    const response = await authFetch(`/auth/users/${userId}/deactivate`, {
      method: 'POST',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to deactivate user');
    }
  };

  // Admin: Activate user
  const activateUser = async (userId: string): Promise<void> => {
    const response = await authFetch(`/auth/users/${userId}/activate`, {
      method: 'POST',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to activate user');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        setup,
        refreshAuth,
        getApiKeys,
        createApiKey,
        revokeApiKey,
        getUsers,
        createUser,
        updateUserRole,
        deactivateUser,
        activateUser,
        clearLoginNotifications,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
