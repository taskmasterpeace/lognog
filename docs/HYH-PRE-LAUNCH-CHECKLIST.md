# Hey You're Hired - Pre-Launch Checklist

## For the HYH Team

### PRIORITY 1 - CRITICAL (Required Before Go-Live)

#### 1. Add Heartbeat Logging

Send a heartbeat log every 5 minutes from a cron job or background task. This enables the "dead man's switch" alert that notifies if your app stops sending logs.

```bash
# Every 5 minutes, POST:
curl -X POST https://your-lognog-instance/api/ingest/http \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "X-App-Name: hey-youre-hired" \
  -H "X-Index: hey-youre-hired" \
  -H "Content-Type: application/json" \
  -d '[{"level":"info","message":"Heartbeat","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}]'
```

**Why it matters:** Without heartbeats, we cannot detect if your app stops sending logs entirely (vs. just having no user activity).

#### 2. Confirm Message Strings Match Exactly

The alerts and dashboards look for these exact message strings (case-sensitive). Verify your logging matches:

| Message String | Used For |
|----------------|----------|
| `"User signup completed"` | Daily Signups report, Signup Activity alert |
| `"User login"` | Login tracking |
| `"OAuth login failed"` | OAuth Failures alert |
| `"Checkout started"` | Conversion funnel |
| `"Subscription created"` | Revenue tracking |
| `"Subscription sync failed"` | Payment Failures alert |
| `"Stripe webhook error"` | Stripe Webhook Errors alert |
| `"Feature: Cover letter generated"` | Feature Usage dashboard/report |
| `"Feature: Career coach session"` | Feature Usage dashboard/report |
| `"Feature: Job recommendations"` | Feature Usage dashboard/report |
| `"External API: [name] error"` | External API Failures alert |

**Example log format:**
```json
{
  "level": "info",
  "message": "Feature: Cover letter generated",
  "timestamp": "2024-01-15T10:30:00Z",
  "user_id": "user_123",
  "company": "Acme Corp",
  "position": "Software Engineer",
  "style": "professional",
  "tokens_used": 1500,
  "duration_ms": 2300
}
```

---

### PRIORITY 2 - NICE TO HAVE

#### 3. Add Blog View Tracking

If you have a blog, send page view events:

```json
{
  "level": "info",
  "message": "Blog view",
  "timestamp": "2024-01-15T10:30:00Z",
  "blog_title": "10 Resume Tips for 2024",
  "blog_category": "resume",
  "scroll_depth": 0.75,
  "time_on_page": 120,
  "user_id": "user_123"
}
```

#### 4. Add Page View Tracking (for funnel analysis)

```json
{
  "level": "info",
  "message": "Page view",
  "timestamp": "2024-01-15T10:30:00Z",
  "page_path": "/pricing",
  "referrer": "/features",
  "user_id": "user_123"
}
```

#### 5. Add Session Tracking

```json
// Session start
{
  "level": "info",
  "message": "Session start",
  "timestamp": "2024-01-15T10:30:00Z",
  "session_id": "sess_abc123",
  "user_id": "user_123"
}

// Session end
{
  "level": "info",
  "message": "Session end",
  "timestamp": "2024-01-15T10:35:00Z",
  "session_id": "sess_abc123",
  "duration_seconds": 300,
  "user_id": "user_123"
}
```

---

### Verification Steps

After implementing the above, verify logs are flowing:

```
search index=hey-youre-hired | head 10
```

Check message distribution:

```
search index=hey-youre-hired | stats count by message | sort desc count
```

Verify heartbeat (after enabling):

```
search index=hey-youre-hired message="Heartbeat" | timechart count
```

---

## For the LogNog Admin

### Configure Alerts

1. **Add Apprise/Slack notification channel**
   - Configure Apprise with your Slack webhook URL
   - Verify Apprise is reachable at `APPRISE_URL`

2. **Enable alerts and add actions**
   - Go to Alerts page
   - For each HYH alert:
     1. Click Edit
     2. Add an action (Apprise notification)
     3. Enable the alert
     4. Save

3. **Test alerts**
   - Use "Test Alert" button to verify notifications work

### Configure Reports (if email desired)

1. **Set SMTP environment variables:**
   ```env
   SMTP_HOST=smtp.example.com
   SMTP_PORT=587
   SMTP_SECURE=false          # Set to 'true' for port 465
   SMTP_USER=your-smtp-user
   SMTP_PASS=your-smtp-password
   SMTP_FROM=reports@lognog.com
   ```

   **Note:** If SMTP is not configured, the API will log: "SMTP not configured - scheduled report emails will be skipped"

2. **Enable reports**
   - Go to Reports page
   - For each HYH report:
     1. Set recipient email address
     2. Enable the report
     3. Save

3. **Test reports**
   - Use "Send Now" to test email delivery

### Add New Alert Template

The heartbeat dead man's switch alert template has been added. To create an alert from it:

1. Go to Alerts > Create Alert
2. Choose template: "Heartbeat Missing (Dead Man's Switch)"
3. Add Apprise action
4. Enable the alert

---

## Current Status Summary

| Component | Status | Action Needed |
|-----------|--------|---------------|
| **Data Ingestion** | Receiving user events, marketing, checkout, AI features | HYH: Add heartbeat, verify message strings |
| **Dashboards** | 7 dashboards ready | Blog dashboard needs data from HYH |
| **Alerts** | 6 alerts exist, all disabled | LogNog Admin: Add actions, enable |
| **Reports** | 6 reports exist, all disabled | LogNog Admin: Configure SMTP, enable |
| **Heartbeat Alert** | Template added | LogNog Admin: Create alert from template |

---

## What's NOT Being Received (Tell HYH)

| Missing Data | Recommended Log |
|--------------|-----------------|
| Blog/Content Events | `message="Blog view"` with `blog_title`, `blog_category` |
| Browser Extension Events | `message="Extension autofill"` with `job_site`, `fields_filled` |
| Session Start/End | `message="Session start"` and `message="Session end"` |
| Page Views | `message="Page view"` with `page_path` |
