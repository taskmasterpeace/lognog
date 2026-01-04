/**
 * Dashboard Generator Service
 * Generates DSL queries and panel configurations based on field + visualization type
 */

export interface PanelConfig {
  title: string;
  query: string;
  vizType: string;
  description?: string;
  position: { x: number; y: number; w: number; h: number };
}

export interface GeneratePanelOptions {
  field: string;
  vizType: string;
  index: string;
  position?: { x: number; y: number; w: number; h: number };
}

/**
 * Generate a DSL query for a given field and visualization type
 */
export function generateQuery(field: string, vizType: string, index: string): string {
  const baseSearch = `search index=${index}`;

  switch (field) {
    case 'timestamp':
      // Time series - always use timechart
      return `${baseSearch} | timechart span=1h count`;

    case 'severity':
      switch (vizType) {
        case 'pie':
          return `${baseSearch} | stats count by severity | sort desc`;
        case 'heatmap':
          return `${baseSearch} | timechart span=1h count by severity`;
        case 'bar':
          return `${baseSearch} | stats count by severity | sort severity`;
        default:
          return `${baseSearch} | stats count by severity`;
      }

    case 'hostname':
      switch (vizType) {
        case 'bar':
          return `${baseSearch} | top 10 hostname`;
        case 'pie':
          return `${baseSearch} | stats count by hostname | sort desc | head 10`;
        case 'table':
          return `${baseSearch} | stats count, latest(timestamp) as last_seen by hostname | sort desc`;
        default:
          return `${baseSearch} | top 10 hostname`;
      }

    case 'app_name':
      switch (vizType) {
        case 'bar':
          return `${baseSearch} | top 10 app_name`;
        case 'pie':
          return `${baseSearch} | stats count by app_name | sort desc | head 10`;
        case 'table':
          return `${baseSearch} | stats count, latest(timestamp) as last_seen by app_name | sort desc`;
        default:
          return `${baseSearch} | top 10 app_name`;
      }

    case 'source_ip':
      switch (vizType) {
        case 'table':
          return `${baseSearch} | stats count by source_ip | sort desc | head 20`;
        case 'bar':
          return `${baseSearch} | top 10 source_ip`;
        default:
          return `${baseSearch} | stats count by source_ip | sort desc | head 20`;
      }

    case 'facility':
      switch (vizType) {
        case 'pie':
          return `${baseSearch} | stats count by facility | sort desc`;
        case 'bar':
          return `${baseSearch} | stats count by facility | sort facility`;
        default:
          return `${baseSearch} | stats count by facility`;
      }

    case 'message':
      // Recent logs table
      return `${baseSearch} | table timestamp, hostname, app_name, severity, message | head 50`;

    default:
      // Generic field handling
      if (field.startsWith('structured.')) {
        const structField = field.replace('structured.', '');
        switch (vizType) {
          case 'bar':
            return `${baseSearch} | top 10 ${structField}`;
          case 'table':
            return `${baseSearch} | stats count by ${structField} | sort desc | head 20`;
          default:
            return `${baseSearch} | stats count by ${structField}`;
        }
      }
      return `${baseSearch} | stats count by ${field} | sort desc | head 10`;
  }
}

/**
 * Generate a panel title based on field and visualization type
 */
export function generatePanelTitle(field: string, vizType: string): string {
  const fieldLabels: Record<string, string> = {
    timestamp: 'Logs Over Time',
    severity: 'Severity',
    hostname: 'Hosts',
    app_name: 'Applications',
    source_ip: 'Source IPs',
    facility: 'Facilities',
    message: 'Recent Logs',
  };

  const vizLabels: Record<string, string> = {
    line: 'Timeline',
    bar: 'Top',
    pie: 'Distribution',
    table: 'Table',
    heatmap: 'Heatmap',
    single: 'Count',
  };

  const fieldLabel = fieldLabels[field] || field.replace('structured.', '').replace(/_/g, ' ');
  const vizLabel = vizLabels[vizType] || vizType;

  // Special cases
  if (field === 'timestamp') {
    return 'Logs Over Time';
  }
  if (field === 'message') {
    return 'Recent Logs';
  }
  if (vizType === 'pie') {
    return `${fieldLabel} Distribution`;
  }
  if (vizType === 'bar') {
    return `Top ${fieldLabel}`;
  }
  if (vizType === 'heatmap') {
    return `${fieldLabel} Heatmap`;
  }

  return `${vizLabel} - ${fieldLabel}`;
}

/**
 * Calculate grid position for a panel based on index
 */
export function calculatePosition(
  index: number,
  totalPanels: number
): { x: number; y: number; w: number; h: number } {
  // Grid is 12 columns wide
  // First panel (usually time series) is full width
  // Others are 6 columns (half width) or 4 columns (third width)

  if (index === 0) {
    // First panel - full width time series
    return { x: 0, y: 0, w: 12, h: 3 };
  }

  // Remaining panels in 2-column layout
  const row = Math.floor((index - 1) / 2) + 1;
  const col = (index - 1) % 2;

  return {
    x: col * 6,
    y: row * 3,
    w: 6,
    h: 3,
  };
}

/**
 * Generate a complete panel configuration
 */
export function generatePanel(options: GeneratePanelOptions): PanelConfig {
  const { field, vizType, index, position } = options;

  return {
    title: generatePanelTitle(field, vizType),
    query: generateQuery(field, vizType, index),
    vizType,
    position: position || { x: 0, y: 0, w: 6, h: 3 },
  };
}

/**
 * Generate a default dashboard configuration based on available fields
 */
export function generateDefaultDashboard(
  indexName: string,
  fields: Array<{ name: string; recommended_viz: string[] }>
): PanelConfig[] {
  const panels: PanelConfig[] = [];

  // Always start with time series
  panels.push({
    title: 'Logs Over Time',
    query: `search index=${indexName} | timechart span=1h count`,
    vizType: 'line',
    position: calculatePosition(0, 7),
  });

  // Add severity pie chart if severity field exists
  const severityField = fields.find(f => f.name === 'severity');
  if (severityField) {
    panels.push(generatePanel({
      field: 'severity',
      vizType: 'pie',
      index: indexName,
      position: calculatePosition(panels.length, 7),
    }));
  }

  // Add top hosts if hostname field exists
  const hostnameField = fields.find(f => f.name === 'hostname');
  if (hostnameField) {
    panels.push(generatePanel({
      field: 'hostname',
      vizType: 'bar',
      index: indexName,
      position: calculatePosition(panels.length, 7),
    }));
  }

  // Add top apps if app_name field exists
  const appField = fields.find(f => f.name === 'app_name');
  if (appField) {
    panels.push(generatePanel({
      field: 'app_name',
      vizType: 'bar',
      index: indexName,
      position: calculatePosition(panels.length, 7),
    }));
  }

  // Add severity heatmap
  if (severityField) {
    panels.push(generatePanel({
      field: 'severity',
      vizType: 'heatmap',
      index: indexName,
      position: calculatePosition(panels.length, 7),
    }));
  }

  // Add recent logs table
  panels.push({
    title: 'Recent Logs',
    query: `search index=${indexName} | table timestamp, hostname, app_name, severity, message | head 50`,
    vizType: 'table',
    position: calculatePosition(panels.length, 7),
  });

  return panels;
}

/**
 * Get recommended visualizations for a field type
 */
export function getFieldVisualizationOptions(fieldName: string, fieldType: string): string[] {
  // Special field handling
  switch (fieldName) {
    case 'timestamp':
      return ['line'];
    case 'severity':
      return ['pie', 'heatmap', 'bar'];
    case 'hostname':
    case 'app_name':
      return ['bar', 'pie', 'table'];
    case 'source_ip':
      return ['table', 'bar'];
    case 'facility':
      return ['pie', 'bar'];
    case 'message':
      return ['table'];
  }

  // Type-based fallback
  switch (fieldType) {
    case 'number':
      return ['bar', 'line', 'single'];
    case 'timestamp':
      return ['line'];
    default:
      return ['bar', 'pie', 'table'];
  }
}
