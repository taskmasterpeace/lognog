import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { DateFormat, formatTimestamp, formatDateOnly, formatTimeOnly } from '../utils/formatDate';

interface DateFormatContextType {
  dateFormat: DateFormat;
  setDateFormat: (format: DateFormat) => void;
  formatDate: (date: Date | string | number | null | undefined) => string;
  formatDatePart: (date: Date | string | number | null | undefined) => string;
  formatTimePart: (date: Date | string | number | null | undefined) => string;
}

const DateFormatContext = createContext<DateFormatContextType | null>(null);

export function DateFormatProvider({ children }: { children: ReactNode }) {
  const [dateFormat, setDateFormat] = useState<DateFormat>('12-hour');

  // Load format from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('lognog_date_format');
    if (stored && ['12-hour', '24-hour', 'day-of-week', 'iso', 'short'].includes(stored)) {
      setDateFormat(stored as DateFormat);
    }
  }, []);

  // Save format to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('lognog_date_format', dateFormat);
  }, [dateFormat]);

  const value: DateFormatContextType = {
    dateFormat,
    setDateFormat,
    formatDate: (date) => formatTimestamp(date, dateFormat),
    formatDatePart: (date) => formatDateOnly(date, dateFormat),
    formatTimePart: (date) => formatTimeOnly(date, dateFormat),
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
