# Dashboard & Reports Onboarding Guide

This guide provides a standardized questionnaire for gathering requirements to create dashboards, reports, and alerts for any new application integrated with LogNog.

> **For AI Assistants:** Use this questionnaire to interview the user about their application, then generate a dashboard plan following the templates and examples provided.

---

## Quick Start: The 5-Minute Interview

Answer these questions to generate a complete dashboard plan:

```
1. App name (kebab-case): _______________
2. One-line description: _______________
3. Revenue model: [ ] SaaS/subscription  [ ] One-time purchase  [ ] Free  [ ] Ad-supported
4. Main user actions (list 3-5): _______________
5. External APIs used: _______________
6. What keeps you up at night? _______________
```

---

## Part 1: Application Interview Questionnaire

### Section A: Business Context

| Question | Why It Matters | Example Answer |
|----------|----------------|----------------|
| **A1.** What does this app do in one sentence? | Shapes the entire dashboard strategy | "AI-powered job search platform that helps candidates find jobs and generate cover letters" |
| **A2.** Who are your users? | Determines user segmentation | "Job seekers, mostly 25-45, professional roles" |
| **A3.** What's your revenue model? | Defines which metrics are critical | "Freemium SaaS - free tier + Pro subscription at $19.99/mo" |
| **A4.** What are your top 3 business KPIs? | These become your primary dashboard panels | "1. Signups/day, 2. Free→Pro conversion rate, 3. Monthly Active Users" |
| **A5.** What's your traffic source? (ads, organic, referral) | Determines attribution tracking needs | "LinkedIn ads (60%), Google organic (30%), referrals (10%)" |

### Section B: User Funnel

| Question | Why It Matters | Example Answer |
|----------|----------------|----------------|
| **B1.** What's the user journey from first visit to revenue? | Defines funnel stages | "Visit → Signup → Complete profile → Search jobs → Upgrade to Pro" |
| **B2.** What actions indicate an "activated" user? | Key retention indicator | "Completed profile + searched for jobs at least once" |
| **B3.** What's your current conversion rate? (rough estimate) | Sets baseline for alerts | "About 5% of signups become paid" |
| **B4.** Where do users typically drop off? | Highlights what to monitor | "Many sign up but never complete their profile" |
| **B5.** What would make you investigate immediately? | Defines critical alerts | "If signups drop 50% day-over-day, or conversion drops below 3%" |

### Section C: Features & Usage

| Question | Why It Matters | Example Answer |
|----------|----------------|----------------|
| **C1.** List your main features (3-7) | Each becomes a usage panel | "Job search, Cover letter generator, Resume analyzer, Career coach, Job autofill extension" |
| **C2.** Which features are paid-only? | Tracks feature value | "Cover letter (5/month free), Career coach (Pro only)" |
| **C3.** Which features have usage limits? | Monitors limit hits | "Free users: 5 cover letters/month, 10 job searches/day" |
| **C4.** Which features use AI/LLMs? | Tracks AI costs | "Cover letter, Career coach, Resume analyzer - all use GPT-4" |
| **C5.** Which features matter most for retention? | Prioritizes monitoring | "Job search and cover letters - users who use both stay 3x longer" |

### Section D: External Dependencies

| Question | Why It Matters | Example Answer |
|----------|----------------|----------------|
| **D1.** What external APIs does your app depend on? | Each needs health monitoring | "Adzuna, Remotive, Arbeitnow (job data), Stripe (payments), OpenAI (AI features)" |
| **D2.** What happens if each API fails? | Determines alert severity | "Job APIs: degraded but fallbacks exist. OpenAI: features broken. Stripe: critical." |
| **D3.** Do you have rate limits to monitor? | Prevents outages | "Adzuna: 1000/day, OpenAI: 10k tokens/min" |
| **D4.** What's your expected API response time? | Sets performance baselines | "Job APIs: <2s, OpenAI: <5s acceptable" |

### Section E: Error & Health Tracking

| Question | Why It Matters | Example Answer |
|----------|----------------|----------------|
| **E1.** What errors are critical? (user-facing, revenue-impacting) | Immediate alerts | "Payment failures, OAuth failures, job search returns 0 results" |
| **E2.** What errors are non-critical? | Log but don't alert | "Analytics tracking failures, optional feature errors" |
| **E3.** What would indicate a system-wide problem? | High-severity alerts | "Error rate >5%, all job APIs failing, Stripe webhooks failing" |
| **E4.** What pages/endpoints should be fast? | Performance monitoring | "Homepage <1s, Search <2s, AI features <5s" |

### Section F: Reports & Scheduled Data

| Question | Why It Matters | Example Answer |
|----------|----------------|----------------|
| **F1.** What reports do you want daily? | Scheduled reports | "Signups, revenue, active users" |
| **F2.** What reports do you want weekly? | Weekly summaries | "Conversion funnel, feature usage breakdown, error summary" |
| **F3.** Who should receive reports? | Report recipients | "founder@company.com, team-slack-channel" |
| **F4.** What time should reports run? | Scheduling | "Daily at 8am EST, Weekly on Mondays" |

---

## Part 2: Standard Dashboard Templates

Based on questionnaire answers, create these dashboards:

### Dashboard 1: User Acquisition & Funnel

**Purpose:** Track where users come from and how they convert.

| Panel | Visualization | Query Pattern |
|-------|---------------|---------------|
| Signups Over Time | Line chart | `message="User signup completed" \| timechart span=1d count` |
| Signups by Source | Pie chart | `message="User signup completed" \| stats count by utm_source` |
| Conversion Funnel | Funnel | Multi-stage: signup → activation → conversion |
| Daily Active Users | Line chart | `user_id=* \| timechart span=1d dc(user_id)` |
| New vs Returning | Stacked area | `message="User login" \| timechart span=1d count by is_new_user` |

**Customize based on:**
- Answers to B1 (user journey) define funnel stages
- Answers to A5 (traffic source) add source breakdown panels

### Dashboard 2: Feature Usage

**Purpose:** Understand which features drive engagement.

| Panel | Visualization | Query Pattern |
|-------|---------------|---------------|
| Feature Usage by Type | Bar chart | `message="Feature used:*" \| stats count by feature_name` |
| Feature Usage Trend | Line chart | `message="Feature used:*" \| timechart span=1d count by feature_name` |
| Top Users by Usage | Table | `message="Feature used:*" \| stats count by user_id \| sort -count \| head 20` |
| Free vs Paid Usage | Pie chart | `message="Feature used:*" \| stats count by user_plan` |
| Limit Hits | Counter | `message="Rate limit hit" \| stats count` |

**Customize based on:**
- Answers to C1 (features) define which features to track
- Answers to C2 (paid features) add plan segmentation

### Dashboard 3: Revenue & Subscriptions

**Purpose:** Track MRR, conversions, and churn.

| Panel | Visualization | Query Pattern |
|-------|---------------|---------------|
| New Subscriptions | Line chart | `message="Subscription synced" status="active" \| timechart span=1d count` |
| Revenue by Plan | Pie chart | `message="Subscription synced" \| stats count by plan_name` |
| Checkout Conversion | Single value | Formula: completions / starts |
| Churned Users | Table | `message="Subscription synced" status="canceled" \| table timestamp user_id plan_name` |
| MRR Trend | Line chart | Calculated from subscription events |

**Customize based on:**
- Answers to A3 (revenue model) determine if this dashboard is needed
- Answers to B3 (conversion rate) set alert thresholds

### Dashboard 4: API & System Health

**Purpose:** Monitor performance and catch issues early.

| Panel | Visualization | Query Pattern |
|-------|---------------|---------------|
| Response Time P95 | Line chart | `duration_ms=* \| timechart span=1h p95(duration_ms)` |
| Error Rate | Line chart | `severity<=3 \| timechart span=1h count` |
| External API Health | Table | `message="External API:*" \| stats avg(response_time_ms) count by api_name` |
| Slow Requests | Table | `duration_ms>5000 \| table timestamp route duration_ms` |
| Error Breakdown | Pie chart | `severity<=3 \| stats count by error_type` |

**Customize based on:**
- Answers to D1 (external APIs) define which APIs to monitor
- Answers to E4 (performance expectations) set thresholds

### Dashboard 5: App-Specific

**Purpose:** Custom metrics unique to this application.

This dashboard is generated from answers to C1 (features) and C5 (retention drivers).

**Examples:**
- **Job search app:** Jobs fetched by source, zero-result searches, popular job titles
- **E-commerce:** Cart abandonment, product views, checkout funnel
- **SaaS tool:** Feature adoption, workspace activity, collaboration metrics

---

## Part 3: Standard Alert Templates

### Critical Alerts (Page immediately)

| Alert | Condition | Threshold Example |
|-------|-----------|-------------------|
| High Error Rate | Errors in 5 minutes | > 10 errors |
| Payment System Down | Stripe webhook errors | Any in 5 minutes |
| Auth System Down | OAuth failures | > 5 in 10 minutes |
| Zero Revenue Period | No new subscriptions | 24 hours with none |

### High Alerts (Slack/email)

| Alert | Condition | Threshold Example |
|-------|-----------|-------------------|
| External API Degraded | Same API fails repeatedly | > 5 failures in 10 min |
| Conversion Drop | Funnel conversion below baseline | < 50% of 7-day avg |
| Error Spike | Error rate increase | > 200% of normal |
| Slow Response | P95 latency high | > 5s for 10 minutes |

### Medium Alerts (Daily digest)

| Alert | Condition | Threshold Example |
|-------|-----------|-------------------|
| Feature Not Used | Key feature unused | 0 uses in 24 hours |
| Signup Anomaly | Unusual signup pattern | Spike could be bot attack |
| Rate Limits Approaching | Near API limits | > 80% of daily quota |

### Low Alerts (Weekly review)

| Alert | Condition | Threshold Example |
|-------|-----------|-------------------|
| New Error Type | Previously unseen error | First occurrence |
| Traffic Pattern Change | Usage pattern shift | Significant change from baseline |

---

## Part 4: Log Event Recommendations

Based on questionnaire answers, recommend these log events:

### User Lifecycle Events

```typescript
// Required for every app
lognog.info('User signup completed', { user_id, email_domain, auth_provider, utm_source, utm_medium, utm_campaign });
lognog.info('User login', { user_id, is_returning_user, days_since_last });
lognog.info('User activated', { user_id, activation_criteria });
lognog.info('User upgraded', { user_id, from_plan, to_plan });
lognog.info('User churned', { user_id, plan_name, tenure_days, reason });
```

### Feature Usage Events

```typescript
// One per feature from answer C1
lognog.info('Feature used: [feature_name]', { user_id, ...feature_specific_fields });
lognog.info('Feature completed: [feature_name]', { user_id, duration_ms, success });
```

### External API Events

```typescript
// One per API from answer D1
lognog.info('External API: [api_name] request', { endpoint, params });
lognog.info('External API: [api_name] response', { status, response_time_ms, result_count });
lognog.error('External API: [api_name] error', { status_code, error_message });
```

### Business Events

```typescript
// Based on revenue model (A3)
lognog.info('Checkout started', { user_id, plan_selected, price });
lognog.info('Payment completed', { user_id, amount, plan_name });
lognog.info('Subscription cancelled', { user_id, reason, tenure_days });
```

---

## Part 5: Example Output

### Application: Hey You're Hired

**Questionnaire Answers:**

| Question | Answer |
|----------|--------|
| A1. What does it do? | AI-powered job search that helps candidates find jobs and generate cover letters |
| A3. Revenue model | Freemium SaaS - free tier + Pro at $19.99/mo |
| A4. Top 3 KPIs | Signups, Free→Pro conversion, MAU |
| A5. Traffic source | LinkedIn ads 60%, Google organic 30% |
| B1. User journey | Visit → Signup → Profile → Job search → Upgrade |
| C1. Features | Job search, Cover letters, Resume analyzer, Career coach |
| D1. External APIs | Adzuna, Remotive, Arbeitnow, Stripe, OpenAI |

**Generated Dashboard Plan:**

1. **User Acquisition Dashboard**
   - Signups over time (split by utm_source for LinkedIn ROI)
   - Conversion funnel: Signup → Profile → Search → Upgrade
   - Signups by source (pie chart)
   - DAU/WAU/MAU trend

2. **Feature Usage Dashboard**
   - Feature usage by type (job_search, cover_letter, career_coach)
   - Cover letters generated per day
   - AI token costs by feature
   - Free vs Pro usage breakdown

3. **Revenue Dashboard**
   - New subscriptions trend
   - Checkout conversion rate
   - MRR by plan
   - Churn tracking

4. **API Health Dashboard**
   - Job API response times and success rates
   - OpenAI latency and cost
   - Stripe webhook status
   - Error rate by API

5. **Job Search Dashboard** (App-specific)
   - Jobs fetched by source (Adzuna, Remotive, etc.)
   - Zero-result searches (quality issue)
   - Popular job titles searched
   - Fallback usage rate

**Generated Alerts:**

| Alert | Condition | Action |
|-------|-----------|--------|
| Stripe webhook error | Any occurrence | Page on-call |
| High error rate | >10 in 5 min | Page on-call |
| All job APIs failing | >5 failures each in 10 min | Slack + investigate |
| Conversion drop | <3% 7-day avg | Email founder |
| Zero-result spike | >3 in 1 hour | Slack |

---

## Part 6: AI Generation Prompt Template

Use this prompt to generate dashboard configurations:

```
I need dashboards for my application. Here are my answers to the LogNog onboarding questionnaire:

[Paste filled questionnaire answers here]

Based on these answers, please generate:
1. Dashboard configurations with specific panels and queries
2. Alert rules with thresholds
3. Log event recommendations with example code
4. Scheduled report configurations

Use the LogNog DSL for all queries. Follow the templates in the DASHBOARD-ONBOARDING.md guide.
```

---

## Part 7: Onboarding Checklist

After completing the questionnaire:

- [ ] Review generated dashboard plan
- [ ] Verify logging events are implemented (see APP-ONBOARDING.md)
- [ ] Create dashboards in LogNog UI (or via API)
- [ ] Configure alerts with appropriate recipients
- [ ] Set up scheduled reports
- [ ] Test with sample data
- [ ] Add app to dashboard registry below

---

## Current Dashboard Configurations

| App | Index | Dashboards | Alerts | Status |
|-----|-------|------------|--------|--------|
| Hey You're Hired | `hey-youre-hired` | 5 | 6 | Complete |
| Directors Palette | `directors-palette` | - | - | Pending |
| LogNog Internal | `lognog-internal` | 1 | 2 | Complete |

---

## Appendix: LogNog DSL Quick Reference

### Common Patterns

```
# Count events
message="User signup completed" | stats count

# Count by field
message="Feature used:*" | stats count by feature_name

# Time chart
message="User login" | timechart span=1d count

# Percentiles
duration_ms=* | stats p50(duration_ms) p95(duration_ms) p99(duration_ms)

# Filter and aggregate
severity<=3 | stats count by error_type | sort -count | head 10

# Distinct count
user_id=* | stats dc(user_id) as unique_users

# Average over time
duration_ms=* | timechart span=1h avg(duration_ms)
```

### Panel Visualization Mapping

| Use Case | DSL Pattern | Visualization |
|----------|-------------|---------------|
| Trend over time | `timechart span=1d count` | Line chart |
| Distribution | `stats count by category` | Pie chart |
| Top N | `stats count by field \| head 10` | Bar chart or Table |
| Single metric | `stats count` | Counter |
| Comparison | `timechart count by category` | Stacked area |
| Performance | `stats p95(duration_ms)` | Line chart |
