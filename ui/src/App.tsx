import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import {
  Search,
  LayoutDashboard,
  Activity,
  Database,
  FileText,
  FileBarChart,
  ChevronRight,
  BookOpen,
  Settings,
  LogOut,
  User,
  Github,
  ExternalLink,
  Bell,
} from 'lucide-react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ThemeToggle from './components/ThemeToggle';
import SearchPage from './pages/SearchPage';
import DashboardsPage from './pages/DashboardsPage';
import DashboardViewPage from './pages/DashboardViewPage';
import StatsPage from './pages/StatsPage';
import ReportsPage from './pages/ReportsPage';
import DocsPage from './pages/DocsPage';
import KnowledgePage from './pages/KnowledgePage';
import LoginPage from './pages/LoginPage';
import LandingPage from './pages/LandingPage';
import SettingsPage from './pages/SettingsPage';
import AlertsPage from './pages/AlertsPage';
import SilencesPage from './pages/SilencesPage';

interface NavLinkProps {
  to: string;
  icon: React.ElementType;
  children: React.ReactNode;
}

function NavLink({ to, icon: Icon, children }: NavLinkProps) {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
        isActive
          ? 'bg-gradient-to-r from-sky-500 to-sky-600 text-white shadow-md shadow-sky-500/25'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
      }`}
    >
      <Icon className={`w-5 h-5 ${isActive ? '' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`} />
      <span className="font-medium">{children}</span>
      {isActive && <ChevronRight className="w-4 h-4 ml-auto opacity-75" />}
    </Link>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();

  return (
    <div className="p-4 border-t border-slate-100 dark:border-slate-700">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 bg-gradient-to-br from-sky-400 to-sky-600 rounded-full flex items-center justify-center">
          <User className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
            {user?.username}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
            {user?.role}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Link
          to="/settings"
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
        >
          <Settings className="w-4 h-4" />
          Settings
        </Link>
        <button
          onClick={logout}
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-900">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col shadow-sm">
        {/* Logo */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="LogNog"
              className="w-10 h-10 rounded-xl shadow-lg"
            />
            <div className="flex-1">
              <h1 className="font-bold text-xl text-slate-900 dark:text-slate-100">LogNog</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Your Logs, Your Control</p>
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <p className="px-3 py-2 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Main
          </p>
          <NavLink to="/search" icon={Search}>Search & Explore</NavLink>
          <NavLink to="/dashboards" icon={LayoutDashboard}>Dashboards</NavLink>
          <NavLink to="/alerts" icon={Bell}>Alerts</NavLink>
          <NavLink to="/stats" icon={Activity}>Analytics</NavLink>
          <NavLink to="/reports" icon={FileBarChart}>Reports</NavLink>

          <p className="px-3 py-2 mt-6 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Configuration
          </p>
          <NavLink to="/knowledge" icon={BookOpen}>Knowledge</NavLink>

          <p className="px-3 py-2 mt-6 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Resources
          </p>
          <NavLink to="/docs" icon={FileText}>Documentation</NavLink>
        </nav>

        {/* Connection Status */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-700">
          <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Database className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              <span>ClickHouse Connected</span>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Ready to receive logs on port 514
            </p>
          </div>
        </div>

        {/* User Menu */}
        <UserMenu />

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
            <span>Machine King Labs</span>
            <a
              href="https://github.com/machinekinglabs/lognog"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <Github className="w-3.5 h-3.5" />
              <span>GitHub</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, setupRequired } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || setupRequired) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { isAuthenticated, isLoading, setupRequired } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      {/* Landing page - public, redirects to search if authenticated */}
      <Route
        path="/"
        element={
          isAuthenticated && !setupRequired ? (
            <Navigate to="/search" replace />
          ) : (
            <LandingPage />
          )
        }
      />

      {/* Login route */}
      <Route
        path="/login"
        element={
          isAuthenticated && !setupRequired ? (
            <Navigate to="/search" replace />
          ) : (
            <LoginPage />
          )
        }
      />

      {/* Protected routes */}
      <Route
        path="/search"
        element={
          <ProtectedRoute>
            <Layout>
              <SearchPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboards"
        element={
          <ProtectedRoute>
            <Layout>
              <DashboardsPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboards/:id"
        element={
          <ProtectedRoute>
            <Layout>
              <DashboardViewPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/alerts"
        element={
          <ProtectedRoute>
            <Layout>
              <AlertsPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/silences"
        element={
          <ProtectedRoute>
            <Layout>
              <SilencesPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/stats"
        element={
          <ProtectedRoute>
            <Layout>
              <StatsPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <Layout>
              <ReportsPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/knowledge"
        element={
          <ProtectedRoute>
            <Layout>
              <KnowledgePage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/docs"
        element={
          <ProtectedRoute>
            <Layout>
              <DocsPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Layout>
              <SettingsPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Catch all - redirect to search (or landing if not authenticated) */}
      <Route path="*" element={<Navigate to="/search" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
