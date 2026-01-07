/**
 * Date formatting utility for LogNog
 * Formats timestamps according to user preferences
 */

export type DateFormat = '12-hour' | '24-hour' | 'day-of-week' | 'iso' | 'short';

export const DATE_FORMAT_OPTIONS = [
  { value: '12-hour', label: '12-hour', example: 'Dec 28, 2025 2:30 PM' },
  { value: '24-hour', label: '24-hour', example: 'Dec 28, 2025 14:30' },
  { value: 'day-of-week', label: 'With day', example: 'Sat, Dec 28, 2025 2:30 PM' },
  { value: 'iso', label: 'ISO', example: '2025-12-28 14:30:00' },
  { value: 'short', label: 'Short', example: '12/28/25 2:30 PM' },
] as const;

/**
 * Format a timestamp according to the specified format
 * @param date - Date object, ISO string, or timestamp number
 * @param format - The date format preference
 * @param timezone - Optional IANA timezone (e.g., 'America/New_York')
 * @returns Formatted date string
 */
export function formatTimestamp(
  date: Date | string | number | null | undefined,
  format: DateFormat = '12-hour',
  timezone?: string
): string {
  if (date == null) return '-';

  const d = typeof date === 'string' || typeof date === 'number'
    ? new Date(date)
    : date;

  if (isNaN(d.getTime())) return '-';

  const tzOption = timezone ? { timeZone: timezone } : {};

  switch (format) {
    case '12-hour':
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        ...tzOption,
      });

    case '24-hour':
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        ...tzOption,
      });

    case 'day-of-week':
      return d.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        ...tzOption,
      });

    case 'iso':
      // For ISO format with timezone, we need to format manually
      if (timezone) {
        return d.toLocaleString('en-CA', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          ...tzOption,
        }).replace(',', '');
      }
      return d.toISOString().replace('T', ' ').slice(0, 19);

    case 'short':
      return d.toLocaleString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        ...tzOption,
      });

    default:
      return d.toLocaleString('en-US', tzOption);
  }
}

/**
 * Format just the date portion (no time)
 * @param timezone - Optional IANA timezone (e.g., 'America/New_York')
 */
export function formatDateOnly(
  date: Date | string | number | null | undefined,
  format: DateFormat = '12-hour',
  timezone?: string
): string {
  if (date == null) return '-';

  const d = typeof date === 'string' || typeof date === 'number'
    ? new Date(date)
    : date;

  if (isNaN(d.getTime())) return '-';

  const tzOption = timezone ? { timeZone: timezone } : {};

  switch (format) {
    case 'iso':
      if (timezone) {
        return d.toLocaleString('en-CA', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          ...tzOption,
        });
      }
      return d.toISOString().slice(0, 10);

    case 'short':
      return d.toLocaleString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: '2-digit',
        ...tzOption,
      });

    case 'day-of-week':
      return d.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        ...tzOption,
      });

    default:
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        ...tzOption,
      });
  }
}

/**
 * Format just the time portion (no date)
 * @param timezone - Optional IANA timezone (e.g., 'America/New_York')
 */
export function formatTimeOnly(
  date: Date | string | number | null | undefined,
  format: DateFormat = '12-hour',
  timezone?: string
): string {
  if (date == null) return '-';

  const d = typeof date === 'string' || typeof date === 'number'
    ? new Date(date)
    : date;

  if (isNaN(d.getTime())) return '-';

  const tzOption = timezone ? { timeZone: timezone } : {};

  switch (format) {
    case '24-hour':
    case 'iso':
      return d.toLocaleString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        ...tzOption,
      });

    default:
      return d.toLocaleString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        ...tzOption,
      });
  }
}
