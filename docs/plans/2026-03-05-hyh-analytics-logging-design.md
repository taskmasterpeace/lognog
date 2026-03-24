# HYH Feature Usage Logging + Slack Alert Fix

## Date: 2026-03-05

## Problem
1. 15+ Analytics methods in HYH only track to GA4. LogNog sees logins but zero feature usage (tab views, job searches, resume actions, voice features).
2. Slack login notifications show empty because template references `user_name` which is undefined for session logins.

## Solution

### Analytics Gap Fix (`lib/analytics.ts`)
Add `clientLog.info()` calls to feature usage methods: trackTabView, trackTabTimeSpent, trackJobApplication, trackResumeAction, trackVoiceFeatureUsage, trackFeatureUsage, trackOnboardingStep, trackFreemiumWall, trackSubscription, trackJobOpportunity.

NOT adding: trackButtonClick, trackPreferenceChange, trackError/trackException (low value or already server-side).

Zero performance impact — uses existing fire-and-forget fetch to `/api/log`.

### Slack Alert Fix
Update "HYH User Login" alert message template to use fields that are always present (user_email, auth_method, ip_address instead of user_name).

### Playwright Test
`tests/analytics-logging.spec.ts` — intercepts POST /api/log, navigates features, asserts correct events sent.

## Files Changed
- `D:/git/yourehired/lib/analytics.ts` — add clientLog.info() to 10 methods
- `D:/git/yourehired/tests/analytics-logging.spec.ts` — new Playwright test
- LogNog alert DB update (via docker exec)
