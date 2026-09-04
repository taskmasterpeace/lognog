/**
 * Built-in CIM (Common Information Model) Data Models
 *
 * LogNog's CIM is rebased on open, permissively-licensed schemas:
 *   - Canonical field names follow the Elastic Common Schema (ECS, Apache-2.0).
 *   - Each model is classified by its OCSF event class (Open Cybersecurity
 *     Schema Framework, Apache-2.0) — see OCSF_CLASS_MAP.
 * Splunk-style field names (src, dest, uri, …) are preserved ONLY as input
 * `aliases`, so existing sources still normalize, without shipping Splunk's
 * proprietary CIM taxonomy as our own. See docs/NOTICE for attribution.
 */

import { getDataModel, createDataModel, getSQLiteDB, type CIMField } from '../db/sqlite.js';

/** OCSF event class uid for each built-in model (Open Cybersecurity Schema Framework). */
export const OCSF_CLASS_MAP: Record<string, number> = {
  Authentication: 3002, // OCSF Authentication [3002]
  Network_Activity: 4001, // OCSF Network Activity [4001]
  System_Activity: 1007, // OCSF Process Activity [1007] (also covers File System Activity [1001])
  HTTP_Activity: 4002, // OCSF HTTP Activity [4002]
};

// ============================================================================
// Authentication  →  ECS field names, OCSF Authentication [3002]
// ============================================================================
const authenticationFields: CIMField[] = [
  { name: 'event.action', type: 'string', required: true, description: 'The authentication action (login, logout, failed)', aliases: ['action', 'event_type', 'auth_action'] },
  { name: 'user.name', type: 'string', required: true, description: 'The user attempting authentication', aliases: ['user', 'username', 'user_name', 'account', 'uid'] },
  { name: 'source.ip', type: 'ip', description: 'Source IP address of the authentication attempt', aliases: ['src', 'src_ip', 'source_ip', 'client_ip', 'remote_addr'] },
  { name: 'source.port', type: 'number', description: 'Source port of the authentication attempt', aliases: ['src_port', 'source_port', 'client_port'] },
  { name: 'destination.ip', type: 'ip', description: 'Destination IP/hostname receiving the auth request', aliases: ['dest', 'dest_ip', 'destination', 'server'] },
  { name: 'destination.port', type: 'number', description: 'Destination port (e.g., 22 for SSH)', aliases: ['dest_port', 'destination_port', 'server_port'] },
  { name: 'service.name', type: 'string', description: 'Application/service handling authentication', aliases: ['app', 'application', 'service', 'process'] },
  { name: 'event.outcome', type: 'string', description: 'Outcome of the auth attempt (success, failure)', aliases: ['result', 'status', 'outcome', 'auth_result'] },
  { name: 'error.message', type: 'string', description: 'Failure reason if applicable', aliases: ['reason', 'error', 'failure_reason', 'message'] },
  { name: 'authentication.method', type: 'string', description: 'Authentication method used (password, key, mfa)', aliases: ['method', 'auth_method', 'auth_type', 'logontype'] },
  { name: 'session.id', type: 'string', description: 'Session identifier if available', aliases: ['session_id', 'session', 'sid'] },
];

// ============================================================================
// Network_Activity  →  ECS network.*, OCSF Network Activity [4001]
// ============================================================================
const networkFields: CIMField[] = [
  { name: 'event.action', type: 'string', description: 'Network action (allow, block, drop)', aliases: ['action', 'event_action', 'rule_action'] },
  { name: 'source.ip', type: 'ip', required: true, description: 'Source IP address', aliases: ['src_ip', 'src', 'source', 'client_ip'] },
  { name: 'source.port', type: 'number', description: 'Source port number', aliases: ['src_port', 'source_port', 'sport'] },
  { name: 'destination.ip', type: 'ip', required: true, description: 'Destination IP address', aliases: ['dest_ip', 'dest', 'destination', 'dst', 'dst_ip'] },
  { name: 'destination.port', type: 'number', description: 'Destination port number', aliases: ['dest_port', 'destination_port', 'dport'] },
  { name: 'network.transport', type: 'string', description: 'Network protocol (TCP, UDP, ICMP)', aliases: ['protocol', 'proto', 'ip_protocol'] },
  { name: 'source.bytes', type: 'number', description: 'Bytes sent by the source', aliases: ['bytes_in', 'bytes_recv', 'rx_bytes', 'in_bytes'] },
  { name: 'destination.bytes', type: 'number', description: 'Bytes sent by the destination', aliases: ['bytes_out', 'bytes_sent', 'tx_bytes', 'out_bytes'] },
  { name: 'network.bytes', type: 'number', description: 'Total bytes transferred', aliases: ['bytes', 'total_bytes', 'byte_count'] },
  { name: 'source.packets', type: 'number', description: 'Packets sent by the source', aliases: ['packets_in', 'pkts_in', 'rx_packets'] },
  { name: 'destination.packets', type: 'number', description: 'Packets sent by the destination', aliases: ['packets_out', 'pkts_out', 'tx_packets'] },
  { name: 'network.packets', type: 'number', description: 'Total packets', aliases: ['packets', 'total_packets', 'packet_count'] },
  { name: 'event.duration', type: 'number', description: 'Connection duration in seconds', aliases: ['duration', 'conn_duration', 'session_duration'] },
  { name: 'network.direction', type: 'string', description: 'Traffic direction (inbound, outbound)', aliases: ['direction', 'traffic_direction', 'flow_direction'] },
  { name: 'network.interface.name', type: 'string', description: 'Network interface', aliases: ['interface', 'iface', 'nic', 'adapter'] },
  { name: 'rule.name', type: 'string', description: 'Firewall rule that matched', aliases: ['rule', 'rule_name', 'acl', 'policy'] },
];

// ============================================================================
// System_Activity  →  ECS process.*/file.*, OCSF Process Activity [1007]
// ============================================================================
const endpointFields: CIMField[] = [
  { name: 'event.action', type: 'string', description: 'Action taken (create, modify, delete, execute)', aliases: ['action', 'event_action', 'operation'] },
  { name: 'host.name', type: 'string', required: true, description: 'Hostname where event occurred', aliases: ['host', 'hostname', 'computer', 'machine', 'device'] },
  { name: 'user.name', type: 'string', description: 'User who performed the action', aliases: ['user', 'username', 'account', 'actor'] },
  { name: 'process.name', type: 'string', description: 'Process name', aliases: ['process', 'process_name', 'image', 'executable'] },
  { name: 'process.pid', type: 'number', description: 'Process ID', aliases: ['process_id', 'pid', 'proc_id'] },
  { name: 'process.parent.name', type: 'string', description: 'Parent process name', aliases: ['parent_process', 'parent_image', 'parent_name'] },
  { name: 'process.parent.pid', type: 'number', description: 'Parent process ID', aliases: ['parent_process_id', 'ppid', 'parent_pid'] },
  { name: 'process.command_line', type: 'string', description: 'Full command line', aliases: ['command_line', 'cmdline', 'cmd', 'command'] },
  { name: 'file.path', type: 'string', description: 'File system path', aliases: ['file_path', 'path', 'file', 'target_file', 'object_path'] },
  { name: 'file.name', type: 'string', description: 'File name without path', aliases: ['file_name', 'filename'] },
  { name: 'file.hash.sha256', type: 'string', description: 'File hash (MD5, SHA1, SHA256)', aliases: ['file_hash', 'hash', 'md5', 'sha1', 'sha256'] },
  { name: 'file.size', type: 'number', description: 'File size in bytes', aliases: ['file_size', 'size'] },
  { name: 'registry.key', type: 'string', description: 'Windows registry key', aliases: ['registry_key', 'regkey', 'key_path'] },
  { name: 'registry.value', type: 'string', description: 'Registry value name', aliases: ['registry_value', 'value_name', 'regvalue'] },
  { name: 'service.name', type: 'string', description: 'Service name', aliases: ['service_name', 'service', 'daemon'] },
];

// ============================================================================
// HTTP_Activity  →  ECS http.*/url.*, OCSF HTTP Activity [4002]
// ============================================================================
const webFields: CIMField[] = [
  { name: 'http.request.method', type: 'string', description: 'HTTP method', aliases: ['action', 'method', 'http_method', 'request_method'] },
  { name: 'source.ip', type: 'ip', required: true, description: 'Client IP address', aliases: ['client_ip', 'remote_addr', 'src', 'src_ip'] },
  { name: 'destination.ip', type: 'ip', description: 'Server IP address', aliases: ['server_ip', 'dest', 'dest_ip', 'host_ip'] },
  { name: 'url.path', type: 'string', required: true, description: 'Request URI/path', aliases: ['uri', 'url', 'path', 'request_uri', 'uri_path'] },
  { name: 'url.query', type: 'string', description: 'Query string parameters', aliases: ['uri_query', 'query', 'query_string', 'qs'] },
  { name: 'url.domain', type: 'string', description: 'HTTP Host header', aliases: ['http_host', 'host', 'domain', 'server_name'] },
  { name: 'http.response.status_code', type: 'number', required: true, description: 'HTTP status code', aliases: ['status', 'status_code', 'http_status', 'response_code'] },
  { name: 'http.response.body.bytes', type: 'number', description: 'Response body size in bytes', aliases: ['bytes', 'body_bytes', 'content_length', 'response_size'] },
  { name: 'http.request.body.bytes', type: 'number', description: 'Request size in bytes', aliases: ['bytes_in', 'request_size', 'bytes_received'] },
  { name: 'event.duration', type: 'number', description: 'Request duration in ms', aliases: ['duration', 'request_time', 'response_time', 'latency'] },
  { name: 'user_agent.original', type: 'string', description: 'User-Agent header', aliases: ['user_agent', 'ua', 'agent', 'http_user_agent'] },
  { name: 'http.request.referrer', type: 'string', description: 'Referer header', aliases: ['referer', 'referrer', 'http_referer'] },
  { name: 'http.version', type: 'string', description: 'HTTP version (1.0, 1.1, 2.0)', aliases: ['http_version', 'version', 'protocol_version'] },
  { name: 'http.response.mime_type', type: 'string', description: 'Response Content-Type', aliases: ['content_type', 'mime_type', 'type'] },
  { name: 'user.name', type: 'string', description: 'Authenticated user if any', aliases: ['user', 'username', 'remote_user', 'auth_user'] },
];

// ============================================================================
// Built-in Model Definitions (names align to OCSF classes, not Splunk CIM)
// ============================================================================
export const BUILTIN_CIM_MODELS = [
  {
    name: 'Authentication',
    description: 'Authentication events (login, logout, failed attempts). OCSF Authentication [3002]; ECS fields.',
    category: 'authentication' as const,
    fields: authenticationFields,
    constraints: ['event.outcome IN (success, failure)'],
  },
  {
    name: 'Network_Activity',
    description: 'Network traffic and firewall events. OCSF Network Activity [4001]; ECS network.* fields.',
    category: 'network' as const,
    fields: networkFields,
    constraints: ['network.direction IN (inbound, outbound, internal)'],
  },
  {
    name: 'System_Activity',
    description: 'Endpoint/host events (process, file, registry). OCSF Process Activity [1007]; ECS process.*/file.* fields.',
    category: 'endpoint' as const,
    fields: endpointFields,
    constraints: ['event.action IN (create, modify, delete, execute, access, read, write)'],
  },
  {
    name: 'HTTP_Activity',
    description: 'HTTP/web traffic events. OCSF HTTP Activity [4002]; ECS http.*/url.* fields.',
    category: 'web' as const,
    fields: webFields,
    constraints: ['http.response.status_code >= 100 AND http.response.status_code < 600'],
  },
];

// ============================================================================
// Default Field Mappings for Common Log Sources (→ canonical ECS names)
// ============================================================================
export const DEFAULT_FIELD_MAPPINGS = [
  // SSH/SSHD → Authentication
  { source_type: 'sshd', source_field: 'user', data_model: 'Authentication', cim_field: 'user.name' },
  { source_type: 'sshd', source_field: 'rhost', data_model: 'Authentication', cim_field: 'source.ip' },
  { source_type: 'sshd', source_field: 'port', data_model: 'Authentication', cim_field: 'source.port' },

  // Nginx → HTTP_Activity
  { source_type: 'nginx', source_field: 'remote_addr', data_model: 'HTTP_Activity', cim_field: 'source.ip' },
  { source_type: 'nginx', source_field: 'request_uri', data_model: 'HTTP_Activity', cim_field: 'url.path' },
  { source_type: 'nginx', source_field: 'status', data_model: 'HTTP_Activity', cim_field: 'http.response.status_code' },
  { source_type: 'nginx', source_field: 'body_bytes_sent', data_model: 'HTTP_Activity', cim_field: 'http.response.body.bytes' },
  { source_type: 'nginx', source_field: 'request_time', data_model: 'HTTP_Activity', cim_field: 'event.duration', transform: 'float() * 1000' },
  { source_type: 'nginx', source_field: 'http_user_agent', data_model: 'HTTP_Activity', cim_field: 'user_agent.original' },
  { source_type: 'nginx', source_field: 'request_method', data_model: 'HTTP_Activity', cim_field: 'http.request.method' },

  // Apache → HTTP_Activity
  { source_type: 'apache', source_field: 'clientip', data_model: 'HTTP_Activity', cim_field: 'source.ip' },
  { source_type: 'apache', source_field: 'request', data_model: 'HTTP_Activity', cim_field: 'url.path' },
  { source_type: 'apache', source_field: 'response', data_model: 'HTTP_Activity', cim_field: 'http.response.status_code' },
  { source_type: 'apache', source_field: 'bytes', data_model: 'HTTP_Activity', cim_field: 'http.response.body.bytes' },

  // Firewall/iptables → Network_Activity
  { source_type: 'iptables', source_field: 'SRC', data_model: 'Network_Activity', cim_field: 'source.ip' },
  { source_type: 'iptables', source_field: 'DST', data_model: 'Network_Activity', cim_field: 'destination.ip' },
  { source_type: 'iptables', source_field: 'SPT', data_model: 'Network_Activity', cim_field: 'source.port' },
  { source_type: 'iptables', source_field: 'DPT', data_model: 'Network_Activity', cim_field: 'destination.port' },
  { source_type: 'iptables', source_field: 'PROTO', data_model: 'Network_Activity', cim_field: 'network.transport' },

  // Windows Security Event → Authentication
  { source_type: 'windows_security', source_field: 'TargetUserName', data_model: 'Authentication', cim_field: 'user.name' },
  { source_type: 'windows_security', source_field: 'IpAddress', data_model: 'Authentication', cim_field: 'source.ip' },
  { source_type: 'windows_security', source_field: 'LogonType', data_model: 'Authentication', cim_field: 'authentication.method' },
  { source_type: 'windows_security', source_field: 'WorkstationName', data_model: 'Authentication', cim_field: 'destination.ip' },

  // Sysmon → System_Activity
  { source_type: 'sysmon', source_field: 'Image', data_model: 'System_Activity', cim_field: 'process.name' },
  { source_type: 'sysmon', source_field: 'ProcessId', data_model: 'System_Activity', cim_field: 'process.pid' },
  { source_type: 'sysmon', source_field: 'ParentImage', data_model: 'System_Activity', cim_field: 'process.parent.name' },
  { source_type: 'sysmon', source_field: 'ParentProcessId', data_model: 'System_Activity', cim_field: 'process.parent.pid' },
  { source_type: 'sysmon', source_field: 'CommandLine', data_model: 'System_Activity', cim_field: 'process.command_line' },
  { source_type: 'sysmon', source_field: 'User', data_model: 'System_Activity', cim_field: 'user.name' },
  { source_type: 'sysmon', source_field: 'TargetFilename', data_model: 'System_Activity', cim_field: 'file.path' },
  { source_type: 'sysmon', source_field: 'Hashes', data_model: 'System_Activity', cim_field: 'file.hash.sha256' },
];

// ============================================================================
// Migration: legacy Splunk-mirroring built-ins → ECS/OCSF taxonomy
// ============================================================================
/**
 * Per legacy built-in model: its new OCSF-aligned name and the old→new field
 * renames used to repoint existing field_mappings. Splunk-style names remain
 * recognized as `aliases` on the reseeded models (see the field definitions).
 */
export const LEGACY_MIGRATIONS: Array<{
  legacyName: string;
  newName: string;
  fieldRenames: Record<string, string>;
}> = [
  {
    legacyName: 'Authentication',
    newName: 'Authentication',
    fieldRenames: {
      action: 'event.action', user: 'user.name', src: 'source.ip', src_port: 'source.port',
      dest: 'destination.ip', dest_port: 'destination.port', app: 'service.name',
      result: 'event.outcome', reason: 'error.message', method: 'authentication.method', session_id: 'session.id',
    },
  },
  {
    legacyName: 'Network_Traffic',
    newName: 'Network_Activity',
    fieldRenames: {
      action: 'event.action', src_ip: 'source.ip', src_port: 'source.port', dest_ip: 'destination.ip',
      dest_port: 'destination.port', protocol: 'network.transport', bytes_in: 'source.bytes',
      bytes_out: 'destination.bytes', bytes: 'network.bytes', packets_in: 'source.packets',
      packets_out: 'destination.packets', packets: 'network.packets', duration: 'event.duration',
      direction: 'network.direction', interface: 'network.interface.name', rule: 'rule.name',
    },
  },
  {
    legacyName: 'Endpoint',
    newName: 'System_Activity',
    fieldRenames: {
      action: 'event.action', host: 'host.name', user: 'user.name', process: 'process.name',
      process_id: 'process.pid', parent_process: 'process.parent.name', parent_process_id: 'process.parent.pid',
      command_line: 'process.command_line', file_path: 'file.path', file_name: 'file.name',
      file_hash: 'file.hash.sha256', file_size: 'file.size', registry_key: 'registry.key',
      registry_value: 'registry.value', service_name: 'service.name',
    },
  },
  {
    legacyName: 'Web',
    newName: 'HTTP_Activity',
    fieldRenames: {
      action: 'http.request.method', src_ip: 'source.ip', dest_ip: 'destination.ip', uri: 'url.path',
      uri_query: 'url.query', http_host: 'url.domain', status: 'http.response.status_code',
      bytes: 'http.response.body.bytes', bytes_in: 'http.request.body.bytes', bytes_out: 'http.response.body.bytes',
      duration: 'event.duration', user_agent: 'user_agent.original', referer: 'http.request.referrer',
      http_version: 'http.version', content_type: 'http.response.mime_type', user: 'user.name',
    },
  },
];

/**
 * Upgrades an already-seeded install from the legacy Splunk-mirroring built-ins
 * to the ECS/OCSF taxonomy. Idempotent: safe to run on every startup.
 *  1. Repoint existing field_mappings (data_model + cim_field) to the new names.
 *  2. Remove the stale built-in models (raw SQL bypasses the built-in guard).
 *  3. Reseed the current OCSF-aligned built-ins.
 * No field_mapping row is dropped.
 */
export function migrateBuiltinCIMModelsToOCSF(): void {
  const db = getSQLiteDB();
  let migrated = false;

  // field_mappings.data_model is a FK to data_models.name. During the swap a row
  // may briefly point at a model that has been dropped but not yet reseeded, so
  // relax FK enforcement for the migration only (restored in finally).
  db.pragma('foreign_keys = OFF');
  try {
    for (const { legacyName, newName, fieldRenames } of LEGACY_MIGRATIONS) {
      // 1a. Rename known cim_fields on rows still pointing at the legacy model.
      for (const [oldField, newField] of Object.entries(fieldRenames)) {
        db.prepare('UPDATE field_mappings SET cim_field = ? WHERE data_model = ? AND cim_field = ?')
          .run(newField, legacyName, oldField);
      }
      // 1b. Move any remaining rows on the legacy model name onto the new model.
      if (legacyName !== newName) {
        db.prepare('UPDATE field_mappings SET data_model = ? WHERE data_model = ?').run(newName, legacyName);
      }

      // 2. Delete the stale built-in if it predates the realignment.
      const legacy = getDataModel(legacyName);
      if (legacy?.is_builtin) {
        const isStale =
          legacyName !== newName ||
          legacy.fields.some((f) => Object.prototype.hasOwnProperty.call(fieldRenames, f.name));
        if (isStale) {
          db.prepare('DELETE FROM data_models WHERE name = ? AND is_builtin = 1').run(legacyName);
          migrated = true;
        }
      }
    }

    // 3. Reseed the current OCSF-aligned built-ins (creates only what's missing).
    seedBuiltinCIMModels();
  } finally {
    db.pragma('foreign_keys = ON');
  }
  if (migrated) console.log('Migrated built-in CIM models to the ECS/OCSF taxonomy.');
}

/**
 * Seeds the built-in CIM data models into the database (idempotent).
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
