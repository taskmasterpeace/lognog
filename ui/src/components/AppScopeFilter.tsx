import { useState, useEffect } from 'react';
import { getAppScopes } from '../api/client';

interface AppScopeFilterProps {
  value: string;
  onChange: (scope: string) => void;
  className?: string;
}

export function AppScopeFilter({ value, onChange, className = '' }: AppScopeFilterProps) {
  const [scopes, setScopes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadScopes();
  }, []);

  async function loadScopes() {
    try {
      const data = await getAppScopes();
      setScopes(data);
    } catch (error) {
      console.error('Failed to load app scopes:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <select disabled className={`bg-amber-50 dark:bg-nog-700 text-amber-700 dark:text-amber-200 rounded-lg px-3 py-1.5 text-sm ${className}`}>
        <option>Loading...</option>
      </select>
    );
  }

  // Add "All" and "default" options if not present
  const allScopes = ['all', ...scopes.filter(s => s !== 'all')];
  if (!allScopes.includes('default')) {
    allScopes.push('default');
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`bg-amber-50 dark:bg-nog-700 text-amber-800 dark:text-amber-200 rounded-lg px-3 py-1.5 text-sm
        border border-amber-200 dark:border-nog-600
        focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 focus:outline-none
        hover:border-amber-400 dark:hover:border-nog-500 transition-colors cursor-pointer ${className}`}
    >
      {allScopes.map((scope) => (
        <option key={scope} value={scope}>
          {scope === 'all' ? 'All Apps' : formatScopeName(scope)}
        </option>
      ))}
    </select>
  );
}

// Format scope name for display (e.g., "hey-youre-hired" -> "Hey Youre Hired")
function formatScopeName(scope: string): string {
  return scope
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default AppScopeFilter;
