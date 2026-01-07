import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { DateFormat, formatTimestamp, formatDateOnly, formatTimeOnly } from '../utils/formatDate';

interface DateFormatContextType {
  dateFormat: DateFormat;
  setDateFormat: (format: DateFormat) => void;
  timezone: string; // 'browser' or IANA timezone name
  setTimezone: (tz: string) => void;
  resolvedTimezone: string; // Actual IANA timezone name (resolved from 'browser')
  formatDate: (date: Date | string | number | null | undefined) => string;
  formatDatePart: (date: Date | string | number | null | undefined) => string;
  formatTimePart: (date: Date | string | number | null | undefined) => string;
}

const DateFormatContext = createContext<DateFormatContextType | null>(null);

// Get browser's default timezone
function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

export function DateFormatProvider({ children }: { children: ReactNode }) {
  const [dateFormat, setDateFormat] = useState<DateFormat>('12-hour');
  const [timezone, setTimezone] = useState<string>('browser');

  // Resolve 'browser' to actual IANA timezone
  const resolvedTimezone = useMemo(() => {
    return timezone === 'browser' ? getBrowserTimezone() : timezone;
  }, [timezone]);

  // Load format and timezone from localStorage on mount
  useEffect(() => {
    const storedFormat = localStorage.getItem('lognog_date_format');
    if (storedFormat && ['12-hour', '24-hour', 'day-of-week', 'iso', 'short'].includes(storedFormat)) {
      setDateFormat(storedFormat as DateFormat);
    }

    const storedTimezone = localStorage.getItem('lognog_timezone');
    if (storedTimezone) {
      setTimezone(storedTimezone);
    }
  }, []);

  // Save format to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('lognog_date_format', dateFormat);
  }, [dateFormat]);

  // Save timezone to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('lognog_timezone', timezone);
  }, [timezone]);

  const value: DateFormatContextType = {
    dateFormat,
    setDateFormat,
    timezone,
    setTimezone,
    resolvedTimezone,
    formatDate: (date) => formatTimestamp(date, dateFormat, resolvedTimezone),
    formatDatePart: (date) => formatDateOnly(date, dateFormat, resolvedTimezone),
    formatTimePart: (date) => formatTimeOnly(date, dateFormat, resolvedTimezone),
  };

  return (
    <DateFormatContext.Provider value={value}>
      {children}
    </DateFormatContext.Provider>
  );
}

export function useDateFormat() {
  const context = useContext(DateFormatContext);
  if (!context) {
    throw new Error('useDateFormat must be used within a DateFormatProvider');
  }
  return context;
}

// Convenience hook that returns just the format function
export function useFormatDate() {
  const { formatDate } = useDateFormat();
  return formatDate;
}
