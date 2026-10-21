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

export interface ActionProblem {
  index: number;
  type: AlertAction['type'];
  problem: string;
}

type ChannelLike = Pick<NotificationChannel, 'id' | 'name' | 'enabled'>;

export function findChannelInList<T extends ChannelLike>(channels: T[], idOrName: string): T | undefined {
  return channels.find(c => c.id === idOrName) ?? channels.find(c => c.name === idOrName);
}

export function findActionProblems(actions: unknown, channels: ChannelLike[]): ActionProblem[] {
  if (!Array.isArray(actions)) return [];
  const problems: ActionProblem[] = [];
  actions.forEach((action, index) => {
    if (!action || typeof action !== 'object') return;
    const a = action as AlertAction;
    if (a.type !== 'apprise') return;
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
