/**
 * Lookup Tables Service
 *
 * Provides in-memory lookup tables for enriching log data.
 * Supports multiple table types with examples:
 *
 * - geoip: IP address to geographic information
 * - http_status: HTTP status code to name/category
 * - severity: Syslog severity code to name/description
 * - countries: Country code to country name
 * - ports: Port numbers to service names
 */

export interface LookupTable {
  name: string;
  description: string;
  keyField: string;
  data: Map<string, Record<string, unknown>>;
  fields: string[];
}

// In-memory storage for lookup tables
const lookupTables: Map<string, LookupTable> = new Map();

/**
 * Initialize default lookup tables
 */
function initializeTables(): void {
  // HTTP Status Codes
  const httpStatus = new Map<string, Record<string, unknown>>();
  httpStatus.set('200', { status_name: 'OK', status_category: 'Success', is_error: false });
  httpStatus.set('201', { status_name: 'Created', status_category: 'Success', is_error: false });
  httpStatus.set('204', { status_name: 'No Content', status_category: 'Success', is_error: false });
  httpStatus.set('301', { status_name: 'Moved Permanently', status_category: 'Redirect', is_error: false });
  httpStatus.set('302', { status_name: 'Found', status_category: 'Redirect', is_error: false });
  httpStatus.set('304', { status_name: 'Not Modified', status_category: 'Redirect', is_error: false });
  httpStatus.set('400', { status_name: 'Bad Request', status_category: 'Client Error', is_error: true });
  httpStatus.set('401', { status_name: 'Unauthorized', status_category: 'Client Error', is_error: true });
  httpStatus.set('403', { status_name: 'Forbidden', status_category: 'Client Error', is_error: true });
  httpStatus.set('404', { status_name: 'Not Found', status_category: 'Client Error', is_error: true });
  httpStatus.set('405', { status_name: 'Method Not Allowed', status_category: 'Client Error', is_error: true });
  httpStatus.set('408', { status_name: 'Request Timeout', status_category: 'Client Error', is_error: true });
  httpStatus.set('429', { status_name: 'Too Many Requests', status_category: 'Client Error', is_error: true });
  httpStatus.set('500', { status_name: 'Internal Server Error', status_category: 'Server Error', is_error: true });
  httpStatus.set('502', { status_name: 'Bad Gateway', status_category: 'Server Error', is_error: true });
  httpStatus.set('503', { status_name: 'Service Unavailable', status_category: 'Server Error', is_error: true });
  httpStatus.set('504', { status_name: 'Gateway Timeout', status_category: 'Server Error', is_error: true });

  lookupTables.set('http_status', {
    name: 'http_status',
    description: 'HTTP status code to name and category',
    keyField: 'code',
    data: httpStatus,
    fields: ['status_name', 'status_category', 'is_error'],
  });

  // Syslog Severity Levels
  const severity = new Map<string, Record<string, unknown>>();
  severity.set('0', { severity_name: 'Emergency', severity_desc: 'System is unusable', severity_level: 'critical' });
  severity.set('1', { severity_name: 'Alert', severity_desc: 'Action must be taken immediately', severity_level: 'critical' });
  severity.set('2', { severity_name: 'Critical', severity_desc: 'Critical conditions', severity_level: 'critical' });
  severity.set('3', { severity_name: 'Error', severity_desc: 'Error conditions', severity_level: 'error' });
  severity.set('4', { severity_name: 'Warning', severity_desc: 'Warning conditions', severity_level: 'warning' });
  severity.set('5', { severity_name: 'Notice', severity_desc: 'Normal but significant condition', severity_level: 'info' });
  severity.set('6', { severity_name: 'Informational', severity_desc: 'Informational messages', severity_level: 'info' });
  severity.set('7', { severity_name: 'Debug', severity_desc: 'Debug-level messages', severity_level: 'debug' });

  lookupTables.set('severity', {
    name: 'severity',
    description: 'Syslog severity code to name and description',
    keyField: 'code',
    data: severity,
    fields: ['severity_name', 'severity_desc', 'severity_level'],
  });

  // Country Codes (ISO 3166-1 alpha-2)
  const countries = new Map<string, Record<string, unknown>>();
  countries.set('US', { country_name: 'United States', region: 'North America', continent: 'NA' });
  countries.set('GB', { country_name: 'United Kingdom', region: 'Europe', continent: 'EU' });
  countries.set('DE', { country_name: 'Germany', region: 'Europe', continent: 'EU' });
  countries.set('FR', { country_name: 'France', region: 'Europe', continent: 'EU' });
  countries.set('JP', { country_name: 'Japan', region: 'Asia', continent: 'AS' });
  countries.set('CN', { country_name: 'China', region: 'Asia', continent: 'AS' });
  countries.set('IN', { country_name: 'India', region: 'Asia', continent: 'AS' });
  countries.set('BR', { country_name: 'Brazil', region: 'South America', continent: 'SA' });
  countries.set('AU', { country_name: 'Australia', region: 'Oceania', continent: 'OC' });
  countries.set('CA', { country_name: 'Canada', region: 'North America', continent: 'NA' });
  countries.set('RU', { country_name: 'Russia', region: 'Europe/Asia', continent: 'EU' });
  countries.set('IT', { country_name: 'Italy', region: 'Europe', continent: 'EU' });
  countries.set('ES', { country_name: 'Spain', region: 'Europe', continent: 'EU' });
  countries.set('KR', { country_name: 'South Korea', region: 'Asia', continent: 'AS' });
  countries.set('MX', { country_name: 'Mexico', region: 'North America', continent: 'NA' });
  countries.set('NL', { country_name: 'Netherlands', region: 'Europe', continent: 'EU' });
  countries.set('SE', { country_name: 'Sweden', region: 'Europe', continent: 'EU' });
  countries.set('CH', { country_name: 'Switzerland', region: 'Europe', continent: 'EU' });
  countries.set('SG', { country_name: 'Singapore', region: 'Asia', continent: 'AS' });
  countries.set('HK', { country_name: 'Hong Kong', region: 'Asia', continent: 'AS' });

  lookupTables.set('countries', {
    name: 'countries',
    description: 'Country code to country name and region',
    keyField: 'code',
    data: countries,
    fields: ['country_name', 'region', 'continent'],
  });

  // Common TCP/UDP Ports
  const ports = new Map<string, Record<string, unknown>>();
  ports.set('21', { service: 'FTP', protocol: 'TCP', category: 'File Transfer' });
  ports.set('22', { service: 'SSH', protocol: 'TCP', category: 'Remote Access' });
  ports.set('23', { service: 'Telnet', protocol: 'TCP', category: 'Remote Access' });
  ports.set('25', { service: 'SMTP', protocol: 'TCP', category: 'Email' });
  ports.set('53', { service: 'DNS', protocol: 'TCP/UDP', category: 'Network' });
  ports.set('80', { service: 'HTTP', protocol: 'TCP', category: 'Web' });
  ports.set('110', { service: 'POP3', protocol: 'TCP', category: 'Email' });
  ports.set('143', { service: 'IMAP', protocol: 'TCP', category: 'Email' });
  ports.set('443', { service: 'HTTPS', protocol: 'TCP', category: 'Web' });
  ports.set('465', { service: 'SMTPS', protocol: 'TCP', category: 'Email' });
  ports.set('587', { service: 'SMTP Submission', protocol: 'TCP', category: 'Email' });
  ports.set('993', { service: 'IMAPS', protocol: 'TCP', category: 'Email' });
  ports.set('995', { service: 'POP3S', protocol: 'TCP', category: 'Email' });
  ports.set('3306', { service: 'MySQL', protocol: 'TCP', category: 'Database' });
  ports.set('3389', { service: 'RDP', protocol: 'TCP', category: 'Remote Access' });
  ports.set('5432', { service: 'PostgreSQL', protocol: 'TCP', category: 'Database' });
  ports.set('5672', { service: 'AMQP', protocol: 'TCP', category: 'Message Queue' });
  ports.set('6379', { service: 'Redis', protocol: 'TCP', category: 'Database' });
  ports.set('8080', { service: 'HTTP Alt', protocol: 'TCP', category: 'Web' });
  ports.set('8443', { service: 'HTTPS Alt', protocol: 'TCP', category: 'Web' });
  ports.set('9200', { service: 'Elasticsearch', protocol: 'TCP', category: 'Database' });
  ports.set('27017', { service: 'MongoDB', protocol: 'TCP', category: 'Database' });

  lookupTables.set('ports', {
    name: 'ports',
    description: 'Port number to service name and category',
    keyField: 'port',
    data: ports,
    fields: ['service', 'protocol', 'category'],
  });

  // GeoIP (sample data - in production would use MaxMind or similar)
  const geoip = new Map<string, Record<string, unknown>>();
  // Sample IP ranges - these are example/documentation IPs
  geoip.set('192.168.1.1', { country: 'US', city: 'Private Network', region: 'N/A', isp: 'Private', is_private: true });
  geoip.set('10.0.0.1', { country: 'US', city: 'Private Network', region: 'N/A', isp: 'Private', is_private: true });
  geoip.set('172.16.0.1', { country: 'US', city: 'Private Network', region: 'N/A', isp: 'Private', is_private: true });
  geoip.set('8.8.8.8', { country: 'US', city: 'Mountain View', region: 'California', isp: 'Google', is_private: false });
  geoip.set('8.8.4.4', { country: 'US', city: 'Mountain View', region: 'California', isp: 'Google', is_private: false });
  geoip.set('1.1.1.1', { country: 'AU', city: 'Sydney', region: 'NSW', isp: 'Cloudflare', is_private: false });
  geoip.set('208.67.222.222', { country: 'US', city: 'San Francisco', region: 'California', isp: 'OpenDNS', is_private: false });

  lookupTables.set('geoip', {
    name: 'geoip',
    description: 'IP address to geographic information',
    keyField: 'ip',
    data: geoip,
    fields: ['country', 'city', 'region', 'isp', 'is_private'],
  });

  // Log Levels (various logging frameworks)
  const logLevels = new Map<string, Record<string, unknown>>();
  logLevels.set('TRACE', { numeric_level: 0, priority: 'lowest', color: 'gray' });
  logLevels.set('DEBUG', { numeric_level: 10, priority: 'low', color: 'blue' });
  logLevels.set('INFO', { numeric_level: 20, priority: 'normal', color: 'green' });
  logLevels.set('WARN', { numeric_level: 30, priority: 'elevated', color: 'yellow' });
  logLevels.set('WARNING', { numeric_level: 30, priority: 'elevated', color: 'yellow' });
  logLevels.set('ERROR', { numeric_level: 40, priority: 'high', color: 'red' });
  logLevels.set('FATAL', { numeric_level: 50, priority: 'critical', color: 'purple' });
  logLevels.set('CRITICAL', { numeric_level: 50, priority: 'critical', color: 'purple' });

  lookupTables.set('log_levels', {
    name: 'log_levels',
    description: 'Log level name to numeric level and priority',
    keyField: 'level',
    data: logLevels,
    fields: ['numeric_level', 'priority', 'color'],
  });

  // User Agents (browser/bot detection)
  const userAgents = new Map<string, Record<string, unknown>>();
  userAgents.set('Chrome', { browser_type: 'browser', vendor: 'Google', is_bot: false });
  userAgents.set('Firefox', { browser_type: 'browser', vendor: 'Mozilla', is_bot: false });
  userAgents.set('Safari', { browser_type: 'browser', vendor: 'Apple', is_bot: false });
  userAgents.set('Edge', { browser_type: 'browser', vendor: 'Microsoft', is_bot: false });
  userAgents.set('Googlebot', { browser_type: 'crawler', vendor: 'Google', is_bot: true });
  userAgents.set('Bingbot', { browser_type: 'crawler', vendor: 'Microsoft', is_bot: true });
  userAgents.set('curl', { browser_type: 'tool', vendor: 'Open Source', is_bot: false });
  userAgents.set('wget', { browser_type: 'tool', vendor: 'Open Source', is_bot: false });
  userAgents.set('Postman', { browser_type: 'tool', vendor: 'Postman', is_bot: false });

  lookupTables.set('user_agents', {
    name: 'user_agents',
    description: 'User agent string to browser type and vendor',
    keyField: 'ua',
    data: userAgents,
    fields: ['browser_type', 'vendor', 'is_bot'],
  });
}

// Initialize on module load
initializeTables();

/**
 * Get a lookup table by name
 */
export function getLookupTable(name: string): LookupTable | undefined {
  return lookupTables.get(name.toLowerCase());
}

/**
 * List all available lookup tables
 */
export function listLookupTables(): Array<{ name: string; description: string; keyField: string; fields: string[] }> {
  return Array.from(lookupTables.values()).map(t => ({
    name: t.name,
    description: t.description,
    keyField: t.keyField,
    fields: t.fields,
  }));
}

/**
 * Perform a lookup for a single value
 */
export function lookupValue(tableName: string, key: string): Record<string, unknown> | undefined {
  const table = lookupTables.get(tableName.toLowerCase());
  if (!table) return undefined;
  return table.data.get(String(key));
}

/**
 * Apply lookup to an array of results
 * Enriches each row with fields from the lookup table
 */
export function applyLookup(
  results: Record<string, unknown>[],
  tableName: string,
  field: string,
  matchField?: string,
  outputFields?: string[]
): Record<string, unknown>[] {
  const table = lookupTables.get(tableName.toLowerCase());
  if (!table) {
    console.warn(`Lookup table '${tableName}' not found`);
    return results;
  }

  const lookupKeyField = matchField || table.keyField;
  const fieldsToOutput = outputFields && outputFields.length > 0 ? outputFields : table.fields;

  return results.map(row => {
    const keyValue = String(row[field] ?? '');
    const lookupData = table.data.get(keyValue);

    if (lookupData) {
      // Add lookup fields to the row
      const enriched = { ...row };
      for (const outputField of fieldsToOutput) {
        if (outputField in lookupData) {
          enriched[outputField] = lookupData[outputField];
        }
      }
      return enriched;
    }

    return row;
  });
}

/**
 * Add or update a custom lookup table
 */
export function setLookupTable(
  name: string,
  description: string,
  keyField: string,
  data: Array<{ key: string; values: Record<string, unknown> }>
): void {
  const dataMap = new Map<string, Record<string, unknown>>();
  const fields = new Set<string>();

  for (const entry of data) {
    dataMap.set(entry.key, entry.values);
    Object.keys(entry.values).forEach(f => fields.add(f));
  }

  lookupTables.set(name.toLowerCase(), {
    name: name.toLowerCase(),
    description,
    keyField,
    data: dataMap,
    fields: Array.from(fields),
  });
}
