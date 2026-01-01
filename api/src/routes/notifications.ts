import { Router, Request, Response } from 'express';
import {
  getNotificationChannels,
  getNotificationChannel,
  getNotificationChannelByName,
  createNotificationChannel,
  updateNotificationChannel,
  deleteNotificationChannel,
  updateChannelTestResult,
  NotificationService,
} from '../db/sqlite.js';

const router = Router();

// List of available notification services with their Apprise URL patterns
const NOTIFICATION_SERVICES: Array<{
  id: NotificationService;
  name: string;
  description: string;
  urlPattern: string;
  docsUrl: string;
  fields: Array<{
    name: string;
    label: string;
    type: 'text' | 'password' | 'select';
    required: boolean;
    placeholder?: string;
    help?: string;
  }>;
}> = [
  {
    id: 'slack',
    name: 'Slack',
    description: 'Send notifications to Slack channels',
    urlPattern: 'slack://TokenA/TokenB/TokenC/#channel',
    docsUrl: 'https://github.com/caronc/apprise/wiki/Notify_slack',
    fields: [
      { name: 'webhook_url', label: 'Webhook URL', type: 'text', required: true, placeholder: 'https://hooks.slack.com/services/...' },
      { name: 'channel', label: 'Channel (optional)', type: 'text', required: false, placeholder: '#general' },
    ],
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Send notifications to Discord channels',
    urlPattern: 'discord://webhook_id/webhook_token',
    docsUrl: 'https://github.com/caronc/apprise/wiki/Notify_discord',
    fields: [
      { name: 'webhook_url', label: 'Webhook URL', type: 'text', required: true, placeholder: 'https://discord.com/api/webhooks/...' },
    ],
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'Send notifications via Telegram bot',
    urlPattern: 'tgram://bot_token/chat_id',
    docsUrl: 'https://github.com/caronc/apprise/wiki/Notify_telegram',
    fields: [
      { name: 'bot_token', label: 'Bot Token', type: 'password', required: true, placeholder: '123456789:ABC...' },
      { name: 'chat_id', label: 'Chat ID', type: 'text', required: true, placeholder: '-1001234567890' },
    ],
  },
  {
    id: 'msteams',
    name: 'Microsoft Teams',
    description: 'Send notifications to Microsoft Teams channels',
    urlPattern: 'msteams://TokenA/TokenB/TokenC',
    docsUrl: 'https://github.com/caronc/apprise/wiki/Notify_msteams',
    fields: [
      { name: 'webhook_url', label: 'Webhook URL', type: 'text', required: true, placeholder: 'https://outlook.office.com/webhook/...' },
    ],
  },
  {
    id: 'pagerduty',
    name: 'PagerDuty',
    description: 'Trigger incidents in PagerDuty',
    urlPattern: 'pagerduty://integration_key',
    docsUrl: 'https://github.com/caronc/apprise/wiki/Notify_pagerduty',
    fields: [
      { name: 'integration_key', label: 'Integration Key', type: 'password', required: true, placeholder: 'Your routing key' },
    ],
  },
  {
    id: 'opsgenie',
    name: 'Opsgenie',
    description: 'Create alerts in Opsgenie',
    urlPattern: 'opsgenie://api_key',
    docsUrl: 'https://github.com/caronc/apprise/wiki/Notify_opsgenie',
    fields: [
      { name: 'api_key', label: 'API Key', type: 'password', required: true, placeholder: 'Your Opsgenie API key' },
    ],
  },
  {
    id: 'pushover',
    name: 'Pushover',
    description: 'Send push notifications via Pushover',
    urlPattern: 'pover://user_key/api_token',
    docsUrl: 'https://github.com/caronc/apprise/wiki/Notify_pushover',
    fields: [
      { name: 'user_key', label: 'User Key', type: 'password', required: true },
      { name: 'api_token', label: 'API Token', type: 'password', required: true },
    ],
  },
  {
    id: 'ntfy',
    name: 'ntfy',
    description: 'Send notifications via ntfy.sh (self-hostable)',
    urlPattern: 'ntfy://topic',
    docsUrl: 'https://github.com/caronc/apprise/wiki/Notify_ntfy',
    fields: [
      { name: 'server', label: 'Server URL', type: 'text', required: false, placeholder: 'https://ntfy.sh (default)' },
      { name: 'topic', label: 'Topic', type: 'text', required: true, placeholder: 'my-alerts' },
    ],
  },
  {
    id: 'gotify',
    name: 'Gotify',
    description: 'Send notifications to Gotify server',
    urlPattern: 'gotify://hostname/token',
    docsUrl: 'https://github.com/caronc/apprise/wiki/Notify_gotify',
    fields: [
      { name: 'server', label: 'Server URL', type: 'text', required: true, placeholder: 'https://gotify.example.com' },
      { name: 'token', label: 'App Token', type: 'password', required: true },
    ],
  },
  {
    id: 'matrix',
    name: 'Matrix',
    description: 'Send notifications to Matrix rooms',
    urlPattern: 'matrix://user:pass@hostname/#room',
    docsUrl: 'https://github.com/caronc/apprise/wiki/Notify_matrix',
    fields: [
      { name: 'homeserver', label: 'Homeserver URL', type: 'text', required: true, placeholder: 'https://matrix.org' },
      { name: 'user', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
      { name: 'room', label: 'Room ID', type: 'text', required: true, placeholder: '#room:matrix.org' },
    ],
  },
  {
    id: 'email',
    name: 'Email (SMTP)',
    description: 'Send email notifications',
    urlPattern: 'mailto://user:pass@smtp.gmail.com',
    docsUrl: 'https://github.com/caronc/apprise/wiki/Notify_email',
    fields: [
      { name: 'smtp_host', label: 'SMTP Host', type: 'text', required: true, placeholder: 'smtp.gmail.com' },
      { name: 'smtp_port', label: 'SMTP Port', type: 'text', required: false, placeholder: '587' },
      { name: 'username', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
      { name: 'to', label: 'To Address', type: 'text', required: true },
    ],
  },
  {
    id: 'webhook',
    name: 'Custom Webhook',
    description: 'Send JSON notifications to any HTTP endpoint',
    urlPattern: 'json://hostname/path',
    docsUrl: 'https://github.com/caronc/apprise/wiki/Notify_Custom_JSON',
    fields: [
      { name: 'url', label: 'Webhook URL', type: 'text', required: true, placeholder: 'https://example.com/webhook' },
      { name: 'method', label: 'HTTP Method', type: 'select', required: false },
    ],
  },
  {
    id: 'twilio',
    name: 'Twilio SMS',
    description: 'Send SMS messages via Twilio',
    urlPattern: 'twilio://account_sid:auth_token@from_phone/to_phone',
    docsUrl: 'https://github.com/caronc/apprise/wiki/Notify_twilio',
    fields: [
      { name: 'account_sid', label: 'Account SID', type: 'text', required: true },
      { name: 'auth_token', label: 'Auth Token', type: 'password', required: true },
      { name: 'from_phone', label: 'From Phone', type: 'text', required: true, placeholder: '+1234567890' },
      { name: 'to_phone', label: 'To Phone', type: 'text', required: true, placeholder: '+1234567890' },
    ],
  },
  {
    id: 'custom',
    name: 'Custom Apprise URL',
    description: 'Enter any valid Apprise URL directly',
    urlPattern: 'See Apprise documentation',
    docsUrl: 'https://github.com/caronc/apprise/wiki',
    fields: [
      { name: 'apprise_url', label: 'Apprise URL', type: 'text', required: true, placeholder: 'service://...' },
    ],
  },
];

// Get available notification services
router.get('/services', (_req: Request, res: Response) => {
  return res.json(NOTIFICATION_SERVICES.map(({ id, name, description, urlPattern, docsUrl, fields }) => ({
    id,
    name,
    description,
    urlPattern,
    docsUrl,
    fields,
  })));
});

// List all notification channels
router.get('/channels', (_req: Request, res: Response) => {
  try {
    const channels = getNotificationChannels();
    // Mask sensitive parts of apprise_url for security
    const maskedChannels = channels.map(ch => ({
      ...ch,
      apprise_url_masked: maskAppriseUrl(ch.apprise_url),
    }));
    return res.json(maskedChannels);
  } catch (error) {
    console.error('Error fetching notification channels:', error);
    return res.status(500).json({ error: 'Failed to fetch notification channels' });
  }
});

// Get a single notification channel
router.get('/channels/:id', (req: Request, res: Response) => {
  try {
    const channel = getNotificationChannel(req.params.id);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    return res.json({
      ...channel,
      apprise_url_masked: maskAppriseUrl(channel.apprise_url),
    });
  } catch (error) {
    console.error('Error fetching notification channel:', error);
    return res.status(500).json({ error: 'Failed to fetch notification channel' });
  }
});

// Create a notification channel
router.post('/channels', (req: Request, res: Response) => {
  try {
    const { name, service, apprise_url, description, enabled } = req.body;

    if (!name || !service || !apprise_url) {
      return res.status(400).json({ error: 'name, service, and apprise_url are required' });
    }

    // Check for duplicate name
    const existing = getNotificationChannelByName(name);
    if (existing) {
      return res.status(409).json({ error: 'A channel with this name already exists' });
    }

    const channel = createNotificationChannel(name, service, apprise_url, {
      description,
      enabled,
    });

    return res.status(201).json({
      ...channel,
      apprise_url_masked: maskAppriseUrl(channel.apprise_url),
    });
  } catch (error) {
    console.error('Error creating notification channel:', error);
    return res.status(500).json({ error: 'Failed to create notification channel' });
  }
});

// Update a notification channel
router.put('/channels/:id', (req: Request, res: Response) => {
  try {
    const { name, service, apprise_url, description, enabled } = req.body;

    const existing = getNotificationChannel(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Check for duplicate name (if changing name)
    if (name && name !== existing.name) {
      const nameConflict = getNotificationChannelByName(name);
      if (nameConflict) {
        return res.status(409).json({ error: 'A channel with this name already exists' });
      }
    }

    const channel = updateNotificationChannel(req.params.id, {
      name,
      service,
      apprise_url,
      description,
      enabled,
    });

    return res.json({
      ...channel,
      apprise_url_masked: channel ? maskAppriseUrl(channel.apprise_url) : undefined,
    });
  } catch (error) {
    console.error('Error updating notification channel:', error);
    return res.status(500).json({ error: 'Failed to update notification channel' });
  }
});

// Delete a notification channel
router.delete('/channels/:id', (req: Request, res: Response) => {
  try {
    const deleted = deleteNotificationChannel(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Error deleting notification channel:', error);
    return res.status(500).json({ error: 'Failed to delete notification channel' });
  }
});

// Test a notification channel
router.post('/channels/:id/test', async (req: Request, res: Response) => {
  try {
    const channel = getNotificationChannel(req.params.id);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const appriseUrl = process.env.APPRISE_URL || 'http://apprise:8000';

    try {
      const response = await fetch(`${appriseUrl}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: channel.apprise_url,
          title: 'LogNog Test Notification',
          body: `This is a test notification from LogNog for channel "${channel.name}". If you see this, your notification channel is configured correctly!`,
          type: 'info',
        }),
      });

      const success = response.ok;
      updateChannelTestResult(req.params.id, success);

      if (success) {
        return res.json({ success: true, message: 'Test notification sent successfully' });
      } else {
        const errorText = await response.text();
        return res.status(502).json({
          success: false,
          message: 'Failed to send test notification',
          details: errorText,
        });
      }
    } catch (fetchError) {
      updateChannelTestResult(req.params.id, false);
      return res.status(502).json({
        success: false,
        message: 'Failed to connect to Apprise service',
        details: fetchError instanceof Error ? fetchError.message : 'Unknown error',
      });
    }
  } catch (error) {
    console.error('Error testing notification channel:', error);
    return res.status(500).json({ error: 'Failed to test notification channel' });
  }
});

// Test an Apprise URL directly (without saving)
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { apprise_url, title, body } = req.body;

    if (!apprise_url) {
      return res.status(400).json({ error: 'apprise_url is required' });
    }

    const appriseUrl = process.env.APPRISE_URL || 'http://apprise:8000';

    try {
      const response = await fetch(`${appriseUrl}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: apprise_url,
          title: title || 'LogNog Test Notification',
          body: body || 'This is a test notification from LogNog.',
          type: 'info',
        }),
      });

      if (response.ok) {
        return res.json({ success: true, message: 'Test notification sent successfully' });
      } else {
        const errorText = await response.text();
        return res.status(502).json({
          success: false,
          message: 'Failed to send test notification',
          details: errorText,
        });
      }
    } catch (fetchError) {
      return res.status(502).json({
        success: false,
        message: 'Failed to connect to Apprise service',
        details: fetchError instanceof Error ? fetchError.message : 'Unknown error',
      });
    }
  } catch (error) {
    console.error('Error testing Apprise URL:', error);
    return res.status(500).json({ error: 'Failed to test Apprise URL' });
  }
});

// Get Apprise service status
router.get('/status', async (_req: Request, res: Response) => {
  const appriseUrl = process.env.APPRISE_URL || 'http://apprise:8000';

  try {
    const response = await fetch(`${appriseUrl}/status`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      return res.json({
        available: true,
        url: appriseUrl,
        message: 'Apprise service is running',
      });
    } else {
      return res.json({
        available: false,
        url: appriseUrl,
        message: 'Apprise service returned an error',
      });
    }
  } catch {
    return res.json({
      available: false,
      url: appriseUrl,
      message: 'Apprise service is not reachable',
    });
  }
});

// Helper function to mask sensitive parts of Apprise URLs
function maskAppriseUrl(url: string): string {
  // Mask tokens, passwords, and keys in the URL
  return url
    .replace(/(:\/\/[^:]+:)([^@]+)(@)/g, '$1****$3')  // password in user:pass@host
    .replace(/([?&]token=)([^&]+)/gi, '$1****')       // token query param
    .replace(/([?&]key=)([^&]+)/gi, '$1****')         // key query param
    .replace(/(\/)[A-Za-z0-9_-]{20,}(\/|$)/g, '/****$2'); // long tokens in path
}

export default router;
