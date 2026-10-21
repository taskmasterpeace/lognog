/**
 * Quiet mode: what the sidebar shows.
 *
 * The main group is the handful of pages used every day. Everything else sits
 * in "More" (collapsed by default, remembers open/closed per browser). Nothing
 * is removed: every page keeps its route and its link in More.
 *
 * To add a page: put it in MAIN_NAV only if it is used daily; otherwise add it
 * to the right MORE_NAV section.
 */
import type { ElementType } from 'react';
import {
  Home,
  Search,
  LayoutDashboard,
  Activity,
  Database,
  FileText,
  FileBarChart,
  BookOpen,
  Settings,
  Bell,
  Radar,
  Server,
  Users,
  Layers,
  Bot,
  Sparkles,
  Bookmark,
  BarChart3,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: ElementType;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/** The main group, top to bottom. */
export const MAIN_NAV: NavItem[] = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/dashboards', label: 'Dashboards', icon: LayoutDashboard },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/data-sources', label: 'Data Sources', icon: Database },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
  { to: '/settings', label: 'Settings', icon: Settings },
];

/** Everything else, tucked behind "More". */
export const MORE_NAV: NavSection[] = [
  {
    title: 'Watch',
    items: [
      { to: '/anomaly', label: 'Anomaly Detection', icon: Radar },
      { to: '/synthetic', label: 'Synthetic', icon: Activity },
    ],
  },
  {
    title: 'Look deeper',
    items: [
      { to: '/saved-searches', label: 'Saved Searches', icon: Bookmark },
      { to: '/stats', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    title: 'Set up',
    items: [
      { to: '/cim', label: 'Data Models', icon: Layers },
      { to: '/knowledge', label: 'Knowledge', icon: BookOpen },
      { to: '/assets', label: 'Assets', icon: Server },
      { to: '/identities', label: 'Identities', icon: Users },
    ],
  },
  {
    title: 'Help & AI',
    items: [
      { to: '/agent', label: 'AI Agent', icon: Bot },
      { to: '/onboarding', label: 'AI Onboarding', icon: Sparkles },
      { to: '/guide', label: 'User Guide', icon: BookOpen },
      { to: '/docs', label: 'Documentation', icon: FileText },
    ],
  },
];

export const MORE_ITEMS: NavItem[] = MORE_NAV.flatMap((s) => s.items);

/** localStorage key for the More group's open/closed state. */
export const MORE_STORAGE_KEY = 'nav-group-more';

/** Is this nav item the page we're on (exact path or a sub-page of it)? */
export function isNavActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(to + '/');
}

/**
 * localStorage that never throws (private windows, blocked site data and
 * some embedded previews throw on access). Falls back to the default.
 */
export function readStoredBool(key: string, fallback: boolean): boolean {
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : v === 'true';
  } catch {
    return fallback;
  }
}

export function writeStoredBool(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    /* storage blocked: the group still opens and closes, it just won't be remembered */
  }
}
