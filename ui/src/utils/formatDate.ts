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

// "2026-10-07 04:00:01" (SQLite datetime('now'), alert history) and
// "2026-10-07 03:47:12.235" (ClickHouse log rows) carry no zone but are UTC.
// new Date() would read them as local time and show 4:00 AM for a run that
// happened at midnight Eastern, so a zone-less date-time is read as UTC here.
const ZONELESS_DATE_TIME = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/;

/** Parse a server timestamp; zone-less date-times are UTC. */
export function toDate(date: Date | string | number): Date {
  if (typeof date === 'string') {
    const m = ZONELESS_DATE_TIME.exec(date.trim());
    return new Date(m ? `${m[1]}T${m[2]}Z` : date);
  }
  return typeof date === 'number' ? new Date(date) : date;
}

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

  const d = toDate(date);

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

  const d = toDate(date);

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

  const d = toDate(date);

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
