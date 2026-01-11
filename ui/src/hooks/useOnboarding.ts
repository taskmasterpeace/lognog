import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../contexts/AuthContext';

const DONT_SHOW_WIZARD_KEY = 'lognog_wizard_dont_show';

export interface OnboardingStatus {
  completed: boolean;
  completed_at: string | null;
}

export interface UseOnboardingReturn {
  status: 'loading' | 'show' | 'complete';
  isLoading: boolean;
  showWizard: boolean;
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
}

export function useOnboarding(): UseOnboardingReturn {
  const [status, setStatus] = useState<'loading' | 'show' | 'complete'>('loading');
  const [isLoading, setIsLoading] = useState(true);

  // Fetch onboarding status on mount
  useEffect(() => {
    const fetchStatus = async () => {
      // Check localStorage first - if user chose "Don't show again", respect that
      const dontShow = localStorage.getItem(DONT_SHOW_WIZARD_KEY);
      if (dontShow === 'true') {
        setStatus('complete');
        setIsLoading(false);
        return;
      }

      try {
        const response = await authFetch('/onboarding/status');
        if (response.ok) {
          const data: OnboardingStatus = await response.json();
          setStatus(data.completed ? 'complete' : 'show');
        } else {
          // If error, assume complete to not block user
          console.error('Failed to fetch onboarding status');
          setStatus('complete');
        }
      } catch (error) {
        console.error('Error fetching onboarding status:', error);
        setStatus('complete');
      } finally {
        setIsLoading(false);
      }
    };

    fetchStatus();
  }, []);

  const completeOnboarding = useCallback(async () => {
    try {
      // Set localStorage as backup to ensure wizard doesn't show again
      localStorage.setItem(DONT_SHOW_WIZARD_KEY, 'true');

      const response = await authFetch('/onboarding/complete', {
        method: 'POST',
      });
      if (response.ok) {
        setStatus('complete');
      }
    } catch (error) {
      console.error('Error completing onboarding:', error);
      // Even if API fails, mark as complete locally
      setStatus('complete');
    }
  }, []);

  const resetOnboarding = useCallback(async () => {
    try {
      const response = await authFetch('/onboarding/reset', {
        method: 'POST',
      });
      if (response.ok) {
        setStatus('show');
      }
    } catch (error) {
      console.error('Error resetting onboarding:', error);
    }
  }, []);

  return {
    status,
    isLoading,
    showWizard: status === 'show',
    completeOnboarding,
    resetOnboarding,
  };
}

// API functions for use in wizard components
export async function getAlertTemplates() {
  const response = await authFetch('/alerts/templates');
  if (!response.ok) throw new Error('Failed to get alert templates');
  return response.json();
}

export async function createAlertFromTemplate(templateId: string) {
  const response = await authFetch(`/alerts/from-template/${templateId}`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error('Failed to create alert from template');
  return response.json();
}

export async function generateDemoData(count: number = 500) {
  const response = await authFetch('/demo/generate', {
    method: 'POST',
    body: JSON.stringify({
      count,
      types: ['syslog', 'nginx', 'auth', 'app', 'firewall', 'database'],
      timeRange: '-1h',
    }),
  });
  if (!response.ok) throw new Error('Failed to generate demo data');
  return response.json();
}

export async function getDashboardTemplates() {
  const response = await authFetch('/dashboards/templates');
  if (!response.ok) throw new Error('Failed to get dashboard templates');
  return response.json();
}

export async function createDashboardFromTemplate(templateName: string) {
  const response = await authFetch('/dashboards/from-template', {
    method: 'POST',
    body: JSON.stringify({ templateName }),
  });
  if (!response.ok) throw new Error('Failed to create dashboard from template');
  return response.json();
}
