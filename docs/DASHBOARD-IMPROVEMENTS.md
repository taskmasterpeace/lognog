# LogNog Dashboard Improvement Plan

> Making dashboards the killer feature that sells LogNog

---

## Executive Summary

The dashboard is LogNog's most visible feature and the primary interface for users to derive value from their logs. This plan outlines a comprehensive strategy to make LogNog dashboards not just competitive with Splunk, but **better** - especially for the homelab and SMB market.

**Key Differentiators We'll Build:**
- Dashboard branding (logos, colors per application)
- AI-powered insights (via local Ollama)
- One-click drilldown to search
- Homelab-specific dashboard templates
- Guest sharing without login
- Mobile-first responsive design

---

## Part 1: Current State Analysis

### What We Have (7 Visualization Types)
| Type | Status | Notes |
|------|--------|-------|
| Table | Working | Limited to 100 rows, no pagination |
| Bar Chart | Working | Click handler exists but unwired |
| Pie Chart | Working | Basic implementation |
| Line/Area | Working | Time series with brush selection (unused) |
| Single Stat | Working | Large number display |
| Heatmap | Working | Built but not exposed in panel editor |
| Gauge | Working | Built but limited exposure |

### Database Schema (Already Supports Grid Layout!)
```sql
CREATE TABLE dashboard_panels (
  position_x INTEGER DEFAULT 0,  -- UNUSED by UI
  position_y INTEGER DEFAULT 0,  -- UNUSED by UI
  width INTEGER DEFAULT 6,       -- UNUSED by UI
  height INTEGER DEFAULT 4,      -- UNUSED by UI
);
```
**Good news:** We can enable drag-and-drop without database changes!

### Current Gaps
| Gap | Impact | Severity |
|-----|--------|----------|
| No drilldown | Users can't explore data | Critical |
| No dashboard variables | Can't filter dynamically | Critical |
| Fixed grid layout | Can't customize layout | High |
| No branding/logos | Can't personalize | High |
| No guest sharing | Can't share publicly | Medium |
| No PDF export | Can't send reports | Medium |
| Position fields ignored | Layout system unused | Medium |
| No threshold lines | Can't show alert levels | Low |

### Existing Click Handlers (Unused)
```typescript
// BarChart.tsx - onBarClick exists but never connected
onClick?: (data: any) => void;

// TimeSeriesChart.tsx - onBrushEnd for time range
onBrushEnd?: (range: { start: number; end: number }) => void;
```

---

## Part 2: Features to Beat Splunk

### Splunk Dashboard Features (Must Have)

| Feature | Splunk | LogNog Current | Priority |
|---------|--------|----------------|----------|
| Dashboard Variables | Yes ($token$) | No | P0 |
| Drilldown Navigation | Yes | No | P0 |
| Input Controls | Dropdown, text, time | No | P1 |
| Cascading Inputs | Yes | No | P2 |
| PDF Export | Yes | No | P1 |
| Scheduled Reports | Yes | No | P2 |
| Guest Sharing | Yes (embed) | No | P1 |
| Trellis Layout | Yes | No | P3 |
| Dark/Light Mode | Yes | Yes (partial) | Done |

### Where We Can Beat Splunk

| Advantage | Why It Matters |
|-----------|----------------|
| **Branding/Logos** | Splunk doesn't do per-dashboard branding - we can! |
| **AI Insights** | Local Ollama integration - Splunk requires cloud |
| **Homelab Templates** | Pre-built dashboards for pfSense, Ubiquiti, etc. |
| **One-Click Setup** | Docker-compose vs enterprise deployment |
| **No License Limits** | Splunk's 500MB/day dev license is a joke |
| **Mobile-First** | Splunk mobile is an afterthought |

---

## Part 3: Grafana UX Patterns to Adopt

### Layout System
- **react-grid-layout** - Industry standard for drag-and-drop
- 12-column grid system
- Responsive breakpoints (lg, md, sm)
- Panel resize handles

### Dashboard Variables
```
Variable: $hostname
Type: Query
Query: search | stats count by hostname | table hostname
Display: Dropdown
Multi-select: Yes

Usage in panels:
search hostname=$hostname severity>=warning
```

### Drilldown Pattern
```typescript
// Click on bar → Navigate to search
onBarClick={(data) => {
  navigate(`/search?query=${encodeURIComponent(
    `search hostname="${data.hostname}" | table timestamp message`
  )}`);
}}
```

### Time Range Sync
- All panels respect global time picker
- Brush selection on one chart updates all charts
- URL state preservation for sharing

---

## Part 4: Innovative Features (Differentiators)

### 1. Dashboard Branding (User Request)
```typescript
interface DashboardBranding {
  logo_url?: string;           // Custom logo image
  logo_position: 'left' | 'center' | 'right';
  accent_color?: string;       // Highlight color
  header_background?: string;  // Header bg color
  description?: string;        // Dashboard description
}
```

**Use Cases:**
- Game server dashboard with Minecraft logo
- Network dashboard with pfSense logo
- Customer-facing dashboards with company branding
- Team dashboards with team icons

### 2. AI-Powered Insights Panel (via Ollama)
```
┌─────────────────────────────────────────────────────────┐
│  🤖 AI Insights                          [Refresh] [?] │
├─────────────────────────────────────────────────────────┤
│  Based on the last 24 hours:                           │
│                                                         │
│  📈 Unusual spike in failed logins at 3am (47 vs avg 5)│
│  ⚠️ web-server-03 has 3x more errors than siblings     │
│  🔄 Nginx restarts increased (was 0, now 4 this week)  │
│                                                         │
│  [Investigate spike] [Create alert] [Dismiss]          │
└─────────────────────────────────────────────────────────┘
```

### 3. Natural Language Query Builder
```
User types: "show me errors from the last hour grouped by server"

AI generates: search severity>=error
              | stats count by hostname
              | sort desc count
```

### 4. Homelab Dashboard Packs
Pre-built dashboards with one-click import:

| Pack | Panels | Source |
|------|--------|--------|
| **pfSense Security** | Firewall blocks, VPN logins, Top blocked IPs | Syslog |
| **Ubiquiti Network** | Client connections, AP health, Bandwidth | Syslog |
| **Minecraft Server** | Player count, Join/leave, Errors, Chat | Agent |
| **Docker Overview** | Container status, Restarts, Resource usage | Agent |
| **Windows Security** | Login failures, Account changes, Audit events | Agent |

### 5. Guest Dashboard Sharing
```
Share Link: https://lognog.local/d/abc123?guest=true
- No login required
- Read-only view
- Optional password protection
- Expiration date
- Watermark with "Powered by LogNog"
```

### 6. Anomaly Highlighting
Automatically color data points that deviate from baseline:
- Normal values: Default color
- +2 std dev: Yellow highlight
- +3 std dev: Red highlight
- Click anomaly → See AI explanation

### 7. Dashboard Annotations
Click on any point in time to add a note:
```
┌─────────────────────────────────────────────────────────┐
│  📝 Annotation at 2025-01-13 03:45:00                  │
│  "Deployed v2.3.1 - explains the brief error spike"    │
│  Added by: admin                                        │
└─────────────────────────────────────────────────────────┘
```

### 8. Mobile Dashboard Mode
- Swipe between panels
- Pull-to-refresh
- Optimized touch targets
- Condensed stat displays

---

## Part 5: Technical Implementation Plan

### Phase 1: Foundation (Week 1-2)
| Task | Effort | Description |
|------|--------|-------------|
| **Enable Grid Layout** | 2-3 days | Wire up react-grid-layout with existing position fields |
| **Panel Drilldown** | 2-3 days | Connect chart clicks to search navigation |
| **Table Pagination** | 1 day | Add proper paging to table visualization |
| **Expose Heatmap** | 1 day | Add heatmap option to panel editor |

### Phase 2: Variables & Inputs (Week 2-3)
| Task | Effort | Description |
|------|--------|-------------|
| **Dashboard Variables** | 3-5 days | Token system with dropdown/text inputs |
| **Variable in Queries** | 2 days | Parse $variable$ in DSL queries |
| **Cascading Inputs** | 2-3 days | One dropdown filters another's options |
| **URL State** | 1 day | Variables in URL for sharing |

### Phase 3: Branding & Sharing (Week 3-4)
| Task | Effort | Description |
|------|--------|-------------|
| **Dashboard Branding** | 2-3 days | Logo, colors, description fields |
| **Logo Upload** | 1 day | Image upload and storage |
| **Guest Sharing** | 2-3 days | Public links with optional password |
| **PDF Export** | 2-3 days | Server-side rendering with Puppeteer |

### Phase 4: AI Features (Week 4-5)
| Task | Effort | Description |
|------|--------|-------------|
| **Ollama Integration** | 2-3 days | Local LLM connection |
| **AI Insights Panel** | 3-5 days | Automated analysis and suggestions |
| **Natural Language Query** | 3-5 days | Text → DSL conversion |
| **Anomaly Detection** | 3-5 days | Statistical baseline + highlighting |

### Phase 5: Templates & Polish (Week 5-6)
| Task | Effort | Description |
|------|--------|-------------|
| **Dashboard Templates** | 3-5 days | Pre-built homelab dashboards |
| **Dashboard Import/Export** | 2 days | JSON export, one-click import |
| **Mobile Optimization** | 2-3 days | Responsive improvements |
| **Annotations** | 2-3 days | Time-based notes on dashboards |

---

## Part 6: Database Schema Changes

### New Tables Needed

```sql
-- Dashboard variables
CREATE TABLE dashboard_variables (
  id TEXT PRIMARY KEY,
  dashboard_id TEXT NOT NULL,
  name TEXT NOT NULL,           -- e.g., "hostname"
  label TEXT,                   -- e.g., "Select Host"
  type TEXT DEFAULT 'query',    -- query, custom, textbox, interval
  query TEXT,                   -- DSL query for options
  default_value TEXT,
  multi_select INTEGER DEFAULT 0,
  include_all INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE
);

-- Dashboard branding
ALTER TABLE dashboards ADD COLUMN logo_url TEXT;
ALTER TABLE dashboards ADD COLUMN accent_color TEXT;
ALTER TABLE dashboards ADD COLUMN header_color TEXT;
ALTER TABLE dashboards ADD COLUMN is_public INTEGER DEFAULT 0;
ALTER TABLE dashboards ADD COLUMN public_token TEXT;
ALTER TABLE dashboards ADD COLUMN public_password TEXT;
ALTER TABLE dashboards ADD COLUMN public_expires_at TEXT;

-- Dashboard annotations
CREATE TABLE dashboard_annotations (
  id TEXT PRIMARY KEY,
  dashboard_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3B82F6',
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE
);

-- Dashboard templates
CREATE TABLE dashboard_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,                -- 'network', 'security', 'game-server', etc.
  thumbnail_url TEXT,
  template_json TEXT NOT NULL,  -- Full dashboard JSON
  required_sources TEXT,        -- JSON array of required source types
  downloads INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

---

## Part 7: UI Component Architecture

### New Components Needed

```
ui/src/components/
├── dashboard/
│   ├── DashboardGrid.tsx           # react-grid-layout wrapper
│   ├── DashboardHeader.tsx         # Title, logo, description
│   ├── DashboardVariables.tsx      # Variable dropdowns bar
│   ├── DashboardShareModal.tsx     # Guest sharing settings
│   ├── DashboardBrandingModal.tsx  # Logo/color settings
│   ├── DashboardExportModal.tsx    # JSON/PDF export
│   └── PanelDrilldown.tsx          # Drilldown configuration
├── inputs/
│   ├── VariableDropdown.tsx        # Single variable dropdown
│   ├── VariableMultiSelect.tsx     # Multi-select variable
│   ├── VariableTextbox.tsx         # Text input variable
│   └── VariableTimeRange.tsx       # Time picker variable
├── ai/
│   ├── AIInsightsPanel.tsx         # AI insights visualization
│   ├── NaturalLanguageInput.tsx    # NL to DSL converter
│   └── AnomalyHighlight.tsx        # Anomaly marker component
└── templates/
    ├── TemplateGallery.tsx         # Browse templates
    ├── TemplateCard.tsx            # Single template preview
    └── TemplateImportModal.tsx     # Import confirmation
```

### Grid Layout Integration

```typescript
// DashboardGrid.tsx
import GridLayout from 'react-grid-layout';

const layout = panels.map(panel => ({
  i: panel.id,
  x: panel.position_x,
  y: panel.position_y,
  w: panel.width,
  h: panel.height,
  minW: 2,
  minH: 2,
}));

<GridLayout
  layout={layout}
  cols={12}
  rowHeight={100}
  onLayoutChange={(newLayout) => saveLayout(newLayout)}
  draggableHandle=".panel-header"
  isResizable={editMode}
  isDraggable={editMode}
>
  {panels.map(panel => (
    <div key={panel.id}>
      <Panel {...panel} onDrilldown={handleDrilldown} />
    </div>
  ))}
</GridLayout>
```

---

## Part 8: Priority Matrix

### P0 - Must Have (Blocks Adoption)
| Feature | Effort | Impact |
|---------|--------|--------|
| Drilldown Navigation | 2-3 days | Users can't explore without it |
| Dashboard Variables | 3-5 days | Core interactivity feature |
| Grid Layout | 2-3 days | Layout customization expected |

### P1 - Should Have (Key Differentiators)
| Feature | Effort | Impact |
|---------|--------|--------|
| Dashboard Branding | 2-3 days | Unique selling point |
| Guest Sharing | 2-3 days | Viral growth potential |
| PDF Export | 2-3 days | Enterprise requirement |
| Homelab Templates | 3-5 days | Immediate value for target market |

### P2 - Nice to Have (Delight Features)
| Feature | Effort | Impact |
|---------|--------|--------|
| AI Insights | 3-5 days | Wow factor, differentiator |
| Natural Language Query | 3-5 days | Accessibility for non-technical |
| Annotations | 2-3 days | Team collaboration |
| Anomaly Highlighting | 3-5 days | Proactive alerting |

### P3 - Future (Post-Launch)
| Feature | Effort | Impact |
|---------|--------|--------|
| Mobile App | 2-3 weeks | Mobile users |
| Dashboard Marketplace | 1-2 weeks | Community contributions |
| Scheduled Reports | 3-5 days | Automation |
| Trellis Layout | 3-5 days | Advanced visualization |

---

## Part 9: Success Metrics

### User Engagement
- Dashboards created per user
- Time spent on dashboard page
- Panels per dashboard (avg)
- Variable usage rate

### Feature Adoption
- % dashboards with custom branding
- % dashboards shared publicly
- Template download count
- AI insights interaction rate

### Comparative
- Time to first dashboard (vs Splunk)
- Dashboard creation time (vs Grafana)
- User satisfaction score

---

## Part 10: Implementation Roadmap

```
Week 1: Foundation
├── Day 1-2: Enable react-grid-layout
├── Day 3-4: Implement drilldown navigation
└── Day 5: Table pagination + expose heatmap

Week 2: Variables
├── Day 1-2: Dashboard variable schema + API
├── Day 3-4: Variable UI components
└── Day 5: Variable parsing in DSL

Week 3: Branding & Sharing
├── Day 1-2: Dashboard branding UI
├── Day 3: Logo upload functionality
├── Day 4-5: Guest sharing implementation

Week 4: Export & Templates
├── Day 1-2: PDF export (Puppeteer)
├── Day 3-4: Dashboard template system
└── Day 5: Create 5 homelab templates

Week 5: AI Features
├── Day 1-2: Ollama integration
├── Day 3-4: AI insights panel
└── Day 5: Natural language query (basic)

Week 6: Polish & Launch
├── Day 1-2: Mobile optimization
├── Day 3: Annotations
├── Day 4: Documentation
└── Day 5: Testing & bug fixes
```

---

## Appendix A: Homelab Dashboard Templates

### 1. pfSense Security Dashboard
```json
{
  "name": "pfSense Security Overview",
  "panels": [
    {"title": "Firewall Blocks (24h)", "query": "search app_name=filterlog action=block | stats count", "viz": "stat"},
    {"title": "Blocks by Hour", "query": "search app_name=filterlog action=block | timechart count", "viz": "line"},
    {"title": "Top Blocked IPs", "query": "search app_name=filterlog action=block | stats count by src_ip | sort desc count | limit 10", "viz": "bar"},
    {"title": "VPN Connections", "query": "search app_name=openvpn message~\"connected\" | stats count by user", "viz": "pie"},
    {"title": "Recent Blocks", "query": "search app_name=filterlog action=block | table timestamp src_ip dst_port", "viz": "table"}
  ]
}
```

### 2. Minecraft Server Dashboard
```json
{
  "name": "Minecraft Server Stats",
  "logo": "minecraft-logo.png",
  "panels": [
    {"title": "Players Online", "query": "search source_type=minecraft message~\"joined\" | stats dc(player)", "viz": "stat"},
    {"title": "Player Activity", "query": "search source_type=minecraft | timechart count by event_type", "viz": "area"},
    {"title": "Most Active Players", "query": "search source_type=minecraft | stats count by player | sort desc count | limit 10", "viz": "bar"},
    {"title": "Server Errors", "query": "search source_type=minecraft severity>=error | stats count", "viz": "stat"},
    {"title": "Recent Events", "query": "search source_type=minecraft | table timestamp player event message", "viz": "table"}
  ]
}
```

### 3. Docker Container Health
```json
{
  "name": "Docker Overview",
  "panels": [
    {"title": "Running Containers", "query": "search source_type=docker status=running | stats dc(container)", "viz": "stat"},
    {"title": "Container Restarts", "query": "search source_type=docker event=restart | stats count by container", "viz": "bar"},
    {"title": "Error Rate by Container", "query": "search source_type=docker severity>=error | stats count by container", "viz": "pie"},
    {"title": "Recent Container Events", "query": "search source_type=docker | table timestamp container event message", "viz": "table"}
  ]
}
```

---

## Appendix B: Splunk-to-LogNog Dashboard Migration

For users migrating from Splunk, we should provide:

1. **Dashboard JSON Converter** - Parse Splunk SimpleXML, output LogNog JSON
2. **Query Translator** - Convert SPL to LogNog DSL (best effort)
3. **Migration Guide** - Step-by-step documentation

---

## Conclusion

This plan positions LogNog dashboards as a **key differentiator** rather than a checkbox feature. By focusing on:

1. **Branding** - Something Splunk doesn't do
2. **AI Integration** - Local-first, privacy-respecting
3. **Homelab Focus** - Pre-built templates for our audience
4. **Ease of Use** - One-click drilldown, natural language

We can make the dashboard experience not just competitive, but **better** for our target market.

---

*Last updated: 2025-01-13*
*By Machine King Labs*
