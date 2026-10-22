import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import {
  Database,
  ChevronRight,
  ChevronDown,
  Settings,
  LogOut,
  User,
  Github,
  ExternalLink,
  Menu,
  X,
  MoreHorizontal,
} from 'lucide-react';
import { MAIN_NAV, MORE_NAV, MORE_ITEMS, MORE_STORAGE_KEY, isNavActive, readStoredBool, writeStoredBool } from './nav/navItems';
import { useQuery } from '@tanstack/react-query';
import { getHealth } from './api/client';
import { ThemeProvider } from './contexts/ThemeContext';

/**
 * Sidebar card: which log store this instance runs on and whether it is
 * reachable (was a hardcoded "Backend: ClickHouse", wrong on Lite installs).
 */
function BackendStatus() {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: 30_000,
    retry: false,
  });
  const backend = health?.backend === 'sqlite' ? 'SQLite (Lite)' : health?.backend === 'clickhouse' ? 'ClickHouse' : '…';
  const storeStatus = health ? (health.services?.store ?? health.services?.clickhouse) : undefined;
  const queued = health?.ingest_spool?.events ?? 0;
  const dot = !health ? 'bg-nog-300' : storeStatus === 'ok' ? 'bg-green-500' : 'bg-red-500';
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 text-xs text-nog-500 dark:text-nog-400">
        <Database className="w-4 h-4 text-honey-500 dark:text-honey-400 flex-shrink-0" />
        <span className="truncate">Backend: {backend}</span>
        <span
          className={`ml-auto w-2 h-2 rounded-full flex-shrink-0 ${dot}`}
          title={!health ? 'Checking…' : storeStatus === 'ok' ? 'Log store reachable' : 'Log store unreachable'}
        />
      </div>
      <p className="text-xs text-nog-400 dark:text-nog-500 mt-1 truncate">
        {queued > 0
          ? `${queued.toLocaleString()} events queued for replay`
          : storeStatus && storeStatus !== 'ok'
            ? 'Log store unreachable'
            : 'Syslog ingest on port 514'}
      </p>
    </div>
  );
}
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DateFormatProvider } from './contexts/DateFormatContext';
import { MuteProvider } from './contexts/MuteContext';
import { ToastProvider } from './contexts/ToastContext';
import { ConfirmProvider } from './components/ui/ConfirmDialog';
import ThemeToggle from './components/ThemeToggle';
import HelpBot from './components/HelpBot';
import AnimatedPage from './components/ui/AnimatedPage';
import ErrorBoundary from './components/ErrorBoundary';
import WelcomeWizard from './components/onboarding/WelcomeWizard';
import { useOnboarding } from './hooks/useOnboarding';
import SearchPage from './pages/SearchPage';
import HomePage from './pages/HomePage';
import DashboardsPage from './pages/DashboardsPage';
import DashboardViewPage from './pages/DashboardViewPage';
import DashboardStudioPage from './pages/DashboardStudioPage';
import StatsPage from './pages/StatsPage';
import ReportsPage from './pages/ReportsPage';
import DocsPage from './pages/DocsPage';
import GuidePage from './pages/GuidePage';
import KnowledgePage from './pages/KnowledgePage';
import LoginPage from './pages/LoginPage';
import LandingPage from './pages/LandingPage';
import SettingsPage from './pages/SettingsPage';
import AlertsPage from './pages/AlertsPage';
import SilencesPage from './pages/SilencesPage';
import DataSourcesPage from './pages/DataSourcesPage';
import LabLightsPage from './pages/LabLightsPage';
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
  const isActive = isNavActive(location.pathname, to);

  return (
    <Link
      to={to}
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
        isActive
          ? 'bg-gradient-to-r from-honey-500 to-honey-600 text-nog-900 shadow-md shadow-honey-500/25'
          : 'text-nog-600 hover:bg-nog-100 hover:text-nog-900 hover:translate-x-0.5 dark:text-nog-400 dark:hover:bg-nog-800 dark:hover:text-nog-100'
      }`}
    >
      <Icon className={`w-5 h-5 flex-shrink-0 transition-transform duration-200 ${isActive ? '' : 'text-nog-400 group-hover:text-nog-600 group-hover:scale-110 dark:group-hover:text-nog-300'}`} />
      <span className="font-medium truncate">{children}</span>
      {isActive && <ChevronRight className="w-4 h-4 ml-auto opacity-75 flex-shrink-0" />}
    </Link>
  );
}

/**
 * Quiet mode's "More" group: every page that isn't used daily (see
 * nav/navItems.ts). Collapsed by default; open/closed is remembered per
 * browser (storage errors are ignored). While collapsed, the page you are
 * on still shows under the header so you never lose your place.
 */
function MoreGroup({ onNavigate }: { onNavigate: () => void }) {
  const location = useLocation();
  const [isExpanded, setIsExpanded] = useState(() => readStoredBool(MORE_STORAGE_KEY, false));

  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => {
      const next = !prev;
      writeStoredBool(MORE_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const activeHere = MORE_ITEMS.filter(item => isNavActive(location.pathname, item.to));

  return (
    <div className="mt-3 pt-3 border-t border-nog-100 dark:border-nog-700" data-testid="nav-more">
      <button
        type="button"
        onClick={toggleExpanded}
        aria-expanded={isExpanded}
        aria-controls="nav-more-items"
        title={isExpanded ? 'Hide the other pages' : 'Show the other pages'}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-nog-500 dark:text-nog-400 uppercase tracking-wider hover:bg-nog-100 hover:text-nog-700 dark:hover:bg-nog-700/60 dark:hover:text-nog-200 transition-colors"
      >
        <span className="transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
          <ChevronDown className="w-3.5 h-3.5" />
        </span>
        <MoreHorizontal className="w-4 h-4" />
        <span>More</span>
        <span className="ml-auto min-w-[1.5rem] px-1.5 py-0.5 rounded-full bg-honey-100 text-honey-800 dark:bg-honey-900/40 dark:text-honey-300 text-[11px] font-semibold normal-case tracking-normal text-center">
          {MORE_ITEMS.length}
        </span>
      </button>

      {isExpanded ? (
        <div id="nav-more-items" className="mt-1 space-y-3">
          {MORE_NAV.map(section => (
            <div key={section.title}>
              <p className="px-3 pt-1 pb-1 text-[11px] font-medium text-nog-400 dark:text-nog-500">{section.title}</p>
              <div className="space-y-1">
                {section.items.map(item => (
                  <NavLink key={item.to} to={item.to} icon={item.icon} onClick={onNavigate}>{item.label}</NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        activeHere.length > 0 && (
          <div id="nav-more-items" className="mt-1 space-y-1">
            {activeHere.map(item => (
              <NavLink key={item.to} to={item.to} icon={item.icon} onClick={onNavigate}>{item.label}</NavLink>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();

  return (
    <div className="p-4 border-t border-nog-100 dark:border-nog-700">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 bg-gradient-to-br from-honey-400 to-honey-600 rounded-full flex items-center justify-center">
          <User className="w-4 h-4 text-nog-900" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-nog-900 dark:text-nog-100 truncate">
            {user?.username}
          </p>
          <p className="text-xs text-nog-500 dark:text-nog-400 capitalize">
            {user?.role}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Link
          to="/settings"
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-nog-600 hover:text-nog-900 dark:text-nog-400 dark:hover:text-nog-100 hover:bg-nog-100 dark:hover:bg-nog-700 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95"
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
    <div className="min-h-screen flex bg-nog-50 dark:bg-nog-900">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white dark:bg-nog-800 border-b border-nog-200 dark:border-nog-700 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 -ml-2 rounded-lg hover:bg-nog-100 dark:hover:bg-nog-700 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6 text-nog-600 dark:text-nog-300" />
        </button>
        <img src="/logo.png" alt="LogNog" className="w-8 h-8 rounded-lg shadow" />
        <span className="font-bold text-lg text-nog-900 dark:text-nog-100">LogNog</span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-nog-950/60 backdrop-blur-sm transition-opacity"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-72 lg:w-64 bg-white dark:bg-nog-800
        border-r border-nog-200 dark:border-nog-700
        flex flex-col shadow-sm
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="p-4 border-b border-nog-100 dark:border-nog-700">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="LogNog"
              className="w-10 h-10 rounded-xl shadow-lg flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-xl text-nog-900 dark:text-nog-100">LogNog</h1>
              <p className="text-xs text-nog-500 dark:text-nog-400 leading-tight">Your Logs, Your Control</p>
            </div>
            {/* Close button on mobile only */}
            <button
              onClick={closeSidebar}
              className="lg:hidden p-2 -mr-2 rounded-lg hover:bg-nog-100 dark:hover:bg-nog-700 transition-colors flex-shrink-0"
              aria-label="Close menu"
            >
              <X className="w-5 h-5 text-nog-600 dark:text-nog-300" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 overflow-y-auto" aria-label="Main">
          {/* Main group (quiet mode): MAIN_NAV in nav/navItems.ts, Home first. */}
          <div className="space-y-1" data-testid="nav-main">
            {MAIN_NAV.map(item => (
              <NavLink key={item.to} to={item.to} icon={item.icon} onClick={closeSidebar}>{item.label}</NavLink>
            ))}
          </div>

          <MoreGroup onNavigate={closeSidebar} />
        </nav>

        {/* Backend info + theme toggle - hide on small screens to save space */}
        <div className="hidden sm:block p-4 border-t border-nog-100 dark:border-nog-700">
          <div className="p-3 bg-nog-50 dark:bg-nog-900 rounded-lg flex items-center gap-3">
            <BackendStatus />
            <div className="hidden lg:block flex-shrink-0">
              <ThemeToggle />
            </div>
          </div>
        </div>

        {/* User Menu */}
        <UserMenu />

        {/* Footer */}
        <div className="p-4 border-t border-nog-100 dark:border-nog-700">
          <div className="flex items-center justify-between text-xs text-nog-400 dark:text-nog-500">
            <span className="truncate">Machine King Labs</span>
            <a
              href="https://github.com/machinekinglabs/lognog"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-nog-600 dark:hover:text-nog-300 transition-colors flex-shrink-0"
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
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </main>

      {/* Help bot — answers guide questions (with deep-link citations) and
          questions about the user's live logs (NL→DSL, with a Search link). */}
      <HelpBot />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, setupRequired, loginNotifications, clearLoginNotifications } = useAuth();
  const { showWizard, isLoading: onboardingLoading, completeOnboarding } = useOnboarding();
  const [showNotifications, setShowNotifications] = useState(true);

  if (isLoading || onboardingLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-nog-50 dark:bg-nog-900">
        <div className="w-8 h-8 border-4 border-honey-500 border-t-transparent rounded-full animate-spin" />
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
      <div className="min-h-screen flex items-center justify-center bg-nog-50 dark:bg-nog-900">
        <div className="w-8 h-8 border-4 border-honey-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      {/* Landing page - public, redirects to Home if authenticated */}
      <Route
        path="/"
        element={
          isAuthenticated && !setupRequired ? (
            <Navigate to="/home" replace />
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
            <Navigate to="/home" replace />
          ) : (
            <LoginPage />
          )
        }
      />

      {/* Public dashboard route - no auth required */}
      <Route path="/public/dashboard/:token" element={<PublicDashboardPage />} />

      {/* Protected routes */}
      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <Layout>
              <AnimatedPage>
                <HomePage />
              </AnimatedPage>
            </Layout>
          </ProtectedRoute>
        }
      />
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
        path="/dashboards/studio"
        element={
          <ProtectedRoute>
            <Layout>
              <AnimatedPage>
                <DashboardStudioPage />
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
        path="/lights"
        element={
          <ProtectedRoute>
            <Layout>
              <AnimatedPage>
                <LabLightsPage />
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
        path="/guide"
        element={
          <ProtectedRoute>
            <Layout>
              <AnimatedPage>
                <GuidePage />
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
          <MuteProvider>
            <ToastProvider>
              <ConfirmProvider>
                <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                  <AppRoutes />
                </BrowserRouter>
              </ConfirmProvider>
            </ToastProvider>
          </MuteProvider>
        </AuthProvider>
      </DateFormatProvider>
    </ThemeProvider>
  );
}
