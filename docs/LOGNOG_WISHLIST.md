# LogNog Feature Wishlist

Feature requests and improvement ideas for LogNog collected from Hey You're Hired dashboard usage.

---

## 1. Dashboard Organization

### Folders/Categories
- **Problem:** With multiple apps (Hey You're Hired, Directors Palette, etc.), dashboards become cluttered
- **Solution:** Add folder structure or categories to organize dashboards
  - Group by app: `Hey You're Hired/`, `Directors Palette/`, `System/`
  - Or use tags/labels for filtering

### App Scope Filter
- **Problem:** Dashboards have `app_scope` but no UI to filter by it
- **Solution:** Add dropdown to filter dashboard list by `app_scope`
  - "All Apps"
  - "hey-youre-hired"
  - "directors-palette"
  - etc.

---

## 2. Dashboard Branding

### Logo Support ✅ IMPLEMENTED
- Dashboards now support `logo_url` field
- Logo displays in dashboard header

### Color Customization ✅ IMPLEMENTED
- `accent_color` for UI highlights
- `header_color` for dashboard header background

### Future Ideas
- Favicon per dashboard
- Custom fonts
- Theme presets (light/dark per dashboard)

---

## 3. Combined/Multi-Dashboard Views

### Problem
- Metrics spread across multiple dashboards
- Have to switch between "API Health" and "Feature Usage" constantly
- Want to see key panels from different dashboards side-by-side

### Solution: Dashboard Composer
- Create "Combined Views" that pull panels from multiple dashboards
- Drag-and-drop panels from different sources
- Save as new composite dashboard
- Real-time updates from original panels

### Alternative: Panel Linking
- Pin frequently-used panels to a sidebar
- Quick-access to key metrics without full dashboard switch

---

## 4. Time Controls

### Current Issues
- Limited time range presets
- No quick "last N hours/minutes/days" selector

### Requested Features
- **Quick Presets:**
  - Last 15 minutes
  - Last 1 hour
  - Last 6 hours
  - Last 24 hours
  - Last 7 days
  - Last 30 days
  - Custom range

- **Relative Time Input:**
  - "15m" = 15 minutes
  - "2h" = 2 hours
  - "7d" = 7 days
  - "1w" = 1 week

- **Time Zone Handling:**
  - Display times in user's local timezone
  - Option to view in UTC

---

## 5. DSL Improvements

### Bugs Fixed (Jan 2025)
- ✅ `level=error` now converts to `severity=3` (numeric)
- ✅ `count()` without field generates `count` alias (not `count_all`)
- ✅ Severity comparisons work (>=, <=, etc.)

### Requested Additions
- `eval` command with `case()` function support
- More aggregation functions:
  - `earliest(field)` - first value by time
  - `latest(field)` - last value by time
  - `values(field)` - unique values as array
- Field aliases in `table` command
- Computed fields

---

## 6. Dashboard Import/Export

### Current State
- JSON export works
- Manual import via API
- Sync script exists but requires local DB

### Requested Features
- **UI Import:** Upload JSON file in dashboard list
- **Version History:** Track dashboard changes over time
- **Templates:** Share dashboards as templates
- **Backup/Restore:** One-click full backup

---

## 7. Alerting (Future)

### Basic Alerts
- Threshold-based: "Alert when error count > 10 in 1 hour"
- Pattern-based: "Alert when 'payment failed' appears"

### Notification Channels
- Email
- Slack
- Webhook

---

## Priority Order

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| 1 | Time control presets | Low | High |
| 2 | App scope filter | Low | Medium |
| 3 | Dashboard folders | Medium | High |
| 4 | UI Import | Low | Medium |
| 5 | Combined views | High | High |
| 6 | Alerting | High | High |

---

*Last updated: 2026-01-23*
