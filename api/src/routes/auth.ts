import { Router } from 'express';
import { z } from 'zod';
import {
  createUser,
  authenticateUser,
  refreshTokens,
  revokeRefreshTokens,
  getUserById,
  getUsers,
  getUserCount,
  updateUserPassword,
  updateUserRole,
  deactivateUser,
  activateUser,
  createApiKey,
  getApiKeys,
  revokeApiKey,
  deleteApiKey,
  logAuthEvent,
  getAuthAuditLog,
} from '../auth/auth.js';
import { authenticate, requireAdmin, requireRole, rateLimit } from '../auth/middleware.js';

const router = Router();

// Validation schemas
const registerSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

const loginSchema = z.object({
  username: z.string(), // Can be username or email
  password: z.string(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8).max(100),
});

const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  permissions: z.array(z.string()).optional(),
  expiresInDays: z.number().positive().optional(),
});

// Check if setup is needed (no users exist)
router.get('/setup-required', async (_req, res) => {
  try {
    const count = getUserCount();
    res.json({ setupRequired: count === 0 });
  } catch (error) {
    console.error('Setup check error:', error);
    res.status(500).json({ error: 'Failed to check setup status' });
  }
});

// Initial setup - create first admin user
router.post('/setup', rateLimit(5, 60000), async (req, res) => {
  try {
    const count = getUserCount();
    if (count > 0) {
      res.status(400).json({ error: 'Setup already complete' });
      return;
    }

    const data = registerSchema.parse(req.body);
    const user = await createUser(data.username, data.email, data.password, 'admin');

    logAuthEvent(user.id, 'initial_setup', req.ip, req.get('user-agent'));

    res.status(201).json({
      message: 'Admin account created successfully',
      user,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Setup error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Setup failed' });
  }
});

// Login
router.post('/login', rateLimit(10, 60000), async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);
    const result = await authenticateUser(data.username, data.password);

    if (!result) {
      logAuthEvent(null, 'login_failed', req.ip, req.get('user-agent'), {
        username: data.username,
      });
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    logAuthEvent(result.user.id, 'login_success', req.ip, req.get('user-agent'));

    res.json({
      user: result.user,
      ...result.tokens,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Refresh tokens
router.post('/refresh', rateLimit(30, 60000), async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token required' });
      return;
    }

    const tokens = await refreshTokens(refreshToken);

    if (!tokens) {
      res.status(401).json({ error: 'Invalid or expired refresh token' });
      return;
    }

    res.json(tokens);
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// Logout (revoke all refresh tokens)
router.post('/logout', authenticate, (req, res) => {
  try {
    revokeRefreshTokens(req.user!.id);
    logAuthEvent(req.user!.id, 'logout', req.ip, req.get('user-agent'));
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Get current user
router.get('/me', authenticate, (req, res) => {
  try {
    const user = getUserById(req.user!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Change password
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const data = changePasswordSchema.parse(req.body);

    // Verify current password
    const result = await authenticateUser(req.user!.username, data.currentPassword);
    if (!result) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    await updateUserPassword(req.user!.id, data.newPassword);

    // Revoke all refresh tokens (force re-login)
    revokeRefreshTokens(req.user!.id);

    logAuthEvent(req.user!.id, 'password_changed', req.ip, req.get('user-agent'));

    res.json({ message: 'Password changed successfully. Please log in again.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// ============ API Keys ============

// List API keys for current user
router.get('/api-keys', authenticate, (req, res) => {
  try {
    const keys = getApiKeys(req.user!.id);
    res.json(keys);
  } catch (error) {
    console.error('Get API keys error:', error);
    res.status(500).json({ error: 'Failed to get API keys' });
  }
});

// Create API key
router.post('/api-keys', authenticate, async (req, res) => {
  try {
    const data = createApiKeySchema.parse(req.body);
    const { apiKey, keyData } = await createApiKey(
      req.user!.id,
      data.name,
      data.permissions || ['read'],
      data.expiresInDays
    );

    logAuthEvent(req.user!.id, 'api_key_created', req.ip, req.get('user-agent'), {
      keyId: keyData.id,
      keyName: data.name,
    });

    res.status(201).json({
      apiKey, // Only returned once!
      keyData,
      warning: 'Store this API key securely. It will not be shown again.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Create API key error:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// Revoke API key
router.post('/api-keys/:id/revoke', authenticate, (req, res) => {
  try {
    const success = revokeApiKey(req.params.id, req.user!.id);
    if (!success) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    logAuthEvent(req.user!.id, 'api_key_revoked', req.ip, req.get('user-agent'), {
      keyId: req.params.id,
    });

    res.json({ message: 'API key revoked' });
  } catch (error) {
    console.error('Revoke API key error:', error);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

// Delete API key
router.delete('/api-keys/:id', authenticate, (req, res) => {
  try {
    const success = deleteApiKey(req.params.id, req.user!.id);
    if (!success) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    logAuthEvent(req.user!.id, 'api_key_deleted', req.ip, req.get('user-agent'), {
      keyId: req.params.id,
    });

    res.json({ message: 'API key deleted' });
  } catch (error) {
    console.error('Delete API key error:', error);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

// ============ Admin Routes ============

// List all users (admin only)
router.get('/users', authenticate, requireAdmin, (_req, res) => {
  try {
    const users = getUsers();
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Create user (admin only)
router.post('/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const data = registerSchema.extend({
      role: z.enum(['admin', 'user', 'readonly']).optional(),
    }).parse(req.body);

    const user = await createUser(data.username, data.email, data.password, data.role);

    logAuthEvent(req.user!.id, 'user_created', req.ip, req.get('user-agent'), {
      newUserId: user.id,
      newUsername: user.username,
    });

    res.status(201).json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Create user error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create user' });
  }
});

// Update user role (admin only)
router.patch('/users/:id/role', authenticate, requireAdmin, (req, res) => {
  try {
    const { role } = z.object({ role: z.enum(['admin', 'user', 'readonly']) }).parse(req.body);

    // Prevent self-demotion
    if (req.params.id === req.user!.id && role !== 'admin') {
      res.status(400).json({ error: 'Cannot demote yourself' });
      return;
    }

    updateUserRole(req.params.id, role);

    logAuthEvent(req.user!.id, 'role_changed', req.ip, req.get('user-agent'), {
      targetUserId: req.params.id,
      newRole: role,
    });

    res.json({ message: 'Role updated' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// Deactivate user (admin only)
router.post('/users/:id/deactivate', authenticate, requireAdmin, (req, res) => {
  try {
    // Prevent self-deactivation
    if (req.params.id === req.user!.id) {
      res.status(400).json({ error: 'Cannot deactivate yourself' });
      return;
    }

    deactivateUser(req.params.id);

    // Revoke their tokens
    revokeRefreshTokens(req.params.id);

    logAuthEvent(req.user!.id, 'user_deactivated', req.ip, req.get('user-agent'), {
      targetUserId: req.params.id,
    });

    res.json({ message: 'User deactivated' });
  } catch (error) {
    console.error('Deactivate user error:', error);
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

// Activate user (admin only)
router.post('/users/:id/activate', authenticate, requireAdmin, (req, res) => {
  try {
    activateUser(req.params.id);

    logAuthEvent(req.user!.id, 'user_activated', req.ip, req.get('user-agent'), {
      targetUserId: req.params.id,
    });

    res.json({ message: 'User activated' });
  } catch (error) {
    console.error('Activate user error:', error);
    res.status(500).json({ error: 'Failed to activate user' });
  }
});

// Get audit log (admin only)
router.get('/audit-log', authenticate, requireAdmin, (req, res) => {
  try {
    const userId = req.query.userId as string | undefined;
    const limit = parseInt(req.query.limit as string) || 100;

    const logs = getAuthAuditLog(userId, limit);
    res.json(logs);
  } catch (error) {
    console.error('Get audit log error:', error);
    res.status(500).json({ error: 'Failed to get audit log' });
  }
});

export default router;
