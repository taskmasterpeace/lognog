import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface DrilldownOptions {
  field: string;
  value: string | number;
  originalQuery?: string;
  timeRange?: string;
}

export function useDrilldown() {
  const navigate = useNavigate();

  const drilldown = useCallback(
    (options: DrilldownOptions) => {
      const { field, value, timeRange } = options;

      // Build drilldown query
      let query: string;
      const escapedValue = String(value).includes(' ')
        ? `"${value}"`
        : String(value);

      // Create a simple search query filtering by the clicked value
      query = `search ${field}=${escapedValue} | table timestamp hostname app_name severity message`;

      // Build URL params
      const params = new URLSearchParams();
      params.set('query', query);
      if (timeRange) {
        params.set('time', timeRange);
      }

      navigate(`/search?${params.toString()}`);
    },
    [navigate]
  );

  const drilldownFromRow = useCallback(
    (row: Record<string, unknown>, keyFields?: string[], timeRange?: string) => {
      // Build filter conditions from all key-value pairs
      const conditions: string[] = [];
      const fields = keyFields || Object.keys(row);

      for (const field of fields) {
        const value = row[field];
        if (value !== null && value !== undefined && field !== 'count' && field !== 'sum' && field !== 'avg') {
          const escapedValue = String(value).includes(' ')
            ? `"${value}"`
            : String(value);
          conditions.push(`${field}=${escapedValue}`);
        }
      }

      if (conditions.length === 0) return;

      const query = `search ${conditions.join(' ')} | table timestamp hostname app_name severity message`;

      const params = new URLSearchParams();
      params.set('query', query);
      if (timeRange) {
        params.set('time', timeRange);
      }

      navigate(`/search?${params.toString()}`);
    },
    [navigate]
  );

  const drilldownTimeRange = useCallback(
    (start: Date, end: Date, originalQuery?: string) => {
      const startStr = start.toISOString();
      const endStr = end.toISOString();

      const query = originalQuery || 'search *';

      const params = new URLSearchParams();
      params.set('query', query);
      params.set('start', startStr);
      params.set('end', endStr);

      navigate(`/search?${params.toString()}`);
    },
    [navigate]
  );

  return {
    drilldown,
    drilldownFromRow,
    drilldownTimeRange,
  };
}

// Component wrapper for use in class components or non-hook contexts
interface DrilldownHandlerProps {
  children: (handlers: ReturnType<typeof useDrilldown>) => React.ReactNode;
}

export function DrilldownHandler({ children }: DrilldownHandlerProps) {
  const handlers = useDrilldown();
  return <>{children(handlers)}</>;
}

export default DrilldownHandler;
