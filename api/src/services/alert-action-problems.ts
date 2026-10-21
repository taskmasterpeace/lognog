/**
 * Spot alert actions that can't deliver, so the Alerts page can say so
 * before the alert fires instead of failing quietly at run time.
 *
 * Resolution mirrors the sender (resolveNotificationChannel): a channel
 * reference matches a channel id first, then an exact channel name.
 * Takes the channel list as an argument so a route reads it once per
 * request, not once per rule.
 */

import type { AlertAction, NotificationChannel } from '../db/sqlite.js';
import { isRelayConfigured } from './relay.js';

export interface ActionProblem {
  index: number;
  type: AlertAction['type'];
  problem: string;
}

type ChannelLike = Pick<NotificationChannel, 'id' | 'name' | 'enabled'>;

export function findChannelInList<T extends ChannelLike>(channels: T[], idOrName: string): T | undefined {
  return channels.find(c => c.id === idOrName) ?? channels.find(c => c.name === idOrName);
}

export const RELAY_NOT_SET_UP_PROBLEM =
  "The studio relay isn't set up on this server (RELAY_URL and RELAY_BUS_KEY), so this alert can't be delivered.";

/**
 * `channels` null means the channel list couldn't be read: apprise actions
 * are then not judged (never a false alarm). Relay actions are judged
 * against the server's RELAY_URL/RELAY_BUS_KEY, the same test the sender uses.
 */
export function findActionProblems(
  actions: unknown,
  channels: ChannelLike[] | null,
  opts: { relayConfigured?: boolean } = {},
): ActionProblem[] {
  if (!Array.isArray(actions)) return [];
  const relayConfigured = opts.relayConfigured ?? isRelayConfigured();
  const problems: ActionProblem[] = [];
  actions.forEach((action, index) => {
    if (!action || typeof action !== 'object') return;
    const a = action as AlertAction;
    if (a.type === 'relay') {
      if (!relayConfigured) problems.push({ index, type: a.type, problem: RELAY_NOT_SET_UP_PROBLEM });
      return;
    }
    if (a.type !== 'apprise' || !channels) return;
    // Same test as the sender: no channel means it uses apprise_urls instead.
    const ref = typeof a.config?.channel === 'string' ? a.config.channel : '';
    if (!ref) return;
    const channel = findChannelInList(channels, ref);
    if (!channel) {
      problems.push({ index, type: a.type, problem: `Channel "${ref}" doesn't exist, so this alert can't be delivered.` });
    } else if (!channel.enabled) {
      problems.push({ index, type: a.type, problem: `Channel "${channel.name}" is turned off, so this alert can't be delivered.` });
    }
  });
  return problems;
}
