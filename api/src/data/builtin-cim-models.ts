/**
 * Built-in CIM (Common Information Model) Data Models
 *
 * These models define standard field names for common log categories,
 * enabling consistent queries across different log sources.
 */

import { getDataModel, createDataModel, type CIMField } from '../db/sqlite.js';

// ============================================================================
// Authentication Data Model
// ============================================================================
const authenticationFields: CIMField[] = [
  { name: 'action', type: 'string', required: true, description: 'The authentication action (login, logout, failed)', aliases: ['event_type', 'auth_action'] },
  { name: 'user', type: 'string', required: true, description: 'The user attempting authentication', aliases: ['username', 'user_name', 'account', 'uid'] },
  { name: 'src', type: 'ip', description: 'Source IP address of the authentication attempt', aliases: ['src_ip', 'source_ip', 'client_ip', 'remote_addr'] },
  { name: 'src_port', type: 'number', description: 'Source port of the authentication attempt', aliases: ['source_port', 'client_port'] },
  { name: 'dest', type: 'ip', description: 'Destination IP/hostname receiving the auth request', aliases: ['dest_ip', 'destination', 'server', 'host'] },
  { name: 'dest_port', type: 'number', description: 'Destination port (e.g., 22 for SSH)', aliases: ['destination_port', 'server_port'] },
  { name: 'app', type: 'string', description: 'Application handling authentication', aliases: ['application', 'service', 'process'] },
  { name: 'result', type: 'string', description: 'Outcome of the auth attempt (success, failure)', aliases: ['status', 'outcome', 'auth_result'] },
  { name: 'reason', type: 'string', description: 'Failure reason if applicable', aliases: ['error', 'failure_reason', 'message'] },
  { name: 'method', type: 'string', description: 'Authentication method used (password, key, mfa)', aliases: ['auth_method', 'auth_type'] },
  { name: 'session_id', type: 'string', description: 'Session identifier if available', aliases: ['session', 'sid'] },
];

// ============================================================================
// Network Traffic Data Model
// ============================================================================
const networkFields: CIMField[] = [
  { name: 'action', type: 'string', description: 'Network action (allow, block, drop)', aliases: ['event_action', 'rule_action'] },
  { name: 'src_ip', type: 'ip', required: true, description: 'Source IP address', aliases: ['src', 'source', 'client_ip'] },
  { name: 'src_port', type: 'number', description: 'Source port number', aliases: ['source_port', 'sport'] },
  { name: 'dest_ip', type: 'ip', required: true, description: 'Destination IP address', aliases: ['dest', 'destination', 'dst', 'dst_ip'] },
  { name: 'dest_port', type: 'number', description: 'Destination port number', aliases: ['destination_port', 'dport'] },
  { name: 'protocol', type: 'string', description: 'Network protocol (TCP, UDP, ICMP)', aliases: ['proto', 'ip_protocol'] },
  { name: 'bytes_in', type: 'number', description: 'Bytes received', aliases: ['bytes_recv', 'rx_bytes', 'in_bytes'] },
  { name: 'bytes_out', type: 'number', description: 'Bytes sent', aliases: ['bytes_sent', 'tx_bytes', 'out_bytes'] },
  { name: 'bytes', type: 'number', description: 'Total bytes transferred', aliases: ['total_bytes', 'byte_count'] },
  { name: 'packets_in', type: 'number', description: 'Packets received', aliases: ['pkts_in', 'rx_packets'] },
  { name: 'packets_out', type: 'number', description: 'Packets sent', aliases: ['pkts_out', 'tx_packets'] },
  { name: 'packets', type: 'number', description: 'Total packets', aliases: ['total_packets', 'packet_count'] },
  { name: 'duration', type: 'number', description: 'Connection duration in seconds', aliases: ['conn_duration', 'session_duration'] },
  { name: 'direction', type: 'string', description: 'Traffic direction (inbound, outbound)', aliases: ['traffic_direction', 'flow_direction'] },
  { name: 'interface', type: 'string', description: 'Network interface', aliases: ['iface', 'nic', 'adapter'] },
  { name: 'rule', type: 'string', description: 'Firewall rule that matched', aliases: ['rule_name', 'acl', 'policy'] },
];

// ============================================================================
// Endpoint/Host Data Model
// ============================================================================
const endpointFields: CIMField[] = [
  { name: 'action', type: 'string', description: 'Action taken (create, modify, delete, execute)', aliases: ['event_action', 'operation'] },
  { name: 'host', type: 'string', required: true, description: 'Hostname where event occurred', aliases: ['hostname', 'computer', 'machine', 'device'] },
  { name: 'user', type: 'string', description: 'User who performed the action', aliases: ['username', 'account', 'actor'] },
  { name: 'process', type: 'string', description: 'Process name', aliases: ['process_name', 'image', 'executable'] },
  { name: 'process_id', type: 'number', description: 'Process ID', aliases: ['pid', 'proc_id'] },
  { name: 'parent_process', type: 'string', description: 'Parent process name', aliases: ['parent_image', 'parent_name'] },
  { name: 'parent_process_id', type: 'number', description: 'Parent process ID', aliases: ['ppid', 'parent_pid'] },
  { name: 'command_line', type: 'string', description: 'Full command line', aliases: ['cmdline', 'cmd', 'command'] },
  { name: 'file_path', type: 'string', description: 'File system path', aliases: ['path', 'file', 'target_file', 'object_path'] },
  { name: 'file_name', type: 'string', description: 'File name without path', aliases: ['name', 'filename'] },
  { name: 'file_hash', type: 'string', description: 'File hash (MD5, SHA1, SHA256)', aliases: ['hash', 'md5', 'sha1', 'sha256'] },
  { name: 'file_size', type: 'number', description: 'File size in bytes', aliases: ['size', 'bytes'] },
  { name: 'registry_key', type: 'string', description: 'Windows registry key', aliases: ['regkey', 'key_path'] },
  { name: 'registry_value', type: 'string', description: 'Registry value name', aliases: ['value_name', 'regvalue'] },
  { name: 'service_name', type: 'string', description: 'Service name', aliases: ['service', 'daemon'] },
];

// ============================================================================
// Web/HTTP Data Model
// ============================================================================
const webFields: CIMField[] = [
  { name: 'action', type: 'string', description: 'HTTP method', aliases: ['method', 'http_method', 'request_method'] },
  { name: 'src_ip', type: 'ip', required: true, description: 'Client IP address', aliases: ['client_ip', 'remote_addr', 'src'] },
  { name: 'dest_ip', type: 'ip', description: 'Server IP address', aliases: ['server_ip', 'dest', 'host_ip'] },
  { name: 'uri', type: 'string', required: true, description: 'Request URI/path', aliases: ['url', 'path', 'request_uri', 'uri_path'] },
  { name: 'uri_query', type: 'string', description: 'Query string parameters', aliases: ['query', 'query_string', 'qs'] },
  { name: 'http_host', type: 'string', description: 'HTTP Host header', aliases: ['host', 'domain', 'server_name'] },
  { name: 'status', type: 'number', required: true, description: 'HTTP status code', aliases: ['status_code', 'http_status', 'response_code'] },
  { name: 'bytes', type: 'number', description: 'Response body size in bytes', aliases: ['body_bytes', 'content_length', 'response_size'] },
  { name: 'bytes_in', type: 'number', description: 'Request size in bytes', aliases: ['request_size', 'bytes_received'] },
  { name: 'bytes_out', type: 'number', description: 'Response size in bytes', aliases: ['response_size', 'bytes_sent'] },
  { name: 'duration', type: 'number', description: 'Request duration in ms', aliases: ['request_time', 'response_time', 'latency'] },
  { name: 'user_agent', type: 'string', description: 'User-Agent header', aliases: ['ua', 'agent', 'http_user_agent'] },
  { name: 'referer', type: 'string', description: 'Referer header', aliases: ['referrer', 'http_referer'] },
  { name: 'http_version', type: 'string', description: 'HTTP version (1.0, 1.1, 2.0)', aliases: ['version', 'protocol_version'] },
  { name: 'content_type', type: 'string', description: 'Response Content-Type', aliases: ['mime_type', 'type'] },
  { name: 'cookie', type: 'string', description: 'Cookie header value', aliases: ['cookies', 'http_cookie'] },
  { name: 'user', type: 'string', description: 'Authenticated user if any', aliases: ['username', 'remote_user', 'auth_user'] },
];

// ============================================================================
// Built-in Model Definitions
// ============================================================================
export const BUILTIN_CIM_MODELS = [
  {
    name: 'Authentication',
    description: 'Standard fields for authentication events (login, logout, failed attempts)',
    category: 'authentication' as const,
    fields: authenticationFields,
    constraints: ['action IN (login, logout, failed, lockout, unlock)', 'result IN (success, failure)'],
  },
  {
    name: 'Network_Traffic',
    description: 'Standard fields for network traffic and firewall events',
    category: 'network' as const,
    fields: networkFields,
    constraints: ['protocol IN (TCP, UDP, ICMP, GRE)', 'direction IN (inbound, outbound, internal)'],
  },
  {
    name: 'Endpoint',
    description: 'Standard fields for endpoint/host events (process, file, registry)',
    category: 'endpoint' as const,
    fields: endpointFields,
    constraints: ['action IN (create, modify, delete, execute, access, read, write)'],
  },
  {
    name: 'Web',
    description: 'Standard fields for HTTP/web traffic events',
    category: 'web' as const,
    fields: webFields,
    constraints: ['status >= 100 AND status < 600', 'action IN (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)'],
  },
];

// ============================================================================
// Default Field Mappings for Common Log Sources
// ============================================================================
export const DEFAULT_FIELD_MAPPINGS = [
  // SSH/SSHD mappings to Authentication
  { source_type: 'sshd', source_field: 'user', data_model: 'Authentication', cim_field: 'user' },
  { source_type: 'sshd', source_field: 'rhost', data_model: 'Authentication', cim_field: 'src' },
  { source_type: 'sshd', source_field: 'port', data_model: 'Authentication', cim_field: 'src_port' },

  // Nginx mappings to Web
  { source_type: 'nginx', source_field: 'remote_addr', data_model: 'Web', cim_field: 'src_ip' },
  { source_type: 'nginx', source_field: 'request_uri', data_model: 'Web', cim_field: 'uri' },
  { source_type: 'nginx', source_field: 'status', data_model: 'Web', cim_field: 'status' },
  { source_type: 'nginx', source_field: 'body_bytes_sent', data_model: 'Web', cim_field: 'bytes' },
  { source_type: 'nginx', source_field: 'request_time', data_model: 'Web', cim_field: 'duration', transform: 'float() * 1000' },
  { source_type: 'nginx', source_field: 'http_user_agent', data_model: 'Web', cim_field: 'user_agent' },
  { source_type: 'nginx', source_field: 'request_method', data_model: 'Web', cim_field: 'action' },

  // Apache mappings to Web
  { source_type: 'apache', source_field: 'clientip', data_model: 'Web', cim_field: 'src_ip' },
  { source_type: 'apache', source_field: 'request', data_model: 'Web', cim_field: 'uri' },
  { source_type: 'apache', source_field: 'response', data_model: 'Web', cim_field: 'status' },
  { source_type: 'apache', source_field: 'bytes', data_model: 'Web', cim_field: 'bytes' },

  // Firewall/iptables mappings to Network
  { source_type: 'iptables', source_field: 'SRC', data_model: 'Network_Traffic', cim_field: 'src_ip' },
  { source_type: 'iptables', source_field: 'DST', data_model: 'Network_Traffic', cim_field: 'dest_ip' },
  { source_type: 'iptables', source_field: 'SPT', data_model: 'Network_Traffic', cim_field: 'src_port' },
  { source_type: 'iptables', source_field: 'DPT', data_model: 'Network_Traffic', cim_field: 'dest_port' },
  { source_type: 'iptables', source_field: 'PROTO', data_model: 'Network_Traffic', cim_field: 'protocol' },

  // Windows Security Event mappings
  { source_type: 'windows_security', source_field: 'TargetUserName', data_model: 'Authentication', cim_field: 'user' },
  { source_type: 'windows_security', source_field: 'IpAddress', data_model: 'Authentication', cim_field: 'src' },
  { source_type: 'windows_security', source_field: 'LogonType', data_model: 'Authentication', cim_field: 'method' },
  { source_type: 'windows_security', source_field: 'WorkstationName', data_model: 'Authentication', cim_field: 'dest' },

  // Sysmon mappings to Endpoint
  { source_type: 'sysmon', source_field: 'Image', data_model: 'Endpoint', cim_field: 'process' },
  { source_type: 'sysmon', source_field: 'ProcessId', data_model: 'Endpoint', cim_field: 'process_id' },
  { source_type: 'sysmon', source_field: 'ParentImage', data_model: 'Endpoint', cim_field: 'parent_process' },
  { source_type: 'sysmon', source_field: 'ParentProcessId', data_model: 'Endpoint', cim_field: 'parent_process_id' },
  { source_type: 'sysmon', source_field: 'CommandLine', data_model: 'Endpoint', cim_field: 'command_line' },
  { source_type: 'sysmon', source_field: 'User', data_model: 'Endpoint', cim_field: 'user' },
  { source_type: 'sysmon', source_field: 'TargetFilename', data_model: 'Endpoint', cim_field: 'file_path' },
  { source_type: 'sysmon', source_field: 'Hashes', data_model: 'Endpoint', cim_field: 'file_hash' },
];

/**
 * Seeds the built-in CIM data models into the database
 */
export function seedBuiltinCIMModels(): void {
  console.log('Seeding built-in CIM data models...');

  for (const model of BUILTIN_CIM_MODELS) {
    const existing = getDataModel(model.name);
    if (!existing) {
      createDataModel({
        name: model.name,
        description: model.description,
        category: model.category,
        fields: model.fields,
        constraints: model.constraints,
        is_builtin: true,
        enabled: true,
      });
      console.log(`  Created CIM model: ${model.name}`);
    }
  }

  console.log('CIM data models seeding complete.');
}
