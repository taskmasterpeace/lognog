import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getSQLiteDB } from '../db/sqlite.js';

// Environment configuration
const JWT_SECRET = process.env.JWT_SECRET || 'lognog-dev-secret-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'lognog-refresh-secret-change-in-production';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const SALT_ROUNDS = 12;

// Types
export interface User {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  role: 'admin' | 'user' | 'readonly';
  is_active: number;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserPublic {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user' | 'readonly';
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

export interface ApiKey {
  id: string;
  user_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  permissions: string;
  last_used: string | null;
  expires_at: string | null;
  is_active: number;
  created_at: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JwtPayload {
  userId: string;
  username: string;
  role: string;
  type: 'access' | 'refresh';
}

// Initialize auth tables
export function initializeAuthSchema(): void {
  const db = getSQLiteDB();

  db.exec(`
    -- Enhanced users table (drop and recreate if needed for new fields)
    CREATE TABLE IF NOT EXISTS users_v2 (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user', 'readonly')),
      is_active INTEGER DEFAULT 1,
      last_login TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- API keys for agents and integrations
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      permissions TEXT DEFAULT '["read"]',
      last_used TEXT,
      expires_at TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users_v2(id) ON DELETE CASCADE
    );

    -- Refresh tokens (for token rotation)
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users_v2(id) ON DELETE CASCADE
    );

    -- Audit log for authentication events
    CREATE TABLE IF NOT EXISTS auth_audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      event_type TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_users_v2_username ON users_v2(username);
    CREATE INDEX IF NOT EXISTS idx_users_v2_email ON users_v2(email);
    CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
    CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_auth_audit_user ON auth_audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_auth_audit_created ON auth_audit_log(created_at);
  `);
}

// User management
export async function createUser(
  username: string,
  email: string,
  password: string,
  role: 'admin' | 'user' | 'readonly' = 'user'
): Promise<UserPublic> {
  const db = getSQLiteDB();

  // Check if username or email already exists
  const existing = db.prepare(
    'SELECT id FROM users_v2 WHERE username = ? OR email = ?'
  ).get(username, email);

  if (existing) {
    throw new Error('Username or email already exists');
  }

  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  db.prepare(`
    INSERT INTO users_v2 (id, username, email, password_hash, role)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, username, email, passwordHash, role);

  return getUserById(id)!;
}

export function getUserById(id: string): UserPublic | undefined {
  const db = getSQLiteDB();
  const user = db.prepare(
    'SELECT id, username, email, role, is_active, last_login, created_at FROM users_v2 WHERE id = ?'
  ).get(id) as User | undefined;

  if (!user) return undefined;

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    is_active: user.is_active === 1,
    last_login: user.last_login,
    created_at: user.created_at,
  };
}

export function getUserByUsername(username: string): User | undefined {
  const db = getSQLiteDB();
  return db.prepare('SELECT * FROM users_v2 WHERE username = ?').get(username) as User | undefined;
}

export function getUserByEmail(email: string): User | undefined {
  const db = getSQLiteDB();
  return db.prepare('SELECT * FROM users_v2 WHERE email = ?').get(email) as User | undefined;
}

export function getUsers(): UserPublic[] {
  const db = getSQLiteDB();
  const users = db.prepare(
    'SELECT id, username, email, role, is_active, last_login, created_at FROM users_v2 ORDER BY created_at DESC'
  ).all() as User[];

  return users.map(u => ({
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    is_active: u.is_active === 1,
    last_login: u.last_login,
    created_at: u.created_at,
  }));
}

export function getUserCount(): number {
  const db = getSQLiteDB();
  const result = db.prepare('SELECT COUNT(*) as count FROM users_v2').get() as { count: number };
  return result.count;
}

export async function updateUserPassword(userId: string, newPassword: string): Promise<void> {
  const db = getSQLiteDB();
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  db.prepare(`
    UPDATE users_v2 SET password_hash = ?, updated_at = datetime('now') WHERE id = ?
  `).run(passwordHash, userId);
}

export function updateUserRole(userId: string, role: 'admin' | 'user' | 'readonly'): void {
  const db = getSQLiteDB();
  db.prepare(`
    UPDATE users_v2 SET role = ?, updated_at = datetime('now') WHERE id = ?
  `).run(role, userId);
}

export function deactivateUser(userId: string): void {
  const db = getSQLiteDB();
  db.prepare(`
    UPDATE users_v2 SET is_active = 0, updated_at = datetime('now') WHERE id = ?
  `).run(userId);
}

export function activateUser(userId: string): void {
  const db = getSQLiteDB();
  db.prepare(`
    UPDATE users_v2 SET is_active = 1, updated_at = datetime('now') WHERE id = ?
  `).run(userId);
}

function updateLastLogin(userId: string): void {
  const db = getSQLiteDB();
  db.prepare(`
    UPDATE users_v2 SET last_login = datetime('now') WHERE id = ?
  `).run(userId);
}

// Authentication
export async function authenticateUser(
  usernameOrEmail: string,
  password: string
): Promise<{ user: UserPublic; tokens: TokenPair } | null> {
  const user = usernameOrEmail.includes('@')
    ? getUserByEmail(usernameOrEmail)
    : getUserByUsername(usernameOrEmail);

  if (!user || user.is_active !== 1) {
    return null;
  }

  const passwordValid = await bcrypt.compare(password, user.password_hash);
  if (!passwordValid) {
    return null;
  }

  updateLastLogin(user.id);
  const tokens = await generateTokenPair(user);

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      is_active: true,
      last_login: new Date().toISOString(),
      created_at: user.created_at,
    },
    tokens,
  };
}

// Token management
export async function generateTokenPair(user: User | UserPublic): Promise<TokenPair> {
  const accessPayload: JwtPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    type: 'access',
  };

  const refreshPayload: JwtPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    type: 'refresh',
  };

  const accessToken = jwt.sign(accessPayload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });

  const refreshToken = jwt.sign(refreshPayload, JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
  });

  // Store refresh token hash
  const db = getSQLiteDB();
  const tokenHash = await bcrypt.hash(refreshToken, 10);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(uuidv4(), user.id, tokenHash, expiresAt);

  // Clean up old refresh tokens for this user (keep last 5)
  db.prepare(`
    DELETE FROM refresh_tokens
    WHERE user_id = ? AND id NOT IN (
      SELECT id FROM refresh_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 5
    )
  `).run(user.id, user.id);

  return {
    accessToken,
    refreshToken,
    expiresIn: 15 * 60, // 15 minutes in seconds
  };
}

export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    if (payload.type !== 'access') return null;
    return payload;
  } catch {
    return null;
  }
}

export async function refreshTokens(refreshToken: string): Promise<TokenPair | null> {
  try {
    const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as JwtPayload;
    if (payload.type !== 'refresh') return null;

    const user = getUserById(payload.userId);
    if (!user || !user.is_active) return null;

    // Verify refresh token exists in database
    const db = getSQLiteDB();
    const storedTokens = db.prepare(
      'SELECT * FROM refresh_tokens WHERE user_id = ? AND expires_at > datetime("now")'
    ).all(payload.userId) as { token_hash: string; id: string }[];

    let validToken = false;
    let tokenId = '';
    for (const stored of storedTokens) {
      if (await bcrypt.compare(refreshToken, stored.token_hash)) {
        validToken = true;
        tokenId = stored.id;
        break;
      }
    }

    if (!validToken) return null;

    // Delete used refresh token (rotation)
    db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(tokenId);

    // Generate new token pair
    return generateTokenPair(user as unknown as User);
  } catch {
    return null;
  }
}

export function revokeRefreshTokens(userId: string): void {
  const db = getSQLiteDB();
  db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId);
}

// API Key management
export async function createApiKey(
  userId: string,
  name: string,
  permissions: string[] = ['read'],
  expiresInDays?: number
): Promise<{ apiKey: string; keyData: Omit<ApiKey, 'key_hash'> }> {
  const db = getSQLiteDB();

  // Generate a secure API key
  const keyId = uuidv4().replace(/-/g, '');
  const keySecret = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
  const apiKey = `lnog_${keyId}_${keySecret}`;
  const keyPrefix = `lnog_${keyId.slice(0, 8)}`;

  const keyHash = await bcrypt.hash(apiKey, SALT_ROUNDS);
  const id = uuidv4();
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  db.prepare(`
    INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, permissions, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, name, keyHash, keyPrefix, JSON.stringify(permissions), expiresAt);

  const keyData = db.prepare(
    'SELECT id, user_id, name, key_prefix, permissions, last_used, expires_at, is_active, created_at FROM api_keys WHERE id = ?'
  ).get(id) as Omit<ApiKey, 'key_hash'>;

  return { apiKey, keyData };
}

export async function validateApiKey(apiKey: string): Promise<{ userId: string; permissions: string[] } | null> {
  if (!apiKey.startsWith('lnog_')) return null;

  const db = getSQLiteDB();
  const prefix = apiKey.split('_').slice(0, 2).join('_').slice(0, 13);

  // Find keys with matching prefix
  const keys = db.prepare(`
    SELECT * FROM api_keys
    WHERE key_prefix LIKE ? || '%'
    AND is_active = 1
    AND (expires_at IS NULL OR expires_at > datetime('now'))
  `).all(prefix) as ApiKey[];

  for (const key of keys) {
    if (await bcrypt.compare(apiKey, key.key_hash)) {
      // Update last used
      db.prepare(`
        UPDATE api_keys SET last_used = datetime('now') WHERE id = ?
      `).run(key.id);

      return {
        userId: key.user_id,
        permissions: JSON.parse(key.permissions),
      };
    }
  }

  return null;
}

export function getApiKeys(userId: string): Omit<ApiKey, 'key_hash'>[] {
  const db = getSQLiteDB();
  return db.prepare(`
    SELECT id, user_id, name, key_prefix, permissions, last_used, expires_at, is_active, created_at
    FROM api_keys WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId) as Omit<ApiKey, 'key_hash'>[];
}

export function revokeApiKey(keyId: string, userId: string): boolean {
  const db = getSQLiteDB();
  const result = db.prepare(
    'UPDATE api_keys SET is_active = 0 WHERE id = ? AND user_id = ?'
  ).run(keyId, userId);
  return result.changes > 0;
}

export function deleteApiKey(keyId: string, userId: string): boolean {
  const db = getSQLiteDB();
  const result = db.prepare(
    'DELETE FROM api_keys WHERE id = ? AND user_id = ?'
  ).run(keyId, userId);
  return result.changes > 0;
}

// Audit logging
export function logAuthEvent(
  userId: string | null,
  eventType: string,
  ipAddress?: string,
  userAgent?: string,
  details?: Record<string, unknown>
): void {
  const db = getSQLiteDB();
  db.prepare(`
    INSERT INTO auth_audit_log (id, user_id, event_type, ip_address, user_agent, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    uuidv4(),
    userId,
    eventType,
    ipAddress || null,
    userAgent || null,
    details ? JSON.stringify(details) : null
  );
}

export function getAuthAuditLog(
  userId?: string,
  limit: number = 100
): Array<{
  id: string;
  user_id: string | null;
  event_type: string;
  ip_address: string | null;
  user_agent: string | null;
  details: string | null;
  created_at: string;
}> {
  const db = getSQLiteDB();
  if (userId) {
    return db.prepare(`
      SELECT * FROM auth_audit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
    `).all(userId, limit) as Array<{
      id: string;
      user_id: string | null;
      event_type: string;
      ip_address: string | null;
      user_agent: string | null;
      details: string | null;
      created_at: string;
    }>;
  }
  return db.prepare(`
    SELECT * FROM auth_audit_log ORDER BY created_at DESC LIMIT ?
  `).all(limit) as Array<{
    id: string;
    user_id: string | null;
    event_type: string;
    ip_address: string | null;
    user_agent: string | null;
    details: string | null;
    created_at: string;
  }>;
}

// Initialize on import
initializeAuthSchema();
