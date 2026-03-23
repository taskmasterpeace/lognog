import { v4 as uuidv4 } from 'uuid';
import { getSQLiteDB } from './sqlite.js';

// ============ Assets ============

export type AssetType = 'server' | 'workstation' | 'network_device' | 'container' | 'cloud_instance' | 'other';
export type AssetStatus = 'active' | 'inactive' | 'decommissioned';

export interface Asset {
  id: string;
  asset_type: AssetType;
  identifier: string;
  display_name: string | null;
  description: string | null;
  criticality: number;
  owner: string | null;
  department: string | null;
  location: string | null;
  tags: string[];
  attributes: Record<string, unknown>;
  first_seen: string | null;
  last_seen: string | null;
  status: AssetStatus;
  source: 'auto' | 'manual';
  created_at: string;
  updated_at: string;
}

export interface AssetInput {
  asset_type: AssetType;
  identifier: string;
  display_name?: string;
  description?: string;
  criticality?: number;
  owner?: string;
  department?: string;
  location?: string;
  tags?: string[];
  attributes?: Record<string, unknown>;
  status?: AssetStatus;
}

interface AssetRow {
  id: string;
  asset_type: string;
  identifier: string;
  display_name: string | null;
  description: string | null;
  criticality: number;
  owner: string | null;
  department: string | null;
  location: string | null;
  tags: string;
  attributes: string;
  first_seen: string | null;
  last_seen: string | null;
  status: string;
  source: string;
  created_at: string;
  updated_at: string;
}

function rowToAsset(row: AssetRow): Asset {
  return {
    ...row,
    asset_type: row.asset_type as AssetType,
    status: row.status as AssetStatus,
    source: row.source as 'auto' | 'manual',
    tags: JSON.parse(row.tags || '[]'),
    attributes: JSON.parse(row.attributes || '{}'),
  };
}

export function getAssets(options?: {
  asset_type?: AssetType;
  status?: AssetStatus;
  search?: string;
  limit?: number;
  offset?: number;
}): Asset[] {
  const database = getSQLiteDB();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options?.asset_type) {
    conditions.push('asset_type = ?');
    params.push(options.asset_type);
  }
  if (options?.status) {
    conditions.push('status = ?');
    params.push(options.status);
  }
  if (options?.search) {
    conditions.push('(identifier LIKE ? OR display_name LIKE ? OR description LIKE ?)');
    const searchTerm = `%${options.search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options?.limit || 100;
  const offset = options?.offset || 0;

  const rows = database.prepare(`
    SELECT * FROM assets ${whereClause}
    ORDER BY last_seen DESC NULLS LAST, identifier ASC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as AssetRow[];

  return rows.map(rowToAsset);
}

export function getAssetById(id: string): Asset | null {
  const database = getSQLiteDB();
  const row = database.prepare('SELECT * FROM assets WHERE id = ?').get(id) as AssetRow | undefined;
  return row ? rowToAsset(row) : null;
}

export function getAssetByIdentifier(asset_type: AssetType, identifier: string): Asset | null {
  const database = getSQLiteDB();
  const row = database.prepare(
    'SELECT * FROM assets WHERE asset_type = ? AND identifier = ?'
  ).get(asset_type, identifier) as AssetRow | undefined;
  return row ? rowToAsset(row) : null;
}

export function createAsset(input: AssetInput): Asset {
  const database = getSQLiteDB();
  const id = uuidv4();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO assets (id, asset_type, identifier, display_name, description, criticality, owner, department, location, tags, attributes, first_seen, last_seen, status, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)
  `).run(
    id,
    input.asset_type,
    input.identifier,
    input.display_name || null,
    input.description || null,
    input.criticality ?? 50,
    input.owner || null,
    input.department || null,
    input.location || null,
    JSON.stringify(input.tags || []),
    JSON.stringify(input.attributes || {}),
    now,
    now,
    input.status || 'active',
    now,
    now
  );

  return getAssetById(id)!;
}

export function updateAsset(id: string, input: Partial<AssetInput>): Asset | null {
  const database = getSQLiteDB();
  const existing = getAssetById(id);
  if (!existing) return null;

  const updates: string[] = [];
  const params: unknown[] = [];

  if (input.asset_type !== undefined) { updates.push('asset_type = ?'); params.push(input.asset_type); }
  if (input.identifier !== undefined) { updates.push('identifier = ?'); params.push(input.identifier); }
  if (input.display_name !== undefined) { updates.push('display_name = ?'); params.push(input.display_name); }
  if (input.description !== undefined) { updates.push('description = ?'); params.push(input.description); }
  if (input.criticality !== undefined) { updates.push('criticality = ?'); params.push(input.criticality); }
  if (input.owner !== undefined) { updates.push('owner = ?'); params.push(input.owner); }
  if (input.department !== undefined) { updates.push('department = ?'); params.push(input.department); }
  if (input.location !== undefined) { updates.push('location = ?'); params.push(input.location); }
  if (input.tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(input.tags)); }
  if (input.attributes !== undefined) { updates.push('attributes = ?'); params.push(JSON.stringify(input.attributes)); }
  if (input.status !== undefined) { updates.push('status = ?'); params.push(input.status); }

  if (updates.length === 0) return existing;

  updates.push("updated_at = datetime('now')");
  params.push(id);

  database.prepare(`UPDATE assets SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return getAssetById(id);
}

export function deleteAsset(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM assets WHERE id = ?').run(id);
  return result.changes > 0;
}

export function upsertAssetFromDiscovery(
  asset_type: AssetType,
  identifier: string,
  timestamp: string
): Asset {
  const database = getSQLiteDB();
  const existing = getAssetByIdentifier(asset_type, identifier);

  if (existing) {
    // Update last_seen
    database.prepare(`
      UPDATE assets SET last_seen = ?, updated_at = datetime('now') WHERE id = ?
    `).run(timestamp, existing.id);
    return getAssetById(existing.id)!;
  }

  // Create new auto-discovered asset
  const id = uuidv4();
  database.prepare(`
    INSERT INTO assets (id, asset_type, identifier, criticality, tags, attributes, first_seen, last_seen, status, source, created_at, updated_at)
    VALUES (?, ?, ?, 50, '[]', '{}', ?, ?, 'active', 'auto', datetime('now'), datetime('now'))
  `).run(id, asset_type, identifier, timestamp, timestamp);

  return getAssetById(id)!;
}

export function getAssetStats(): { total: number; by_type: Record<string, number>; by_status: Record<string, number> } {
  const database = getSQLiteDB();

  const total = (database.prepare('SELECT COUNT(*) as count FROM assets').get() as { count: number }).count;

  const byType = database.prepare('SELECT asset_type, COUNT(*) as count FROM assets GROUP BY asset_type').all() as Array<{ asset_type: string; count: number }>;
  const by_type: Record<string, number> = {};
  for (const row of byType) {
    by_type[row.asset_type] = row.count;
  }

  const byStatus = database.prepare('SELECT status, COUNT(*) as count FROM assets GROUP BY status').all() as Array<{ status: string; count: number }>;
  const by_status: Record<string, number> = {};
  for (const row of byStatus) {
    by_status[row.status] = row.count;
  }

  return { total, by_type, by_status };
}

// ============ Identities ============

export type IdentityType = 'user' | 'service_account' | 'system' | 'external';
export type IdentityStatus = 'active' | 'inactive' | 'disabled';

export interface Identity {
  id: string;
  identity_type: IdentityType;
  identifier: string;
  display_name: string | null;
  email: string | null;
  department: string | null;
  title: string | null;
  manager: string | null;
  is_privileged: boolean;
  risk_score: number;
  tags: string[];
  attributes: Record<string, unknown>;
  first_seen: string | null;
  last_seen: string | null;
  status: IdentityStatus;
  source: 'auto' | 'manual';
  created_at: string;
  updated_at: string;
}

export interface IdentityInput {
  identity_type: IdentityType;
  identifier: string;
  display_name?: string;
  email?: string;
  department?: string;
  title?: string;
  manager?: string;
  is_privileged?: boolean;
  risk_score?: number;
  tags?: string[];
  attributes?: Record<string, unknown>;
  status?: IdentityStatus;
}

interface IdentityRow {
  id: string;
  identity_type: string;
  identifier: string;
  display_name: string | null;
  email: string | null;
  department: string | null;
  title: string | null;
  manager: string | null;
  is_privileged: number;
  risk_score: number;
  tags: string;
  attributes: string;
  first_seen: string | null;
  last_seen: string | null;
  status: string;
  source: string;
  created_at: string;
  updated_at: string;
}

function rowToIdentity(row: IdentityRow): Identity {
  return {
    ...row,
    identity_type: row.identity_type as IdentityType,
    status: row.status as IdentityStatus,
    source: row.source as 'auto' | 'manual',
    is_privileged: row.is_privileged === 1,
    tags: JSON.parse(row.tags || '[]'),
    attributes: JSON.parse(row.attributes || '{}'),
  };
}

export function getIdentities(options?: {
  identity_type?: IdentityType;
  status?: IdentityStatus;
  is_privileged?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}): Identity[] {
  const database = getSQLiteDB();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options?.identity_type) {
    conditions.push('identity_type = ?');
    params.push(options.identity_type);
  }
  if (options?.status) {
    conditions.push('status = ?');
    params.push(options.status);
  }
  if (options?.is_privileged !== undefined) {
    conditions.push('is_privileged = ?');
    params.push(options.is_privileged ? 1 : 0);
  }
  if (options?.search) {
    conditions.push('(identifier LIKE ? OR display_name LIKE ? OR email LIKE ?)');
    const searchTerm = `%${options.search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options?.limit || 100;
  const offset = options?.offset || 0;

  const rows = database.prepare(`
    SELECT * FROM identities ${whereClause}
    ORDER BY last_seen DESC NULLS LAST, identifier ASC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as IdentityRow[];

  return rows.map(rowToIdentity);
}

export function getIdentityById(id: string): Identity | null {
  const database = getSQLiteDB();
  const row = database.prepare('SELECT * FROM identities WHERE id = ?').get(id) as IdentityRow | undefined;
  return row ? rowToIdentity(row) : null;
}

export function getIdentityByIdentifier(identity_type: IdentityType, identifier: string): Identity | null {
  const database = getSQLiteDB();
  const row = database.prepare(
    'SELECT * FROM identities WHERE identity_type = ? AND identifier = ?'
  ).get(identity_type, identifier) as IdentityRow | undefined;
  return row ? rowToIdentity(row) : null;
}

export function createIdentity(input: IdentityInput): Identity {
  const database = getSQLiteDB();
  const id = uuidv4();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO identities (id, identity_type, identifier, display_name, email, department, title, manager, is_privileged, risk_score, tags, attributes, first_seen, last_seen, status, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)
  `).run(
    id,
    input.identity_type,
    input.identifier,
    input.display_name || null,
    input.email || null,
    input.department || null,
    input.title || null,
    input.manager || null,
    input.is_privileged ? 1 : 0,
    input.risk_score ?? 0,
    JSON.stringify(input.tags || []),
    JSON.stringify(input.attributes || {}),
    now,
    now,
    input.status || 'active',
    now,
    now
  );

  return getIdentityById(id)!;
}

export function updateIdentity(id: string, input: Partial<IdentityInput>): Identity | null {
  const database = getSQLiteDB();
  const existing = getIdentityById(id);
  if (!existing) return null;

  const updates: string[] = [];
  const params: unknown[] = [];

  if (input.identity_type !== undefined) { updates.push('identity_type = ?'); params.push(input.identity_type); }
  if (input.identifier !== undefined) { updates.push('identifier = ?'); params.push(input.identifier); }
  if (input.display_name !== undefined) { updates.push('display_name = ?'); params.push(input.display_name); }
  if (input.email !== undefined) { updates.push('email = ?'); params.push(input.email); }
  if (input.department !== undefined) { updates.push('department = ?'); params.push(input.department); }
  if (input.title !== undefined) { updates.push('title = ?'); params.push(input.title); }
  if (input.manager !== undefined) { updates.push('manager = ?'); params.push(input.manager); }
  if (input.is_privileged !== undefined) { updates.push('is_privileged = ?'); params.push(input.is_privileged ? 1 : 0); }
  if (input.risk_score !== undefined) { updates.push('risk_score = ?'); params.push(input.risk_score); }
  if (input.tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(input.tags)); }
  if (input.attributes !== undefined) { updates.push('attributes = ?'); params.push(JSON.stringify(input.attributes)); }
  if (input.status !== undefined) { updates.push('status = ?'); params.push(input.status); }

  if (updates.length === 0) return existing;

  updates.push("updated_at = datetime('now')");
  params.push(id);

  database.prepare(`UPDATE identities SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return getIdentityById(id);
}

export function deleteIdentity(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM identities WHERE id = ?').run(id);
  return result.changes > 0;
}

export function upsertIdentityFromDiscovery(
  identity_type: IdentityType,
  identifier: string,
  timestamp: string,
  is_privileged?: boolean
): Identity {
  const database = getSQLiteDB();
  const existing = getIdentityByIdentifier(identity_type, identifier);

  if (existing) {
    // Update last_seen and potentially privileged status
    if (is_privileged !== undefined && is_privileged && !existing.is_privileged) {
      database.prepare(`
        UPDATE identities SET last_seen = ?, is_privileged = 1, updated_at = datetime('now') WHERE id = ?
      `).run(timestamp, existing.id);
    } else {
      database.prepare(`
        UPDATE identities SET last_seen = ?, updated_at = datetime('now') WHERE id = ?
      `).run(timestamp, existing.id);
    }
    return getIdentityById(existing.id)!;
  }

  // Create new auto-discovered identity
  const id = uuidv4();
  database.prepare(`
    INSERT INTO identities (id, identity_type, identifier, is_privileged, risk_score, tags, attributes, first_seen, last_seen, status, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, '[]', '{}', ?, ?, 'active', 'auto', datetime('now'), datetime('now'))
  `).run(id, identity_type, identifier, is_privileged ? 1 : 0, timestamp, timestamp);

  return getIdentityById(id)!;
}

export function getIdentityStats(): { total: number; by_type: Record<string, number>; privileged_count: number } {
  const database = getSQLiteDB();

  const total = (database.prepare('SELECT COUNT(*) as count FROM identities').get() as { count: number }).count;
  const privileged_count = (database.prepare('SELECT COUNT(*) as count FROM identities WHERE is_privileged = 1').get() as { count: number }).count;

  const byType = database.prepare('SELECT identity_type, COUNT(*) as count FROM identities GROUP BY identity_type').all() as Array<{ identity_type: string; count: number }>;
  const by_type: Record<string, number> = {};
  for (const row of byType) {
    by_type[row.identity_type] = row.count;
  }

  return { total, by_type, privileged_count };
}

// ============ Asset-Identity Links ============

export interface AssetIdentityLink {
  id: string;
  asset_id: string;
  identity_id: string;
  relationship_type: string;
  first_seen: string | null;
  last_seen: string | null;
  event_count: number;
  created_at: string;
}

export function linkAssetIdentity(
  asset_id: string,
  identity_id: string,
  relationship_type: string = 'user',
  timestamp?: string
): AssetIdentityLink | null {
  const database = getSQLiteDB();
  const now = timestamp || new Date().toISOString();

  // Try to update existing link
  const existing = database.prepare(`
    SELECT * FROM asset_identity_links
    WHERE asset_id = ? AND identity_id = ? AND relationship_type = ?
  `).get(asset_id, identity_id, relationship_type) as AssetIdentityLink | undefined;

  if (existing) {
    database.prepare(`
      UPDATE asset_identity_links
      SET last_seen = ?, event_count = event_count + 1
      WHERE id = ?
    `).run(now, existing.id);
    return database.prepare('SELECT * FROM asset_identity_links WHERE id = ?').get(existing.id) as AssetIdentityLink;
  }

  // Create new link
  const id = uuidv4();
  database.prepare(`
    INSERT INTO asset_identity_links (id, asset_id, identity_id, relationship_type, first_seen, last_seen, event_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
  `).run(id, asset_id, identity_id, relationship_type, now, now);

  return database.prepare('SELECT * FROM asset_identity_links WHERE id = ?').get(id) as AssetIdentityLink;
}

export function getAssetIdentities(asset_id: string): Array<Identity & { relationship_type: string; event_count: number }> {
  const database = getSQLiteDB();
  const rows = database.prepare(`
    SELECT i.*, ail.relationship_type, ail.event_count
    FROM identities i
    JOIN asset_identity_links ail ON i.id = ail.identity_id
    WHERE ail.asset_id = ?
    ORDER BY ail.event_count DESC
  `).all(asset_id) as Array<IdentityRow & { relationship_type: string; event_count: number }>;

  return rows.map(row => ({
    ...rowToIdentity(row),
    relationship_type: row.relationship_type,
    event_count: row.event_count,
  }));
}

export function getIdentityAssets(identity_id: string): Array<Asset & { relationship_type: string; event_count: number }> {
  const database = getSQLiteDB();
  const rows = database.prepare(`
    SELECT a.*, ail.relationship_type, ail.event_count
    FROM assets a
    JOIN asset_identity_links ail ON a.id = ail.asset_id
    WHERE ail.identity_id = ?
    ORDER BY ail.event_count DESC
  `).all(identity_id) as Array<AssetRow & { relationship_type: string; event_count: number }>;

  return rows.map(row => ({
    ...rowToAsset(row),
    relationship_type: row.relationship_type,
    event_count: row.event_count,
  }));
}
