import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  User,
  Users,
  Bell,
  Database,
  Globe,
  Cpu,
  Bot,
  Palette,
} from 'lucide-react';
import PreferencesTab from './tabs/PreferencesTab';
import AccountTab from './tabs/AccountTab';
import NotificationsTab from './tabs/NotificationsTab';
import DataTab from './tabs/DataTab';
import GeoIPTab from './tabs/GeoIPTab';
import UsersTab from './tabs/UsersTab';
import SystemTab from './tabs/SystemTab';
import AiTab from './tabs/AiTab';

// Tab configuration - base tabs for all users
const BASE_TABS = [
  { id: 'preferences', label: 'Preferences', icon: Palette },
  { id: 'account', label: 'Account', icon: User },
  { id: 'notifications', label: 'Notifications', icon: Bell },
] as const;

// Admin-only tabs
const ADMIN_TABS = [
  { id: 'users', label: 'Users', icon: Users },
  { id: 'data', label: 'Data', icon: Database },
  { id: 'geoip', label: 'GeoIP', icon: Globe },
  { id: 'system', label: 'System', icon: Cpu },
  { id: 'ai', label: 'AI', icon: Bot },
] as const;

type TabId = typeof BASE_TABS[number]['id'] | typeof ADMIN_TABS[number]['id'];

export default function SettingsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const isAdmin = user?.role === 'admin';
  const TABS = isAdmin ? [...BASE_TABS, ...ADMIN_TABS] : BASE_TABS;

  // Active tab is backed by the URL (?tab=...) so it's linkable and survives refresh.
  const tabParam = searchParams.get('tab');
  const isValidTab = TABS.some((t) => t.id === tabParam);
  const activeTab = (isValidTab ? tabParam : 'preferences') as TabId;

  const setActiveTab = (id: TabId) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', id);
      return next;
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-bold text-nog-900 dark:text-nog-100 mb-6">
        Settings
      </h1>

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-nog-200 dark:border-nog-700">
        <nav role="tablist" className="flex gap-1 overflow-x-auto pb-px -mb-px" aria-label="Settings tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                id={`settings-tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`settings-panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-honey-500 text-honey-600 dark:text-honey-400'
                    : 'border-transparent text-nog-500 hover:text-nog-700 dark:text-nog-400 dark:hover:text-nog-300 hover:border-nog-300 dark:hover:border-nog-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div
        role="tabpanel"
        id={`settings-panel-${activeTab}`}
        aria-labelledby={`settings-tab-${activeTab}`}
        className="min-h-[400px]"
      >
        {activeTab === 'preferences' && <PreferencesTab />}
        {activeTab === 'account' && <AccountTab />}
        {activeTab === 'notifications' && <NotificationsTab />}
        {activeTab === 'users' && isAdmin && <UsersTab />}
        {activeTab === 'data' && isAdmin && <DataTab />}
        {activeTab === 'geoip' && isAdmin && <GeoIPTab />}
        {activeTab === 'system' && isAdmin && <SystemTab />}
        {activeTab === 'ai' && isAdmin && <AiTab />}
      </div>
    </div>
  );
}
