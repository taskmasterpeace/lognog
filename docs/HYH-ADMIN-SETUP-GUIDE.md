# Hey You're Hired - Admin Setup Guide

This guide walks you through enabling alerts and reports for the HYH integration.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Configure Slack Webhook](#2-configure-slack-webhook)
3. [Create Notification Channel in LogNog](#3-create-notification-channel-in-lognog)
4. [Add Actions to Existing Alerts](#4-add-actions-to-existing-alerts)
5. [Enable All Alerts](#5-enable-all-alerts)
6. [Create Heartbeat Alert](#6-create-heartbeat-alert)
7. [Configure SMTP for Reports](#7-configure-smtp-for-reports)
8. [Enable Reports](#8-enable-reports)
9. [Test Everything](#9-test-everything)

---

## 1. Prerequisites

Before starting, verify:

- LogNog is running (Docker or Lite mode)
- You have admin access to LogNog
- You have access to create a Slack webhook (or alternative notification service)

**Check Apprise Status:**

1. Open LogNog UI
2. Go to **Settings** (gear icon in sidebar)
3. Look for the **Notification Channels** section
4. You should see either:
   - Green checkmark: "Apprise service is available"
   - Yellow warning: "Apprise service is not available"

If Apprise is not available, ensure the Docker container is running:
```bash
docker ps | grep apprise
docker-compose up -d apprise
```

---

## 2. Configure Slack Webhook

### Step 2.1: Create Slack App

1. Go to https://api.slack.com/apps
2. Click **Create New App**
3. Choose **From scratch**
4. Name it "LogNog Alerts"
5. Select your workspace
6. Click **Create App**

### Step 2.2: Enable Incoming Webhooks

1. In the left sidebar, click **Incoming Webhooks**
2. Toggle **Activate Incoming Webhooks** to ON
3. Click **Add New Webhook to Workspace**
4. Select the channel (e.g., `#alerts` or `#ops-hyh`)
5. Click **Allow**
6. Copy the webhook URL - it looks like:
   ```
   https://hooks.slack.com/services/YOUR_TEAM_ID/YOUR_BOT_ID/YOUR_WEBHOOK_TOKEN
   ```

### Step 2.3: Convert to Apprise URL Format

The Slack webhook URL needs to be converted to Apprise format:

**Original Slack URL:**
```
https://hooks.slack.com/services/YOUR_TEAM_ID/YOUR_BOT_ID/YOUR_WEBHOOK_TOKEN
```

**Apprise URL format:**
```
slack://YOUR_TEAM_ID/YOUR_BOT_ID/YOUR_WEBHOOK_TOKEN
```

Just take the three parts after `/services/` and put them after `slack://`

---

## 3. Create Notification Channel in LogNog

### Step 3.1: Navigate to Settings

1. Open LogNog UI
2. Click the **Settings** (gear icon) in the left sidebar
3. Scroll to **Notification Channels** section

### Step 3.2: Add Channel

1. Click **+ Add Channel** button
2. Fill in the form:

| Field | Value |
|-------|-------|
| **Channel Name** | `slack-hyh-alerts` |
| **Service** | Slack |
| **Apprise URL** | `slack://T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX` |
| **Description** | HYH production alerts |
| **Enabled** | ON |

3. Click **Test URL** to send a test message
4. Check your Slack channel for the test message
5. Click **Create Channel**

### Alternative: Discord Webhook

If using Discord instead:

1. In Discord, go to Server Settings > Integrations > Webhooks
2. Create webhook, copy URL:
   ```
   https://discord.com/api/webhooks/1234567890/abcdefghijk
   ```
3. Apprise format:
   ```
   discord://1234567890/abcdefghijk
   ```

---

## 4. Add Actions to Existing Alerts

Now add the notification channel to each HYH alert.

### Step 4.1: Navigate to Alerts

1. Click **Alerts** in the left sidebar
2. Filter by app scope: Select "hey-youre-hired" from the dropdown (if available)

### Step 4.2: Edit Each Alert

For each of the 6 existing HYH alerts, do the following:

1. Click on the alert name to expand it
2. Click the **Edit** (pencil) icon
3. Scroll down to the **Actions** section
4. Click **+ Notification** button
5. Select your channel: `slack-hyh-alerts`
6. Customize the message template (optional):

**Recommended template for Slack:**
```
{{#if severity == "critical"}}
:red_circle: *CRITICAL*
{{#else if severity == "high"}}
:large_orange_circle: *HIGH*
{{#else}}
:large_blue_circle: *{{alert_severity}}*
{{/if}}

*Alert:* {{alert_name}}
*Results:* {{result_count:comma}} matches
*Time Range:* {{time_range}}

{{#each results limit=3}}
- {{message:truncate:100}}
{{/each}}

<https://your-lognog-url/search?q={{search_query:escape_url}}|View in LogNog>
```

7. Click **Save**

### Step 4.3: Alerts to Configure

| Alert Name | Priority |
|------------|----------|
| High Error Rate | High |
| Stripe Webhook Errors | Critical |
| External API Failures | High |
| OAuth Login Failures | High |
| Signup Activity Drop | Medium |
| (Any others you see) | Varies |

---

## 5. Enable All Alerts

### Step 5.1: Enable Individual Alerts

For each alert in the list:

1. Find the toggle switch on the right side of the alert row
2. Click to enable (should turn green)

### Step 5.2: Verify All Enabled

Check that all HYH-related alerts show:
- Green toggle (enabled)
- At least one action configured (shows icons like Slack logo)

---

## 6. Create Heartbeat Alert

The heartbeat alert monitors if HYH stops sending logs entirely.

### Step 6.1: Create from Template

1. Go to **Alerts** page
2. Click **+ Create Alert** button
3. Click **Choose Template**
4. Find and select: **Heartbeat Missing (Dead Man's Switch)**
5. Click **Use Template**

### Step 6.2: Configure

The template pre-fills these values:

| Setting | Value |
|---------|-------|
| Name | Heartbeat Missing (Dead Man's Switch) |
| Query | `search message="Heartbeat" \| stats count` |
| Trigger | Less than 1 result |
| Schedule | Every 10 minutes |
| Time Range | Last 10 minutes |
| Severity | Critical |

### Step 6.3: Add Action

1. Scroll to **Actions** section
2. Click **+ Notification**
3. Select `slack-hyh-alerts`
4. Use this message template:
```
:rotating_light: *DEAD MAN'S SWITCH ACTIVATED*

No heartbeat received from Hey You're Hired in the last 10 minutes.

*Possible causes:*
- Application is down
- Logging pipeline is broken
- Network issues between HYH and LogNog

*Action required:* Check HYH application status immediately.
```

5. Set **App Scope** to `hey-youre-hired` (if available)
6. Click **Create Alert**
7. Ensure the alert is **Enabled**

---

## 7. Configure SMTP for Reports

Email reports require SMTP configuration.

### Step 7.1: Choose SMTP Provider

**Option A: Gmail (for testing)**
- Requires app-specific password
- Go to: Google Account > Security > 2-Step Verification > App passwords
- Generate password for "Mail"

**Option B: SendGrid (recommended for production)**
- Create free account at sendgrid.com
- Create API key with Mail Send permission

**Option C: Amazon SES**
- Use AWS credentials
- Verify sender email first

### Step 7.2: Configure Environment Variables

Add these to your `.env` file or docker-compose environment:

**Gmail example:**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=LogNog Reports <your-email@gmail.com>
```

**SendGrid example:**
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=SG.your-sendgrid-api-key
SMTP_FROM=LogNog Reports <reports@yourdomain.com>
```

### Step 7.3: Restart API

After adding environment variables:

```bash
# Docker
docker-compose restart api

# Or Lite mode
# Stop and restart the Node process
```

### Step 7.4: Verify SMTP

Check API logs for:
```
SMTP configured: smtp.gmail.com:587
```

If you see:
```
SMTP not configured - scheduled report emails will be skipped
```
Then the environment variables are not set correctly.

---

## 8. Enable Reports

### Step 8.1: Navigate to Reports

1. Click **Reports** in the left sidebar
2. You should see the 6 HYH reports (all disabled)

### Step 8.2: Configure Each Report

For each report:

1. Click **Edit** (pencil icon)
2. Set **Recipients**: `you@example.com, team@example.com`
   - Comma-separated list of email addresses
3. Verify **Schedule**:
   - Daily reports: `0 8 * * *` (8am daily)
   - Weekly reports: `0 9 * * 1` (Monday 9am)
4. Ensure **Enabled** is ON
5. Click **Save**

### Step 8.3: Reports to Enable

| Report | Schedule | Recipients |
|--------|----------|------------|
| Daily Signups by Source | 8am daily | team@hyh.com |
| Daily Feature Usage | 8am daily | team@hyh.com |
| Daily Error Summary | 8am daily | team@hyh.com |
| Weekly Conversion | Monday 9am | team@hyh.com |
| Weekly Job Search Trends | Monday 9am | team@hyh.com |
| Weekly API Health | Monday 9am | team@hyh.com |

### Step 8.4: Test a Report

1. Find a report in the list
2. Click **Trigger Now** or **Send Now** button
3. Check your email for the report
4. Verify the data looks correct

---

## 9. Test Everything

### Step 9.1: Test Notification Channel

1. Go to **Settings > Notification Channels**
2. Find `slack-hyh-alerts`
3. Click the **Send** (paper airplane) icon
4. Check Slack for the test message

### Step 9.2: Test an Alert

1. Go to **Alerts**
2. Find a non-critical alert (like "Signup Activity Drop")
3. Click the **Evaluate** button (play icon)
4. If data exists matching the query, you should get a Slack notification

### Step 9.3: Verify Heartbeat (after HYH implements it)

```
search index=hey-youre-hired message="Heartbeat" | timechart span=5m count
```

You should see a steady count of ~1 per 5-minute bucket.

### Step 9.4: Check Alert History

1. Go to **Alerts**
2. Click **History** tab
3. Verify alerts are executing on schedule
4. Check for any failures

### Step 9.5: Test Report Email

1. Go to **Reports**
2. Click **Trigger Now** on any report
3. Check your email within 1-2 minutes

---

## Troubleshooting

### Slack notifications not arriving

1. Check Apprise status in Settings
2. Verify webhook URL format (starts with `slack://`)
3. Check API logs: `docker logs lognog-api | grep -i apprise`
4. Test the channel in Settings

### Reports not sending

1. Check SMTP configuration in API logs
2. Verify recipient email addresses
3. Check spam folder
4. Check API logs for SMTP errors

### Alert not triggering

1. Verify the alert is enabled (green toggle)
2. Check the search query returns results
3. Verify time range matches when data exists
4. Check Alert History for execution attempts

### Heartbeat alert always firing

This is expected until HYH implements the heartbeat logging. Once they add the 5-minute heartbeat cron, the alert should stop firing.

---

## Quick Reference

### Apprise URL Formats

| Service | Format |
|---------|--------|
| Slack | `slack://TokenA/TokenB/TokenC` |
| Discord | `discord://WebhookID/WebhookToken` |
| Telegram | `tgram://BotToken/ChatID` |
| MS Teams | `msteams://TokenA/TokenB/TokenC/TokenD` |
| PagerDuty | `pagerduty://IntegrationKey` |
| Email | `mailto://user:pass@smtp.host?to=recipient@email.com` |
| ntfy | `ntfy://topic` or `ntfy://user:pass@host/topic` |

Full list: https://github.com/caronc/apprise/wiki

### SMTP Providers

| Provider | Host | Port |
|----------|------|------|
| Gmail | smtp.gmail.com | 587 |
| SendGrid | smtp.sendgrid.net | 587 |
| Amazon SES | email-smtp.us-east-1.amazonaws.com | 587 |
| Mailgun | smtp.mailgun.org | 587 |
| Outlook | smtp.office365.com | 587 |

### Cron Schedule Reference

| Schedule | Cron Expression |
|----------|-----------------|
| Every 5 min | `*/5 * * * *` |
| Every 10 min | `*/10 * * * *` |
| Every hour | `0 * * * *` |
| 8am daily | `0 8 * * *` |
| Monday 9am | `0 9 * * 1` |
| 1st of month | `0 0 1 * *` |
