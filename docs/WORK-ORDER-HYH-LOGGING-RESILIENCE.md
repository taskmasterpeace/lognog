# Work Order: HYH Logging Resilience & Post-Restore Checklist

**Date**: March 22, 2026
**Priority**: High
**Requested by**: LogNog team
**Assigned to**: HeyYoureHired dev team

---

## Background: What Happened

On ~March 7, 2026, a LogNog database restore caused all API keys to change. The HYH app's API key (`lnog_e82c2ee9...`) no longer existed in the new database. For **15 days**, every log event HYH sent to LogNog silently failed with a 401 Unauthorized response. Nobody noticed because:

1. The `lognog.ts` client logs errors to `console.error`, but those get buried in Vercel's function logs
2. There's no persistent tracking of ingestion failures — no counter, no flag, no health check
3. The LogNog side now has "dead client" alerts, but HYH itself has no way to self-report that logging is broken

**New API keys have already been deployed** (March 22, 2026). Logging is working again. This work order is about making sure a silent 15-day blackout can never happen again.

---

## Task 1: Add Ingestion Failure Tracking to `lib/lognog.ts`

### What to Change

**File**: `lib/lognog.ts`

Add a failure counter and a periodic warning system so that repeated ingestion failures become visible in Vercel logs and (optionally) trigger an alert.

### Current Behavior (lines 82-97)

```typescript
if (!response.ok) {
  console.error(`[LogNog] Server error ${response.status}:`, responseText);
  // Re-adds to buffer, silently
}
```

This logs once per failed flush, but in Vercel's streaming logs these scroll away instantly. After the buffer fills to 1000, events are silently dropped forever.

### Desired Changes

**Add these class properties** (after line 32):

```typescript
private consecutiveFailures = 0;
private lastFailureReason = '';
private totalDroppedEvents = 0;
private lastWarningTime = 0;
```

**Replace the `flush()` method** (lines 61-98) with:

```typescript
private async flush() {
  if (this.buffer.length === 0) {
    return;
  }

  const events = [...this.buffer];
  this.buffer = [];

  try {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        'X-App-Name': 'hey-youre-hired',
        'X-Index': this.index,
      },
      body: JSON.stringify(events),
    });

    const responseText = await response.text();
    if (!response.ok) {
      this.consecutiveFailures++;
      this.lastFailureReason = `HTTP ${response.status}: ${responseText.slice(0, 200)}`;

      // Re-add events to buffer on failure
      if (this.buffer.length < 1000) {
        this.buffer.unshift(...events);
      } else {
        this.totalDroppedEvents += events.length;
      }

      // Log escalating warnings
      this.logFailureWarning(events.length);
    } else {
      // Success — reset failure tracking
      if (this.consecutiveFailures > 0) {
        console.log(`[LogNog] Connection restored after ${this.consecutiveFailures} consecutive failures (${this.totalDroppedEvents} events dropped total)`);
      }
      this.consecutiveFailures = 0;
      this.totalDroppedEvents = 0;
      console.log(`[LogNog] Sent ${events.length} logs:`, responseText);
    }
  } catch (error) {
    this.consecutiveFailures++;
    this.lastFailureReason = error instanceof Error ? error.message : 'Unknown error';

    if (this.buffer.length < 1000) {
      this.buffer.unshift(...events);
    } else {
      this.totalDroppedEvents += events.length;
    }

    this.logFailureWarning(events.length);
  }
}

private logFailureWarning(eventCount: number) {
  const now = Date.now();
  // Don't spam warnings — max once per 60 seconds
  if (now - this.lastWarningTime < 60_000) return;
  this.lastWarningTime = now;

  if (this.consecutiveFailures >= 10) {
    // CRITICAL: Logging has been down for a while
    console.error(
      `[LogNog] CRITICAL: ${this.consecutiveFailures} consecutive failures. ` +
      `${this.totalDroppedEvents} events dropped. Last error: ${this.lastFailureReason}. ` +
      `CHECK API KEY AND ENDPOINT IMMEDIATELY.`
    );
  } else if (this.consecutiveFailures >= 3) {
    console.error(
      `[LogNog] WARNING: ${this.consecutiveFailures} consecutive failures. ` +
      `Reason: ${this.lastFailureReason}`
    );
  } else {
    console.error(`[LogNog] Flush failed (attempt ${this.consecutiveFailures}): ${this.lastFailureReason}`);
  }
}
```

### Why This Helps

- **Escalating severity**: 1-2 failures = normal log. 3-9 = WARNING. 10+ = CRITICAL with "CHECK API KEY" message
- **Tracks dropped events**: So you know the blast radius when logging comes back
- **Recovery log**: When connection restores, it logs how long the outage was
- **Rate-limited warnings**: Max 1 per minute so it doesn't flood Vercel logs
- **401 specifically visible**: The HTTP status code is included, so a bad API key shows `HTTP 401: Unauthorized`

### Testing

1. Temporarily set `LOGNOG_API_KEY` to a garbage value in `.env.local`
2. Run the app, trigger some log events
3. Check console — should see escalating warnings after 3 failures
4. Fix the API key, trigger more events
5. Should see "Connection restored after N consecutive failures"

---

## Task 2: Add a Health Check Endpoint (Optional but Recommended)

### What to Add

**New file**: `app/api/health/lognog/route.ts`

```typescript
import { NextResponse } from 'next/server';

export async function GET() {
  const url = process.env.LOGNOG_URL
    ? `${process.env.LOGNOG_URL}/api/ingest/http`
    : (process.env.LOGNOG_ENDPOINT || 'https://logs.machinekinglabs.com/api/ingest/http');
  const apiKey = process.env.LOGNOG_API_KEY || '';

  if (!apiKey) {
    return NextResponse.json({ status: 'unconfigured', message: 'No LOGNOG_API_KEY set' }, { status: 503 });
  }

  try {
    // Send a single test event
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'X-App-Name': 'hey-youre-hired',
        'X-Index': process.env.LOGNOG_INDEX || 'hey-youre-hired',
      },
      body: JSON.stringify([{
        timestamp: new Date().toISOString(),
        level: 'debug',
        message: 'LogNog health check ping',
        app_name: 'hey-youre-hired',
      }]),
    });

    if (response.ok) {
      return NextResponse.json({ status: 'ok', endpoint: url });
    } else {
      const text = await response.text();
      return NextResponse.json(
        { status: 'error', code: response.status, message: text.slice(0, 200), endpoint: url },
        { status: 502 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { status: 'unreachable', message: error instanceof Error ? error.message : 'Unknown', endpoint: url },
      { status: 502 }
    );
  }
}
```

This lets you hit `https://www.heyyourehired.com/api/health/lognog` anytime to check if logging is working. Returns 200 if good, 502 if broken, 503 if unconfigured.

---

## Task 3: Not a Code Change — Just Know This

### Post-Restore Checklist (for LogNog ops)

This is for the LogNog side, not HYH. But you should know it exists so you can ask us to run through it if we ever do another database restore.

After any LogNog database restore:

1. Verify all client API keys still exist: `sqlite3 /data/lognog.db "SELECT name, key FROM api_keys;"`
2. Test each client's ingestion with curl
3. Check that alerts are still configured
4. Check dashboards still have panels
5. Monitor ingestion for 24 hours to confirm all clients are sending

**If you get a Slack alert from "HYH Logging Dead" or "DP Logging Dead"** — that's the new dead client detection. It means zero logs from that app in the last 6 hours. Contact LogNog team immediately.

---

## Acceptance Criteria

- [ ] `lib/lognog.ts` has failure counter, escalating warnings, and recovery logging
- [ ] Console output shows `CRITICAL` after 10+ consecutive failures
- [ ] Console output shows "Connection restored" when logging recovers
- [ ] Dropped event count is tracked and reported
- [ ] (Optional) `/api/health/lognog` endpoint returns 200 when logging works, 502 when broken
- [ ] Deploy to Vercel after changes

## Estimated Effort

- Task 1 (failure tracking): ~30 minutes
- Task 2 (health endpoint): ~15 minutes
- Testing: ~15 minutes
- **Total: ~1 hour**

---

*Generated from LogNog incident post-mortem, March 22, 2026*
