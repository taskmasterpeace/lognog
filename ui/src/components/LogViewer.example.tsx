import { useState } from 'react';
import LogViewer, { LogEntry } from './LogViewer';

// Sample log data for demonstration
const SAMPLE_LOGS: LogEntry[] = [
  {
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    hostname: 'web-server-01',
    app_name: 'nginx',
    severity: 6,
    message: 'GET /api/users 200 OK - 45ms',
    method: 'GET',
    path: '/api/users',
    status_code: 200,
    response_time_ms: 45,
    client_ip: '192.168.1.100',
  },
  {
    timestamp: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
    hostname: 'web-server-01',
    app_name: 'nginx',
    severity: 3,
    message: 'Connection refused to database server',
    error: 'ECONNREFUSED',
    target_host: 'db-primary.local',
    target_port: 5432,
  },
  {
    timestamp: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
    hostname: 'app-server-02',
    app_name: 'node',
    severity: 4,
    message: 'High memory usage detected: 85% of available RAM',
    memory_used_mb: 3400,
    memory_total_mb: 4096,
    memory_percent: 85,
  },
  {
    timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    hostname: 'firewall-01',
    app_name: 'iptables',
    severity: 4,
    message: 'Blocked connection attempt from suspicious IP',
    source_ip: '203.0.113.42',
    destination_port: 22,
    protocol: 'TCP',
    action: 'BLOCK',
  },
  {
    timestamp: new Date(Date.now() - 1000 * 60).toISOString(),
    hostname: 'web-server-02',
    app_name: 'apache',
    severity: 0,
    message: 'Critical: Disk space below 5% on /var partition',
    partition: '/var',
    disk_free_gb: 2.1,
    disk_total_gb: 50,
    disk_used_percent: 96,
  },
  {
    timestamp: new Date(Date.now() - 1000 * 30).toISOString(),
    hostname: 'db-primary',
    app_name: 'postgresql',
    severity: 6,
    message: 'Query executed successfully',
    query: 'SELECT * FROM users WHERE active = true',
    duration_ms: 12,
    rows_returned: 1523,
  },
  {
    timestamp: new Date(Date.now() - 1000 * 15).toISOString(),
    hostname: 'api-gateway',
    app_name: 'kong',
    severity: 4,
    message: 'Rate limit exceeded for client',
    client_id: 'app-mobile-v2',
    rate_limit: 1000,
    current_count: 1247,
    window: '1m',
  },
  {
    timestamp: new Date().toISOString(),
    hostname: 'monitoring-01',
    app_name: 'prometheus',
    severity: 7,
    message: 'Scrape completed for target web-server-01',
    target: 'web-server-01:9090',
    scrape_duration_ms: 234,
    metrics_collected: 567,
  },
];

/**
 * Example component showing LogViewer usage
 */
export default function LogViewerExample() {
  const [filters, setFilters] = useState<string[]>([]);

  const handleAddFilter = (field: string, value: string, exclude = false) => {
    const operator = exclude ? '!=' : '=';
    const filterStr = `${field}${operator}"${value}"`;
    setFilters((prev) => [...prev, filterStr]);
    console.log('Filter added:', filterStr);
  };

  const clearFilters = () => {
    setFilters([]);
  };

  return (
    <div className="h-screen flex flex-col bg-nog-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm p-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          LogViewer Component Demo
        </h1>
        <p className="text-slate-500 text-sm">
          Click rows to expand, hover over values for quick actions
        </p>

        {/* Active Filters */}
        {filters.length > 0 && (
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 uppercase">
              Active Filters:
            </span>
            {filters.map((filter, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-mono"
              >
                {filter}
              </span>
            ))}
            <button
              onClick={clearFilters}
              className="text-xs text-red-600 hover:text-red-700 font-medium"
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      {/* LogViewer */}
      <div className="flex-1 p-6">
        <div className="card overflow-hidden h-full">
          <LogViewer
            logs={SAMPLE_LOGS}
            onAddFilter={handleAddFilter}
            searchTerms={['error', 'critical', 'high']}
            isLoading={false}
          />
        </div>
      </div>

      {/* Features Legend */}
      <div className="bg-white border-t border-slate-200 p-4">
        <div className="max-w-6xl mx-auto">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Features:</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-slate-600">
            <div>
              <span className="font-semibold">Expandable Rows:</span> Click chevron to expand
            </div>
            <div>
              <span className="font-semibold">Severity Colors:</span> Color-coded by log level
            </div>
            <div>
              <span className="font-semibold">Quick Actions:</span> Hover over values
            </div>
            <div>
              <span className="font-semibold">Highlighting:</span> Search terms highlighted in yellow
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
