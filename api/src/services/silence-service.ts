/**
 * Silence Service - Manage alert silencing
 *
 * Provides 3-level silencing:
 * - Global: Silence all alerts
 * - Host: Silence alerts for a specific hostname
 * - Alert: Silence a specific alert
 */

import {
  AlertSilence,
  SilenceLevel,
  getAlertSilences,
  getActiveSilences,
  getAlertSilence,
  createAlertSilence,
  deleteAlertSilence,
  deleteExpiredSilences,
  isAlertSilenced,
  getAlert,
} from '../db/sqlite.js';

// Parse duration string like "1h", "4h", "24h", "1w" to ISO timestamp
function parseDuration(duration: string): string | undefined {
  if (duration === 'indefinite') {
    return undefined; // null end time = indefinite
  }

  const match = duration.match(/^(\d+)(h|d|w)$/);
  if (!match) return undefined;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  let milliseconds: number;
  switch (unit) {
    case 'h':
      milliseconds = value * 60 * 60 * 1000;
      break;
    case 'd':
      milliseconds = value * 24 * 60 * 60 * 1000;
      break;
    case 'w':
      milliseconds = value * 7 * 24 * 60 * 60 * 1000;
      break;
    default:
      return undefined;
  }

  return new Date(Date.now() + milliseconds).toISOString();
}

// Create a silence
export interface CreateSilenceOptions {
  level: SilenceLevel;
  target_id?: string;
  duration: string; // "1h", "4h", "24h", "1w", "indefinite"
  reason?: string;
  created_by?: string;
}

export function createSilence(options: CreateSilenceOptions): {
  success: boolean;
  silence?: AlertSilence;
  error?: string;
} {
  try {
    // Validate level-specific requirements
    if (options.level === 'host' && !options.target_id) {
      return { success: false, error: 'Host silences require a target_id (hostname)' };
    }

    if (options.level === 'alert' && !options.target_id) {
      return { success: false, error: 'Alert silences require a target_id (alert ID)' };
    }

    // Validate alert exists if alert-level silence
    if (options.level === 'alert' && options.target_id) {
      const alert = getAlert(options.target_id);
      if (!alert) {
        return { success: false, error: `Alert not found: ${options.target_id}` };
      }
    }

    // Calculate end time from duration
    const ends_at = parseDuration(options.duration);

    const silence = createAlertSilence(options.level, {
      target_id: options.target_id,
      reason: options.reason,
      created_by: options.created_by,
      ends_at,
    });

    return { success: true, silence };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// List all silences
export function listSilences(activeOnly: boolean = false): AlertSilence[] {
  if (activeOnly) {
    return getActiveSilences();
  }
  return getAlertSilences();
}

// Get a single silence
export function getSilence(id: string): AlertSilence | undefined {
  return getAlertSilence(id);
}

// Delete/remove a silence
export function removeSilence(id: string): { success: boolean; error?: string } {
  try {
    const deleted = deleteAlertSilence(id);
    if (!deleted) {
      return { success: false, error: 'Silence not found' };
    }
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// Check if alert should be silenced
export function checkSilenced(
  alertId: string,
  hostname?: string
): { silenced: boolean; silence?: AlertSilence } {
  const silenced = isAlertSilenced(alertId, hostname);

  if (!silenced) {
    return { silenced: false };
  }

  // Find which silence is active
  const activeSilences = getActiveSilences();

  // Priority: alert-specific > host-specific > global
  const silence =
    activeSilences.find(s => s.level === 'alert' && s.target_id === alertId) ||
    activeSilences.find(s => s.level === 'host' && s.target_id === hostname) ||
    activeSilences.find(s => s.level === 'global');

  return { silenced: true, silence };
}

// Clean up expired silences
export function cleanupExpiredSilences(): number {
  return deleteExpiredSilences();
}
