# Variable Templating Implementation Summary

## Overview

Implemented Splunk-style variable templating for LogNog alerts, allowing dynamic substitution of query results and alert metadata into email subjects, bodies, and webhook payloads.

## Changes Made

### 1. Backend (API)

#### File: `api/src/services/alerts.ts`

**New Functions:**

1. **`substituteVariables()`** - Main substitution engine
   - Supports `{{variable}}` syntax
   - Handles alert metadata: `alert_name`, `alert_severity`, `result_count`, `timestamp`
   - Handles result fields: Direct access (e.g., `{{hostname}}`)
   - Handles prefixed access: `{{result.field}}`
   - Handles indexed access: `{{result[0].field}}`
   - Handles nested fields: `{{result.nested.field}}`
   - Graceful fallback: Unknown variables remain unchanged

2. **`getNestedValue()`** - Helper for dot-notation field access
   - Traverses nested objects using dot notation
   - Returns `undefined` for missing paths

**Modified Functions:**

1. **`executeEmailAction()`**
   - Added variable substitution for email subject and body
   - Creates `alertMetadata` object with context
   - Substitutes variables before sending email

2. **`executeWebhookAction()`**
   - Added variable substitution for webhook payload
   - Supports custom payload templates with full variable support
   - Maintains backward compatibility with default payload

3. **`evaluateAlert()`**
   - Updated agent notification creation to use variable substitution
   - Notification title and message now support variables

### 2. Frontend (UI)

#### New Component: `ui/src/components/VariableHelper.tsx`

**Features:**
- Dropdown helper showing all available variables
- Organized by category:
  - Alert Metadata
  - Result Fields
  - Aggregated Fields (stats)
  - Advanced Access Patterns
- Click-to-copy functionality
- Direct insertion into text fields via refs
- Collapsible sections for easy browsing
- Examples and descriptions for each variable
- Tips section with usage guidelines

**UI Elements:**
- Button with "Variable Helper" label
- Popup modal with categorized variables
- Hover effects and copy indicators
- Dark mode support

#### Modified Component: `ui/src/pages/AlertsPage.tsx`

**Changes:**

1. **New Imports:**
   - Added `useRef` from React
   - Imported `VariableHelper` component

2. **New Refs:**
   - `emailSubjectRefs` - For email subject inputs
   - `emailBodyRefs` - For email body textareas
   - `webhookPayloadRefs` - For webhook payload textareas

3. **New Function:**
   - `insertVariableIntoField()` - Inserts variable at cursor position
   - Maintains cursor position after insertion
   - Triggers change events to update form state

4. **Enhanced Email Action UI:**
   - Added "Subject" field with variable support
   - Added "Body" field with variable support
   - Placed `VariableHelper` button next to each field
   - Added helpful placeholders with example variables
   - Improved labeling and layout

5. **Enhanced Webhook Action UI:**
   - Added "Custom Payload" textarea
   - Added `VariableHelper` button
   - Example JSON with variables in placeholder
   - Better organization with labels

### 3. Documentation

#### New File: `docs/ALERT-VARIABLES.md`

Comprehensive documentation covering:
- Overview of variable templating
- Available variables (metadata, fields, stats)
- Advanced access patterns
- Usage examples
- Integration examples (Slack, Teams, PagerDuty)
- Best practices
- Quick reference guide

#### New File: `docs\VARIABLE-TEMPLATING-IMPLEMENTATION.md`

This file - technical implementation details for developers.

### 4. Tests

#### New File: `api/src/services/alerts.test.ts`

Test coverage for:
- Alert metadata variable substitution
- Result field substitution
- Prefixed access (`result.field`)
- Indexed access (`result[N].field`)
- Nested field access
- Missing variable handling
- Empty results handling
- Email and webhook template examples
- Multiple occurrences of same variable
- Whitespace handling
- Numeric values

## Supported Variable Patterns

### 1. Alert Metadata
```
{{alert_name}}
{{alert_severity}}
{{result_count}}
{{timestamp}}
```

### 2. Direct Field Access
```
{{hostname}}
{{app_name}}
{{severity}}
{{message}}
{{source_ip}}
{{user}}
```

### 3. Stats Aggregations
```
{{count}}
{{sum}}
{{avg}}
{{max}}
{{min}}
```

### 4. Explicit Result Access
```
{{result.hostname}}
{{result.app_name}}
```

### 5. Indexed Result Access
```
{{result[0].hostname}}
{{result[1].hostname}}
{{result[2].hostname}}
```

### 6. Nested Field Access
```
{{result.metadata.server.name}}
{{result.http.request.method}}
```

## Example Usage

### Email Alert Subject
**Input:**
```
High Error Rate on {{hostname}} - {{result_count}} errors
```

**Output:**
```
High Error Rate on web-01 - 150 errors
```

### Email Alert Body
**Input:**
```
Alert: {{alert_name}}
Severity: {{alert_severity}}
Host: {{hostname}}
Count: {{result_count}}
```

**Output:**
```
Alert: High Error Rate
Severity: CRITICAL
Host: web-01
Count: 150
```

### Webhook Payload
**Input:**
```json
{
  "alert": "{{alert_name}}",
  "severity": "{{alert_severity}}",
  "host": "{{hostname}}",
  "count": {{result_count}}
}
```

**Output:**
```json
{
  "alert": "High Error Rate",
  "severity": "CRITICAL",
  "host": "web-01",
  "count": 150
}
```

## Technical Details

### Variable Substitution Algorithm

1. **Parse Template:**
   - Find all `{{...}}` patterns using regex
   - Extract variable path

2. **Resolve Variable:**
   - Check if it's alert metadata
   - Check if it's a direct field
   - Check if it's prefixed with `result.`
   - Check if it's indexed `result[N].`
   - Use nested value resolution for dot notation

3. **Replace:**
   - If found: Convert to string and replace
   - If not found: Keep original `{{variable}}`

4. **Return:**
   - Return fully substituted text

### Field Resolution Priority

1. Alert metadata (`alert_name`, etc.)
2. Prefixed result access (`result.field`)
3. Indexed result access (`result[N].field`)
4. Direct field access from first result

### Error Handling

- **Missing variables:** Preserved as-is (no error thrown)
- **Empty results:** Alert metadata still works, field access returns original
- **Invalid index:** Original variable preserved
- **Nested path not found:** Original variable preserved

## Backward Compatibility

All changes are backward compatible:
- Email actions without subject/body use defaults
- Webhook actions without payload use default structure
- Existing alerts continue to work as before
- Variable substitution is opt-in (only applied when variables present)

## Security Considerations

1. **Server-side only:** Variable substitution happens server-side
2. **No code execution:** Simple string replacement, no eval/exec
3. **Sanitization:** Values converted to strings safely
4. **Injection prevention:** JSON payloads should be validated by receiving service

## Future Enhancements

Possible additions:
1. **Formatting functions:** `{{count | number}}`, `{{timestamp | date}}`
2. **Conditional logic:** `{{#if severity > 3}}CRITICAL{{/if}}`
3. **Loops:** `{{#each results}}{{hostname}}{{/each}}`
4. **Math operations:** `{{count * 2}}`
5. **String operations:** `{{upper(hostname)}}`
6. **Custom variables:** User-defined global variables

## Testing

Run tests:
```bash
cd api
npm run test -- alerts.test.ts
```

## UI Screenshots

### Variable Helper Button
Located next to each text field that supports variables.

### Variable Helper Popup
Shows categorized list of available variables with:
- Description
- Example value
- Copy button
- Tips section

### Email Action Configuration
- Recipient email
- Subject with Variable Helper
- Body with Variable Helper
- Examples in placeholders

### Webhook Action Configuration
- URL
- HTTP Method
- Custom Payload with Variable Helper
- JSON example in placeholder

## Migration Guide

For existing alerts:

1. **Email alerts:** Add subject/body with variables to customize notifications
2. **Webhook alerts:** Add custom payload to include specific fields
3. **Test first:** Use "Test Alert" button to verify variable resolution
4. **Check fields:** Use Variable Helper to see available fields

## Support

For questions or issues:
- See: `docs/ALERT-VARIABLES.md`
- Examples: `docs/ALERT-VARIABLES.md` (Integration Examples section)
- Tests: `api/src/services/alerts.test.ts`
