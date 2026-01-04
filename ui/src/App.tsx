import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  LayoutDashboard,
  Activity,
  Database,
  FileText,
  FileBarChart,
  ChevronRight,
  ChevronDown,
  BookOpen,
  Settings,
  LogOut,
  User,
  Github,
  ExternalLink,
  Bell,
  Menu,
  X,
  Radar,
  Server,
  Users,
  Layers,
  Bot,
  Sparkles,
  Bookmark,
} from 'lucide-react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DateFormatProvider } from './contexts/DateFormatContext';
import ThemeToggle from './components/ThemeToggle';
import NogChat from './components/NogChat';
import AnimatedPage from './components/ui/AnimatedPage';
import WelcomeWizard from './components/onboarding/WelcomeWizard';
import { useOnboarding } from './hooks/useOnboarding';
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
import DataSourcesPage from './pages/DataSourcesPage';
import AnomalyPage from './pages/AnomalyPage';
import AssetsPage from './pages/AssetsPage';
import IdentitiesPage from './pages/IdentitiesPage';
import CIMPage from './pages/CIMPage';
import AgentPage from './pages/AgentPage';
import SyntheticPage from './pages/SyntheticPage';
import OnboardingPage from './pages/OnboardingPage';
import SavedSearchesPage from './pages/SavedSearchesPage';
import PublicDashboardPage from './pages/PublicDashboardPage';
import LoginNotificationsModal from './components/LoginNotificationsModal';

interface NavLinkProps {
  to: string;
  icon: React.ElementType;
  children: React.ReactNode;
  onClick?: () => void;
}

function NavLink({ to, icon: Icon, children, onClick }: NavLinkProps) {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      onClick={onClick}
      className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
        isActive
          ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/25'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:translate-x-0.5 dark:text-nog-400 dark:hover:bg-nog-800 dark:hover:text-nog-100'
      }`}
    >
      <Icon className={`w-5 h-5 flex-shrink-0 transition-transform duration-200 ${isActive ? '' : 'text-slate-400 group-hover:text-slate-600 group-hover:scale-110 dark:group-hover:text-nog-300'}`} />
      <span className="font-medium truncate">{children}</span>
      {isActive && <ChevronRight className="w-4 h-4 ml-auto opacity-75 animate-pulse flex-shrink-0" />}
    </Link>
  );
}

// Collapsible navigation group component
interface NavGroupProps {
  title: string;
  storageKey: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

function NavGroup({ title, storageKey, defaultExpanded = true, children }: NavGroupProps) {
  const [isExpanded, setIsExpanded] = useState(() => {
    const stored = localStorage.getItem(`nav-group-${storageKey}`);
    return stored !== null ? stored === 'true' : defaultExpanded;
  });

  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => {
      const newValue = !prev;
      localStorage.setItem(`nav-group-${storageKey}`, String(newValue));
      return newValue;
    });
  }, [storageKey]);

  return (
    <div className="mb-2">
      <button
        onClick={toggleExpanded}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-400 dark:text-nog-500 uppercase tracking-wider hover:text-slate-600 dark:hover:text-nog-300 transition-colors group"
      >
        <span className="transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
          <ChevronDown className="w-3.5 h-3.5" />
        </span>
        <span>{title}</span>
      </button>
      <div
        className={`space-y-1 overflow-hidden transition-all duration-200 ease-in-out ${
          isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();

  return (
    <div className="p-4 border-t border-slate-100 dark:border-nog-700">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-amber-600 rounded-full flex items-center justify-center">
          <User className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 dark:text-nog-100 truncate">
            {user?.username}
          </p>
          <p className="text-xs text-slate-500 dark:text-nog-400 capitalize">
            {user?.role}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Link
          to="/settings"
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 dark:text-nog-400 dark:hover:text-nog-100 hover:bg-slate-100 dark:hover:bg-nog-700 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95"
        >
          <Settings className="w-4 h-4" />
          Settings
        </Link>
        <button
          onClick={logout}
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Close sidebar on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-nog-900">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white dark:bg-nog-800 border-b border-slate-200 dark:border-nog-700 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-nog-700 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6 text-slate-600 dark:text-nog-300" />
        </button>
        <img src="/logo.png" alt="LogNog" className="w-8 h-8 rounded-lg shadow" />
        <span className="font-bold text-lg text-slate-900 dark:text-nog-100">LogNog</span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-72 lg:w-64 bg-white dark:bg-nog-800
        border-r border-slate-200 dark:border-nog-700
        flex flex-col shadow-sm
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="p-4 border-b border-slate-100 dark:border-nog-700">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="LogNog"
              className="w-10 h-10 rounded-xl shadow-lg flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-xl text-slate-900 dark:text-nog-100">LogNog</h1>
              <p className="text-xs text-slate-500 dark:text-nog-400 truncate">Your Logs, Your Control</p>
            </div>
            {/* Close button on mobile, theme toggle on desktop */}
            <button
              onClick={closeSidebar}
              className="lg:hidden p-2 -mr-2 rounded-lg hover:bg-slate-100 dark:hover:bg-nog-700 transition-colors"
              aria-label="Close menu"
            >
              <X className="w-5 h-5 text-slate-600 dark:text-nog-300" />
            </button>
            <div className="hidden lg:block">
              <ThemeToggle />
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 overflow-y-auto">
          <NavGroup title="Explore" storageKey="explore" defaultExpanded={true}>
            <NavLink to="/search" icon={Search} onClick={closeSidebar}>Search</NavLink>
            <NavLink to="/saved-searches" icon={Bookmark} onClick={closeSidebar}>Saved Searches</NavLink>
            <NavLink to="/dashboards" icon={LayoutDashboard} onClick={closeSidebar}>Dashboards</NavLink>
          </NavGroup>

          <NavGroup title="Monitor" storageKey="monitor" defaultExpanded={true}>
            <NavLink to="/alerts" icon={Bell} onClick={closeSidebar}>Alerts</NavLink>
            <NavLink to="/anomaly" icon={Radar} onClick={closeSidebar}>Anomaly Detection</NavLink>
            <NavLink to="/synthetic" icon={Activity} onClick={closeSidebar}>Synthetic</NavLink>
          </NavGroup>

          <NavGroup title="Analyze" storageKey="analyze" defaultExpanded={true}>
            <NavLink to="/stats" icon={Activity} onClick={closeSidebar}>Analytics</NavLink>
            <NavLink to="/reports" icon={FileBarChart} onClick={closeSidebar}>Reports</NavLink>
          </NavGroup>

          <NavGroup title="Configure" storageKey="configure" defaultExpanded={false}>
            <NavLink to="/data-sources" icon={Database} onClick={closeSidebar}>Data Sources</NavLink>
            <NavLink to="/cim" icon={Layers} onClick={closeSidebar}>Data Models</NavLink>
            <NavLink to="/knowledge" icon={BookOpen} onClick={closeSidebar}>Knowledge</NavLink>
            <NavLink to="/assets" icon={Server} onClick={closeSidebar}>Assets</NavLink>
            <NavLink to="/identities" icon={Users} onClick={closeSidebar}>Identities</NavLink>
          </NavGroup>

          <NavGroup title="Tools" storageKey="tools" defaultExpanded={false}>
            <NavLink to="/agent" icon={Bot} onClick={closeSidebar}>AI Agent</NavLink>
            <NavLink to="/onboarding" icon={Sparkles} onClick={closeSidebar}>AI Onboarding</NavLink>
            <NavLink to="/docs" icon={FileText} onClick={closeSidebar}>Documentation</NavLink>
          </NavGroup>
        </nav>

        {/* Connection Status - hide on small screens to save space */}
        <div className="hidden sm:block p-4 border-t border-slate-100 dark:border-nog-700">
          <div className="p-3 bg-slate-50 dark:bg-nog-900 rounded-lg">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-nog-400">
              <Database className="w-4 h-4 text-amber-500 dark:text-amber-400 flex-shrink-0" />
              <span className="truncate">ClickHouse Connected</span>
            </div>
            <p className="text-xs text-slate-400 dark:text-nog-500 mt-1 truncate">
              Ready to receive logs on port 514
            </p>
          </div>
        </div>

        {/* User Menu */}
        <UserMenu />

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-nog-700">
          <div className="flex items-center justify-between text-xs text-slate-400 dark:text-nog-500">
            <span className="truncate">Machine King Labs</span>
            <a
              href="https://github.com/machinekinglabs/lognog"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-slate-600 dark:hover:text-nog-300 transition-colors flex-shrink-0"
            >
              <Github className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">GitHub</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto pt-14 lg:pt-0">
        {children}
      </main>

      {/* NogChat - Intelligent Assistant */}
      <NogChat />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, setupRequired, loginNotifications, clearLoginNotifications } = useAuth();
  const { showWizard, isLoading: onboardingLoading, completeOnboarding } = useOnboarding();
  const [showNotifications, setShowNotifications] = useState(true);

  if (isLoading || onboardingLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-nog-900">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || setupRequired) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      {showWizard && (
        <WelcomeWizard
          onComplete={completeOnboarding}
          onSkip={completeOnboarding}
        />
      )}
      {/* Show login notifications modal if there are pending notifications (but not during onboarding) */}
      {!showWizard && showNotifications && loginNotifications.length > 0 && (
        <LoginNotificationsModal
          notifications={loginNotifications}
          onClose={() => setShowNotifications(false)}
          onNotificationsDismissed={clearLoginNotifications}
        />
      )}
      {children}
    </>
  );
}

function AppRoutes() {
  const { isAuthenticated, isLoading, setupRequired } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-nog-900">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
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

      {/* Public dashboard route - no auth required */}
      <Route path="/public/dashboard/:token" element={<PublicDashboardPage />} />

      {/* Protected routes */}
      <Route
        path="/search"
        element={
          <ProtectedRoute>
            <Layout>
              <AnimatedPage>
                <SearchPage />
              </AnimatedPage>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/saved-searches"
        element={
          <ProtectedRoute>
            <Layout>
              <AnimatedPage>
                <SavedSearchesPage />
              </AnimatedPage>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboards"
        element={
          <ProtectedRoute>
            <Layout>
              <AnimatedPage>
                <DashboardsPage />
              </AnimatedPage>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboards/:id"
        element={
          <ProtectedRoute>
            <Layout>
              <AnimatedPage>
                <DashboardViewPage />
              </AnimatedPage>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/alerts"
        element={
          <ProtectedRoute>
            <Layout>
              <AnimatedPage>
                <AlertsPage />
              </AnimatedPage>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/anomaly"
        element={
          <ProtectedRoute>
            <Layout>
              <AnimatedPage>
                <AnomalyPage />
              </AnimatedPage>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/assets"
        element={
          <ProtectedRoute>
            <Layout>
              <AnimatedPage>
                <AssetsPage />
              </AnimatedPage>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/identities"
        element={
          <ProtectedRoute>
            <Layout>
              <AnimatedPage>
                <IdentitiesPage />
              </AnimatedPage>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/cim"
        element={
          <ProtectedRoute>
            <Layout>
              <AnimatedPage>
                <CIMPage />
              </AnimatedPage>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/agent"
        element={
          <ProtectedRoute>
            <Layout>
              <AnimatedPage>
                <AgentPage />
              </AnimatedPage>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/synthetic"
        element={
          <ProtectedRoute>
            <Layout>
              <AnimatedPage>
                <SyntheticPage />
              </AnimatedPage>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/silences"
        element={
          <ProtectedRoute>
            <Layout>
              <AnimatedPage>
                <SilencesPage />
              </AnimatedPage>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/data-sources"
        element={
          <ProtectedRoute>
            <Layout>
              <AnimatedPage>
                <DataSourcesPage />
              </AnimatedPage>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/stats"
        element={
          <ProtectedRoute>
            <Layout>
              <AnimatedPage>
                <StatsPage />
              </AnimatedPage>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <Layout>
              <AnimatedPage>
                <ReportsPage />
              </AnimatedPage>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/knowledge"
        element={
          <ProtectedRoute>
            <Layout>
              <AnimatedPage>
                <KnowledgePage />
              </AnimatedPage>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/docs"
        element={
          <ProtectedRoute>
            <Layout>
              <AnimatedPage>
                <DocsPage />
              </AnimatedPage>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <Layout>
              <AnimatedPage>
                <OnboardingPage />
              </AnimatedPage>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Layout>
              <AnimatedPage>
                <SettingsPage />
              </AnimatedPage>
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
      <DateFormatProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </DateFormatProvider>
    </ThemeProvider>
  );
}
