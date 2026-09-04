import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { type DrilldownConfig, type DrilldownContext, substituteTokens } from './panelDrilldown';

/**
 * Dashboard → Search drilldown.
 *
 * SearchPage reads `q`, `earliest` and `latest` from the URL (see
 * SearchPage.tsx). Emitting anything else silently drops the filter and the
 * user lands on their last search instead of the clicked slice.
 */

interface DrilldownOptions {
  field: string;
  value: string | number;
  originalQuery?: string;
  timeRange?: string;
  timeRangeLatest?: string;
}

const DRILLDOWN_TABLE = '| table timestamp hostname app_name severity message';
const AGGREGATE_FIELDS = new Set(['count', 'sum', 'avg', 'min', 'max', 'dc', 'p50', 'p95', 'p99']);

function quoteValue(value: unknown): string {
  const str = String(value);
  // Quote anything that would break the DSL tokenizer (spaces, operators).
  return /[\s"=<>|]/.test(str) ? `"${str.replace(/"/g, '\\"')}"` : str;
}

function searchUrl(query: string, earliest?: string, latest?: string): string {
  const params = new URLSearchParams();
  params.set('q', query);
  if (earliest) params.set('earliest', earliest);
  if (latest) params.set('latest', latest);
  return `/search?${params.toString()}`;
}

export function useDrilldown() {
  const navigate = useNavigate();

  const drilldown = useCallback(
    (options: DrilldownOptions) => {
      const { field, value, timeRange, timeRangeLatest } = options;
      const query = `search ${field}=${quoteValue(value)} ${DRILLDOWN_TABLE}`;
      navigate(searchUrl(query, timeRange, timeRangeLatest));
    },
    [navigate]
  );

  const drilldownFromRow = useCallback(
    (row: Record<string, unknown>, keyFields?: string[], timeRange?: string, timeRangeLatest?: string) => {
      // Build filter conditions from all key-value pairs
      const conditions: string[] = [];
      const fields = keyFields || Object.keys(row);

      for (const field of fields) {
        const value = row[field];
        if (value !== null && value !== undefined && !AGGREGATE_FIELDS.has(field)) {
          conditions.push(`${field}=${quoteValue(value)}`);
        }
      }

      if (conditions.length === 0) return;

      const query = `search ${conditions.join(' ')} ${DRILLDOWN_TABLE}`;
      navigate(searchUrl(query, timeRange, timeRangeLatest));
    },
    [navigate]
  );

  const drilldownTimeRange = useCallback(
    (start: Date, end: Date, originalQuery?: string) => {
      const query = originalQuery || 'search *';
      navigate(searchUrl(query, start.toISOString(), end.toISOString()));
    },
    [navigate]
  );

  // Configured (per-panel) drilldown: navigate to a custom search, another
  // dashboard, or a URL, with click tokens substituted into the target.
  const drilldownConfigured = useCallback(
    (config: DrilldownConfig, ctx: DrilldownContext) => {
      const resolved = substituteTokens(config.target, ctx).trim();
      if (!resolved) return;

      if (config.type === 'url') {
        window.open(resolved, config.newTab ? '_blank' : '_self', 'noopener,noreferrer');
        return;
      }
      if (config.type === 'dashboard') {
        const path = resolved.startsWith('/') ? resolved : `/dashboards/${resolved}`;
        if (config.newTab) window.open(path, '_blank', 'noopener,noreferrer');
        else navigate(path);
        return;
      }
      // search: the target is a DSL query template.
      navigate(searchUrl(resolved, ctx.earliest, ctx.latest));
    },
    [navigate]
  );

  return {
    drilldown,
    drilldownFromRow,
    drilldownTimeRange,
    drilldownConfigured,
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
