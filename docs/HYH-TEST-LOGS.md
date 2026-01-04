# Hey You're Hired - Test Log Generation Guide

This document tells you what test logs to send to LogNog to fully populate the Hey You're Hired dashboards.

## LogNog Configuration

```
Endpoint: https://logs.machinekinglabs.com/api/ingest/http
Headers:
  X-API-Key: <your-api-key>
  X-App-Name: hey-youre-hired
  X-Index: hey-youre-hired
  Content-Type: application/json
```

## Test Log Events to Generate

Send these as a JSON array to the endpoint above. Generate **multiple instances** of each with varied data.

---

### 1. User Signup Events (Dashboard: User Acquisition)

Generate 10-20 of these with different sources:

```json
{
  "level": "info",
  "message": "User signup completed",
  "user_id": "user_test_001",
  "user_email": "testuser1@gmail.com",
  "auth_provider": "google",
  "is_new_user": true,
  "utm_source": "linkedin",
  "utm_medium": "cpc",
  "utm_campaign": "job-seekers-jan-2026",
  "referrer": "https://linkedin.com/feed"
}
```

**Vary these fields:**
- `utm_source`: "linkedin", "google", "direct", "referral", "twitter"
- `utm_medium`: "cpc", "organic", "social", "email"
- `utm_campaign`: "job-seekers-jan-2026", "career-change-2026", "tech-workers"
- `auth_provider`: "google", "github", "linkedin"

---

### 2. User Login Events (Dashboard: User Acquisition)

Generate 15-25 of these:

```json
{
  "level": "info",
  "message": "User login",
  "user_id": "user_test_001",
  "user_email": "testuser1@gmail.com",
  "auth_provider": "google",
  "is_new_user": false,
  "is_returning_user": true,
  "days_since_last_login": 3
}
```

**Vary these fields:**
- `is_new_user`: true (20%), false (80%)
- `days_since_last_login`: 0, 1, 3, 7, 14, 30

---

### 3. Profile Created Events (Dashboard: User Acquisition)

Generate 8-12 of these:

```json
{
  "level": "info",
  "message": "Profile created",
  "user_id": "user_test_001",
  "has_resume": true,
  "job_titles": ["Software Engineer", "Full Stack Developer"],
  "experience_level": "Mid",
  "country": "United States",
  "profile_completeness_pct": 85
}
```

**Vary these fields:**
- `has_resume`: true, false
- `experience_level`: "Entry", "Mid", "Senior", "Executive"
- `profile_completeness_pct`: 50, 65, 75, 85, 100

---

### 4. Checkout Events (Dashboard: User Acquisition & Revenue)

Generate 5-10 of these:

```json
{
  "level": "info",
  "message": "Checkout started",
  "user_id": "user_test_001",
  "user_email": "testuser1@gmail.com",
  "plan_selected": "Professional",
  "interval": "monthly",
  "price_usd": 19.99,
  "session_id": "cs_test_abc123"
}
```

**Vary these fields:**
- `plan_selected`: "Professional", "Premium"
- `interval`: "monthly", "yearly"
- `price_usd`: 19.99 (monthly), 14.99 (yearly per month)

---

### 5. Subscription Events (Dashboard: Revenue)

Generate 5-8 of these:

```json
{
  "level": "info",
  "message": "Subscription synced",
  "user_id": "user_test_001",
  "customer_id": "cus_test_001",
  "plan_name": "Professional",
  "status": "active",
  "interval": "monthly"
}
```

**Vary these fields:**
- `plan_name`: "Professional", "Premium", "Basic"
- `status`: "active" (mostly), "canceled" (few), "past_due" (rare)

---

### 6. Stripe Webhook Events (Dashboard: Revenue)

Generate 5-10 of these:

```json
{
  "level": "info",
  "message": "Stripe webhook received",
  "event_type": "customer.subscription.created",
  "customer_id": "cus_test_001"
}
```

**Vary these fields:**
- `event_type`: "customer.subscription.created", "customer.subscription.updated", "invoice.paid", "invoice.payment_failed"

---

### 7. Cover Letter Events (Dashboard: Feature Usage)

Generate 10-15 of these:

```json
{
  "level": "info",
  "message": "AI: Cover letter generated",
  "user_id": "user_test_001",
  "company": "Google",
  "position": "Software Engineer",
  "style": "professional",
  "tokens_used": 1500,
  "duration_ms": 3200
}
```

**Vary these fields:**
- `company`: "Google", "Microsoft", "Amazon", "Meta", "Stripe", "Airbnb"
- `position`: "Software Engineer", "Product Manager", "Data Scientist", "Designer"
- `style`: "professional", "friendly", "confident"

---

### 8. Career Coach Events (Dashboard: Feature Usage)

Generate 5-10 of these:

```json
{
  "level": "info",
  "message": "AI: Career coach conversation",
  "user_id": "user_test_001",
  "is_voice": false,
  "tokens_used": 2500,
  "duration_ms": 5000,
  "topic": "salary_negotiation"
}
```

**Vary these fields:**
- `is_voice`: true, false
- `topic`: "salary_negotiation", "interview_prep", "career_change", "resume_review"

---

### 9. Job Search Events (Dashboard: Feature Usage & Job Search)

Generate 15-25 of these:

```json
{
  "level": "info",
  "message": "Job recommendations request",
  "user_id": "user_test_001",
  "job_title": "Software Engineer",
  "location": "San Francisco, CA",
  "remote": true,
  "experience_level": "5-10"
}
```

**Vary these fields:**
- `job_title`: "Software Engineer", "Product Manager", "Data Scientist", "UX Designer", "DevOps Engineer", "Frontend Developer"
- `location`: "San Francisco, CA", "New York, NY", "Austin, TX", "Seattle, WA", "Remote"
- `remote`: true, false
- `experience_level`: "0-2", "2-5", "5-10", "10+"

---

### 10. Extension Autofill Events (Dashboard: Feature Usage)

Generate 5-10 of these:

```json
{
  "level": "info",
  "message": "Extension: Autofill request",
  "user_id": "user_test_001",
  "job_site": "linkedin.com",
  "fields_requested": ["name", "email", "phone", "resume"]
}
```

```json
{
  "level": "info",
  "message": "Extension: Autofill completed",
  "user_id": "user_test_001",
  "job_site": "linkedin.com",
  "fields_filled": 4,
  "duration_ms": 250
}
```

**Vary these fields:**
- `job_site`: "linkedin.com", "indeed.com", "greenhouse.io", "lever.co", "workday.com"

---

### 11. External API Events (Dashboard: Job Search & API Health)

Generate 10-15 of each API pair:

**Adzuna:**
```json
{
  "level": "info",
  "message": "External API: Adzuna request",
  "query": "software engineer",
  "country": "us",
  "results_wanted": 25
}
```
```json
{
  "level": "info",
  "message": "External API: Adzuna response",
  "jobs_returned": 25,
  "response_time_ms": 450
}
```

**Remotive:**
```json
{
  "level": "info",
  "message": "External API: Remotive request",
  "query": "developer",
  "category": "software-dev"
}
```
```json
{
  "level": "info",
  "message": "External API: Remotive response",
  "jobs_returned": 15,
  "response_time_ms": 320
}
```

**JobSpy:**
```json
{
  "level": "info",
  "message": "External API: JobSpy request",
  "search_term": "engineer",
  "location": "remote",
  "results_wanted": 50
}
```
```json
{
  "level": "info",
  "message": "External API: JobSpy response",
  "jobs_returned": 42,
  "response_time_ms": 1200
}
```

**Arbeitnow:**
```json
{
  "level": "info",
  "message": "External API: Arbeitnow request",
  "query": "developer",
  "location": "remote"
}
```
```json
{
  "level": "info",
  "message": "External API: Arbeitnow response",
  "jobs_returned": 18,
  "response_time_ms": 280
}
```

---

### 12. Job Orchestrator Events (Dashboard: Job Search)

Generate 5-10 of these:

```json
{
  "level": "info",
  "message": "Job orchestrator: Using optimized fallback order",
  "adapters_selected": ["adzuna", "remotive", "arbeitnow"]
}
```

```json
{
  "level": "info",
  "message": "Job orchestrator: Deduplication complete",
  "before": 85,
  "after": 62,
  "duplicates_removed": 23
}
```

```json
{
  "level": "warn",
  "message": "Job orchestrator: Low results warning",
  "total_count": 5,
  "job_title": "Quantum Computing Engineer"
}
```

```json
{
  "level": "info",
  "message": "Job orchestrator: Calling adzuna fallback",
  "reason": "primary_api_failed"
}
```

---

### 13. Error Events (Dashboard: API Health)

Generate 3-5 of each type:

**Stripe Errors:**
```json
{
  "level": "error",
  "message": "Stripe webhook error",
  "error_message": "Invalid signature",
  "error_name": "SignatureVerificationError"
}
```

**OAuth Errors:**
```json
{
  "level": "error",
  "message": "OAuth login failed",
  "error_message": "Token expired",
  "route": "/auth/callback"
}
```

**API Errors:**
```json
{
  "level": "error",
  "message": "External API: Adzuna error",
  "error_message": "Rate limit exceeded",
  "status_code": 429
}
```

---

## Quick Test Script

Here's a Node.js script to send all test logs at once:

```typescript
// test-hyh-logs.ts
const LOGNOG_URL = process.env.LOGNOG_URL || 'https://logs.machinekinglabs.com';
const LOGNOG_API_KEY = process.env.LOGNOG_API_KEY;

const testLogs = [
  // Add all the JSON objects from above here
];

async function sendTestLogs() {
  const response = await fetch(`${LOGNOG_URL}/api/ingest/http`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': LOGNOG_API_KEY,
      'X-App-Name': 'hey-youre-hired',
      'X-Index': 'hey-youre-hired',
    },
    body: JSON.stringify(testLogs),
  });

  const result = await response.json();
  console.log('Sent test logs:', result);
}

sendTestLogs();
```

---

## Expected Log Counts

After generating test logs, you should have approximately:

| Event Type | Count |
|------------|-------|
| User signup completed | 10-20 |
| User login | 15-25 |
| Profile created | 8-12 |
| Checkout started | 5-10 |
| Subscription synced | 5-8 |
| Stripe webhook received | 5-10 |
| AI: Cover letter generated | 10-15 |
| AI: Career coach conversation | 5-10 |
| Job recommendations request | 15-25 |
| Extension: Autofill * | 10-20 |
| External API: * | 40-60 |
| Job orchestrator: * | 15-25 |
| Error events | 10-15 |
| **Total** | **~150-250** |

This will fully populate all 5 dashboards with realistic test data.
