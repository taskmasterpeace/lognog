import { Router, Request, Response } from 'express';
import { authenticate, requireAdmin } from '../auth/middleware.js';
import {
  getUserPreferences,
  upsertUserPreferences,
  getAllSystemSettings,
  setSystemSettings,
  getSystemSetting,
  setSystemSetting,
  getMutedValues,
  setMutedValues,
  MutedValues,
} from '../db/sqlite';

const router = Router();

// ============ User Preferences ============

// GET /api/settings/preferences - Get current user's preferences
router.get('/preferences', authenticate, (req: Request, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const prefs = getUserPreferences(userId);

  // Return defaults if no preferences exist
  if (!prefs) {
    return res.json({
      theme: 'system',
      default_time_range: '-24h',
      sidebar_open: true,
      default_view_mode: 'log',
      query_history_limit: 10,
      date_format: '12-hour',
      timezone: 'browser',
    });
  }

  return res.json({
    theme: prefs.theme,
    default_time_range: prefs.default_time_range,
    sidebar_open: prefs.sidebar_open === 1,
    default_view_mode: prefs.default_view_mode,
    query_history_limit: prefs.query_history_limit,
    date_format: prefs.date_format || '12-hour',
    timezone: prefs.timezone || 'browser',
  });
});

// PUT /api/settings/preferences - Update current user's preferences
router.put('/preferences', authenticate, (req: Request, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { theme, default_time_range, sidebar_open, default_view_mode, query_history_limit, date_format, timezone } = req.body;

  // Validate inputs
  if (theme && !['light', 'dark', 'system'].includes(theme)) {
    return res.status(400).json({ error: 'Invalid theme. Must be light, dark, or system' });
  }

  if (default_view_mode && !['log', 'table', 'json'].includes(default_view_mode)) {
    return res.status(400).json({ error: 'Invalid view mode. Must be log, table, or json' });
  }

  if (query_history_limit !== undefined && (query_history_limit < 1 || query_history_limit > 100)) {
    return res.status(400).json({ error: 'Query history limit must be between 1 and 100' });
  }

  if (date_format && !['12-hour', '24-hour', 'day-of-week', 'iso', 'short'].includes(date_format)) {
    return res.status(400).json({ error: 'Invalid date format. Must be 12-hour, 24-hour, day-of-week, iso, or short' });
  }

  // Validate timezone if provided (must be 'browser' or a valid IANA timezone)
  if (timezone && timezone !== 'browser') {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
      return res.status(400).json({ error: 'Invalid timezone' });
    }
  }

  const prefs = upsertUserPreferences(userId, {
    theme,
    default_time_range,
    sidebar_open: sidebar_open === undefined ? undefined : (sidebar_open ? 1 : 0),
    default_view_mode,
    query_history_limit,
    date_format,
    timezone,
  });

  return res.json({
    theme: prefs.theme,
    default_time_range: prefs.default_time_range,
    sidebar_open: prefs.sidebar_open === 1,
    default_view_mode: prefs.default_view_mode,
    query_history_limit: prefs.query_history_limit,
    date_format: prefs.date_format || '12-hour',
    timezone: prefs.timezone || 'browser',
  });
});

// ============ Muted Values ============

// GET /api/settings/muted - Get current user's muted values
router.get('/muted', authenticate, (req: Request, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const mutedValues = getMutedValues(userId);
  return res.json(mutedValues);
});

// PUT /api/settings/muted - Update current user's muted values
router.put('/muted', authenticate, (req: Request, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { app_name, index_name, hostname } = req.body as Partial<MutedValues>;

  // Validate that all fields are arrays of strings
  const isValidArray = (arr: unknown): arr is string[] =>
    Array.isArray(arr) && arr.every((item) => typeof item === 'string');

  const mutedValues: MutedValues = {
    app_name: isValidArray(app_name) ? app_name : [],
    index_name: isValidArray(index_name) ? index_name : [],
    hostname: isValidArray(hostname) ? hostname : [],
  };

  const updated = setMutedValues(userId, mutedValues);
  return res.json(updated);
});

// ============ System Settings (Admin only) ============

// GET /api/settings/system - Get system settings (admin only)
router.get('/system', authenticate, requireAdmin, (_req: Request, res: Response) => {
  const settings = getAllSystemSettings();

  // Mask sensitive values
  const safeSettings = { ...settings };
  if (safeSettings['ai_openrouter_api_key']) {
    const key = safeSettings['ai_openrouter_api_key'];
    safeSettings['ai_openrouter_api_key'] = key.length > 8 ? key.slice(0, 4) + '****' + key.slice(-4) : '****';
  }

  return res.json({
    settings: safeSettings,
    defaults: {
      data_retention_days: '90',
      ai_ollama_url: process.env.OLLAMA_URL || 'http://localhost:11434',
      ai_ollama_model: process.env.OLLAMA_MODEL || 'llama3.2',
      // Internal logging defaults - OFF by default to reduce noise
      internal_logging_enabled: 'false',
      internal_logging_level: 'WARNING',  // Only log warnings and errors
      internal_logging_categories: 'auth,alert,system',  // Only important categories
    },
  });
});

// PUT /api/settings/system - Update system settings (admin only)
router.put('/system', authenticate, requireAdmin, (req: Request, res: Response) => {
  const { settings } = req.body;

  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'Settings object required' });
  }

  // Whitelist allowed settings
  const allowedKeys = [
    'ai_ollama_url',
    'ai_ollama_model',
    'ai_ollama_reasoning_model',
    'ai_ollama_embed_model',
    'ai_openrouter_api_key',
    'ai_openrouter_model',
    // Internal logging settings
    'internal_logging_enabled',
    'internal_logging_level',
    'internal_logging_categories',
  ];

  const filteredSettings: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (allowedKeys.includes(key) && typeof value === 'string') {
      filteredSettings[key] = value;
    }
  }

  if (Object.keys(filteredSettings).length === 0) {
    return res.status(400).json({ error: 'No valid settings provided' });
  }

  setSystemSettings(filteredSettings);

  return res.json({ success: true, updated: Object.keys(filteredSettings) });
});

// GET /api/settings/system/stats - Get system statistics (admin only)
router.get('/system/stats', authenticate, requireAdmin, async (_req: Request, res: Response) => {
  try {
    // Get basic stats - this is a placeholder, real implementation would query ClickHouse
    const stats = {
      api_version: '1.0.0',
      node_version: process.version,
      uptime_seconds: Math.floor(process.uptime()),
      memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    };

    return res.json(stats);
  } catch (error) {
    console.error('Failed to get system stats:', error);
    return res.status(500).json({ error: 'Failed to get system stats' });
  }
});

// ============ AI Settings ============

// GET /api/settings/ai - Get AI configuration
router.get('/ai', authenticate, requireAdmin, (_req: Request, res: Response) => {
  const ollamaUrl = getSystemSetting('ai_ollama_url') || process.env.OLLAMA_URL || 'http://localhost:11434';
  const ollamaModel = getSystemSetting('ai_ollama_model') || process.env.OLLAMA_MODEL || 'llama3.2';
  const ollamaReasoningModel = getSystemSetting('ai_ollama_reasoning_model') || process.env.OLLAMA_REASONING_MODEL || '';
  const ollamaEmbedModel = getSystemSetting('ai_ollama_embed_model') || process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
  const openrouterApiKey = getSystemSetting('ai_openrouter_api_key') || process.env.OPENROUTER_API_KEY || '';
  const openrouterModel = getSystemSetting('ai_openrouter_model') || process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';

  return res.json({
    ollama: {
      url: ollamaUrl,
      model: ollamaModel,
      reasoning_model: ollamaReasoningModel,
      embed_model: ollamaEmbedModel,
    },
    openrouter: {
      api_key_set: !!openrouterApiKey,
      api_key_masked: openrouterApiKey ? openrouterApiKey.slice(0, 4) + '****' : '',
      model: openrouterModel,
    },
  });
});

// PUT /api/settings/ai - Update AI configuration (admin only)
router.put('/ai', authenticate, requireAdmin, (req: Request, res: Response) => {
  const { ollama, openrouter } = req.body;

  const updates: Record<string, string> = {};

  if (ollama) {
    if (ollama.url) updates['ai_ollama_url'] = ollama.url;
    if (ollama.model) updates['ai_ollama_model'] = ollama.model;
    if (ollama.reasoning_model !== undefined) updates['ai_ollama_reasoning_model'] = ollama.reasoning_model;
    if (ollama.embed_model) updates['ai_ollama_embed_model'] = ollama.embed_model;
  }

  if (openrouter) {
    if (openrouter.api_key) updates['ai_openrouter_api_key'] = openrouter.api_key;
    if (openrouter.model) updates['ai_openrouter_model'] = openrouter.model;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid settings provided' });
  }

  setSystemSettings(updates);

  return res.json({ success: true, updated: Object.keys(updates) });
});

// POST /api/settings/ai/test - Test AI connection (admin only)
router.post('/ai/test', authenticate, requireAdmin, async (_req: Request, res: Response) => {
  const ollamaUrl = getSystemSetting('ai_ollama_url') || process.env.OLLAMA_URL || 'http://localhost:11434';

  try {
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return res.json({
        success: false,
        error: `Ollama responded with status ${response.status}`,
      });
    }

    const data = await response.json() as { models?: Array<{ name: string }> };
    const models = data.models?.map((m) => m.name) || [];

    return res.json({
      success: true,
      ollama_url: ollamaUrl,
      models_available: models,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.json({
      success: false,
      error: `Failed to connect to Ollama: ${message}`,
    });
  }
});

// ============ Internal Logging Settings ============

// GET /api/settings/internal-logging - Get internal logging settings (admin only)
router.get('/internal-logging', authenticate, requireAdmin, (_req: Request, res: Response) => {
  const enabled = getSystemSetting('internal_logging_enabled') || 'false';
  const level = getSystemSetting('internal_logging_level') || 'WARNING';
  const categories = getSystemSetting('internal_logging_categories') || 'auth,alert,system';

  return res.json({
    enabled: enabled === 'true',
    level,
    categories: categories.split(',').filter(Boolean),
    available_levels: ['DEBUG', 'INFO', 'NOTICE', 'WARNING', 'ERROR', 'CRITICAL'],
    available_categories: ['api', 'auth', 'search', 'alert', 'report', 'ingest', 'system', 'ai'],
  });
});

// PUT /api/settings/internal-logging - Update internal logging settings (admin only)
router.put('/internal-logging', authenticate, requireAdmin, (req: Request, res: Response) => {
  const { enabled, level, categories } = req.body;

  const updates: Record<string, string> = {};

  if (typeof enabled === 'boolean') {
    updates['internal_logging_enabled'] = enabled ? 'true' : 'false';
  }

  if (level) {
    const validLevels = ['DEBUG', 'INFO', 'NOTICE', 'WARNING', 'ERROR', 'CRITICAL'];
    if (!validLevels.includes(level)) {
      return res.status(400).json({ error: `Invalid level. Must be one of: ${validLevels.join(', ')}` });
    }
    updates['internal_logging_level'] = level;
  }

  if (Array.isArray(categories)) {
    const validCategories = ['api', 'auth', 'search', 'alert', 'report', 'ingest', 'system', 'ai'];
    const invalidCategories = categories.filter(c => !validCategories.includes(c));
    if (invalidCategories.length > 0) {
      return res.status(400).json({ error: `Invalid categories: ${invalidCategories.join(', ')}` });
    }
    updates['internal_logging_categories'] = categories.join(',');
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid settings provided' });
  }

  setSystemSettings(updates);

  return res.json({ success: true, updated: Object.keys(updates) });
});

export default router;
