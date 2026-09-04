import type { DashboardExport } from '../../api/client';

/**
 * Convert a Classic dashboard XML (SimpleXML) file into a LogNog DashboardExport,
 * so the existing import pipeline can create it. Best-effort: the panel queries
 * are carried across (the classic pipe syntax maps closely to the LogNog DSL for
 * common cases) and normalised to start with `search`; the user tweaks anything
 * tool-specific afterwards.
 */

// Classic charting.chart value → LogNog visualization.
const CHART_MAP: Record<string, string> = {
  line: 'linechart',
  area: 'line', // LogNog 'line' is the area chart
  column: 'bar',
  bar: 'bar',
  pie: 'pie',
  scatter: 'scatter',
  bubble: 'scatter',
  radialGauge: 'gauge',
  fillerGauge: 'gauge',
  markerGauge: 'gauge',
  sankey: 'sankey',
  radar: 'radar',
};

function vizFor(panel: Element): string {
  if (panel.querySelector('table')) return 'table';
  if (panel.querySelector('single')) return 'stat';
  if (panel.querySelector('event')) return 'table';
  const chart = panel.querySelector('chart');
  if (chart) {
    const opt = Array.from(chart.querySelectorAll('option')).find(
      (o) => o.getAttribute('name') === 'charting.chart',
    );
    const t = (opt?.textContent || '').trim();
    return CHART_MAP[t] || 'bar';
  }
  return 'table'; // map / html / unknown → table fallback
}

function normalizeQuery(spl: string | null | undefined): string {
  const q = (spl || '').trim();
  if (!q) return 'search *';
  if (q.startsWith('|') || /^search\b/i.test(q)) return q;
  return `search ${q}`;
}

function text(el: Element | null | undefined): string | undefined {
  const t = el?.textContent?.trim();
  return t || undefined;
}

export function parseClassicXml(xml: string): DashboardExport {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`Invalid XML: ${(parseError.textContent || '').replace(/\s+/g, ' ').slice(0, 140)}`);
  }
  const root = doc.querySelector('dashboard, form');
  if (!root) {
    throw new Error('Not a recognized dashboard: no <dashboard> or <form> root element.');
  }

  const name = text(root.querySelector('label')) || 'Imported dashboard';
  const description = text(root.querySelector('description'));

  const panels: DashboardExport['panels'] = [];
  const rows = Array.from(root.querySelectorAll(':scope > row'));
  let y = 0;
  for (const row of rows) {
    const rowPanels = Array.from(row.querySelectorAll(':scope > panel'));
    const width = Math.max(3, Math.floor(12 / Math.max(1, rowPanels.length)));
    rowPanels.forEach((panel, i) => {
      const viz = vizFor(panel);
      const query = normalizeQuery(panel.querySelector('query')?.textContent);
      const title =
        text(panel.querySelector(':scope > title')) ||
        text(panel.querySelector('chart > title, table > title, single > title')) ||
        'Panel';
      panels.push({
        title,
        query,
        visualization: viz,
        options: {},
        position_x: i * width,
        position_y: y,
        width,
        height: 4,
      });
    });
    y += 4;
  }

  if (panels.length === 0) {
    throw new Error('No panels found in the XML.');
  }

  // <input> tokens → LogNog dashboard variables (best-effort).
  const variables: NonNullable<DashboardExport['variables']> = [];
  for (const input of Array.from(root.querySelectorAll('fieldset input'))) {
    const token = input.getAttribute('token');
    if (!token) continue;
    const type = input.getAttribute('type') || 'text';
    const search = input.querySelector('search query')?.textContent;
    variables.push({
      name: token,
      label: text(input.querySelector('label')),
      type: search ? 'query' : type === 'dropdown' || type === 'radio' || type === 'multiselect' ? 'custom' : 'text',
      query: search ? normalizeQuery(search) : undefined,
      default_value: text(input.querySelector('default')),
      multi_select: type === 'multiselect',
      include_all: false,
    });
  }

  return {
    name,
    description,
    panels,
    variables: variables.length > 0 ? variables : undefined,
    exported_at: new Date().toISOString(),
    version: 'imported-from-xml',
  };
}

/** True when the pasted text looks like XML rather than LogNog JSON. */
export function looksLikeXml(text: string): boolean {
  return text.trim().startsWith('<');
}
