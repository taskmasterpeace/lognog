# LogViewer Component - Visual Guide

This guide shows what the LogViewer component looks like in action.

## Component Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Header Bar                                                      │
│ 1,523 logs    3 expanded          [Collapse All]               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ▶ Dec 11, 14:30:45  [INFO]  web-server-01  nginx  GET /api... │
│  ▶ Dec 11, 14:28:12  [ERROR] web-server-01  nginx  Connection..│
│  ▼ Dec 11, 14:25:33  [WARNING] app-server-02  node  High mem...│
│     ┌──────────────────────────────────────────────────────┐   │
│     │ TIMESTAMP:    Dec 11, 14:25:33                       │   │
│     │ SEVERITY:     [WARNING] (yellow badge)               │   │
│     │ HOSTNAME:     app-server-02 ⮕ [Include|Exclude|Copy]│   │
│     │ APP_NAME:     node ⮕ [Include|Exclude|Copy]          │   │
│     │ MESSAGE:      High memory usage detected: 85% RAM    │   │
│     │                                                       │   │
│     │ ADDITIONAL FIELDS                                    │   │
│     │ memory_used_mb:   3400                               │   │
│     │ memory_total_mb:  4096                               │   │
│     │ memory_percent:   85                                 │   │
│     └──────────────────────────────────────────────────────┘   │
│  ▶ Dec 11, 14:22:15  [DEBUG]  monitoring-01  prometheus  Sc... │
│  ▶ Dec 11, 14:20:01  [CRITICAL] web-server-02  apache  Disk...│
│                                                                 │
│  ... (virtualized - only visible rows rendered)                │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Footer                                                          │
│ Click any row to expand. Hover over field values for actions.  │
└─────────────────────────────────────────────────────────────────┘
```

## Severity Color Scheme

### Emergency (0) / Alert (1) / Error (3)
```
▶ Dec 11, 14:28:12  [ERROR]  web-server-01  nginx  Connection...
                    ┗━━━━━┛
                     Red badge + red background when expanded
```

### Critical (2)
```
▶ Dec 11, 14:20:01  [CRITICAL]  web-server-02  apache  Disk...
                    ┗━━━━━━━━┛
                     Orange badge + orange background
```

### Warning (4)
```
▶ Dec 11, 14:25:33  [WARNING]  app-server-02  node  High mem...
                    ┗━━━━━━━┛
                     Yellow/Amber badge + amber background
```

### Notice (5) / Info (6)
```
▶ Dec 11, 14:30:45  [INFO]  web-server-01  nginx  GET /api...
                    ┗━━━━┛
                     Blue badge + blue background
```

### Debug (7)
```
▶ Dec 11, 14:22:15  [DEBUG]  monitoring-01  prometheus  Scrape...
                    ┗━━━━━┛
                     Gray badge + gray background
```

## Quick Actions Popup

When you hover over any field value:

```
hostname: web-server-01
          ┗━━━━━━━━━━━━━┛
          │
          ▼
     ┌─────────────────────────────────┐
     │ [+] Include  [-] Exclude  [📋] Copy │
     └─────────────────────────────────┘
```

### Include Action (Green)
Clicking adds: `hostname="web-server-01"` to your search query

### Exclude Action (Red)
Clicking adds: `hostname!="web-server-01"` to your search query

### Copy Action (Gray)
Copies `web-server-01` to clipboard
Shows "✓ Copied" for 2 seconds

## Search Term Highlighting

If `searchTerms={['error', 'refused']}`:

```
MESSAGE: Connection refused to database server
                ████████          (yellow highlight)
         ███████                  (yellow highlight)
```

Any occurrence of "error" or "refused" (case-insensitive) is highlighted in yellow.

## Timestamp with Relative Time

Hover over any timestamp to see relative time:

```
TIMESTAMP: Dec 11, 14:30:45
           ┗━━━━━━━━━━━━━┛
           │
           ▼
        ┌─────────┐
        │ 5m ago  │  (tooltip)
        └─────────┘
```

## Expanded Row - All Fields View

```
▼ Dec 11, 14:28:12  [ERROR]  web-server-01  nginx  Connection...
  ┌───────────────────────────────────────────────────────────┐
  │ PRIMARY FIELDS                                            │
  │ ─────────────────────────────────────────────────────── │
  │ TIMESTAMP:     Dec 11, 14:28:12 (hover: "7m ago")        │
  │ SEVERITY:      [ERROR] (red badge)                       │
  │ HOSTNAME:      web-server-01 ⮕ actions                   │
  │ APP_NAME:      nginx ⮕ actions                           │
  │ MESSAGE:       Connection refused to database server     │
  │                                                           │
  │ ADDITIONAL FIELDS                                        │
  │ ─────────────────────────────────────────────────────── │
  │ error:         ECONNREFUSED ⮕ actions                    │
  │ target_host:   db-primary.local ⮕ actions                │
  │ target_port:   5432 ⮕ actions                            │
  │ method:        GET ⮕ actions                             │
  │ path:          /api/users ⮕ actions                      │
  │ status_code:   500 ⮕ actions                             │
  └───────────────────────────────────────────────────────────┘
```

## Loading State

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                                                                 │
│                         ◌ (spinning)                            │
│                       Loading logs...                           │
│                                                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Empty State

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                                                                 │
│                         🔍 (alert icon)                         │
│                       No Logs Found                             │
│                                                                 │
│         No log entries match your search criteria.              │
│         Try adjusting your filters or time range.               │
│                                                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Integration with SearchPage

### View Toggle

In the SearchPage results area, users can switch views:

```
┌─────────────────────────────────────────────────────────────────┐
│ Results Area                                                    │
│ ─────────────────────────────────────────────────────────────── │
│                                                                 │
│ 1,523 results found        [Enhanced] [Table]  [Show SQL]      │
│                             ┗━━━━━━━┛  ┗━━━━━┛                 │
│                              Active    Inactive                 │
│                                                                 │
│  [Enhanced view shows LogViewer component]                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Filter Integration

When you click "Include" on a field value:

**Before:**
```
Search Query: search severity>=4
```

**After clicking "Include" on hostname="web-server-01":**
```
Search Query: search severity>=4 hostname="web-server-01"
                                 ┗━━━━━━━━━━━━━━━━━━━━━━━┛
                                      Auto-added
```

## Color Palette

### Severity Colors
- **Red** (#DC2626): Emergency, Alert, Error
- **Orange** (#EA580C): Critical
- **Amber** (#D97706): Warning
- **Blue** (#0284C7): Notice, Info
- **Slate** (#475569): Debug

### UI Colors
- **Background**: White (#FFFFFF)
- **Border**: Slate-200 (#E2E8F0)
- **Text**: Slate-900 (#0F172A)
- **Hover**: Slate-50 (#F8FAFC)

### Action Button Colors
- **Include**: Green (#059669)
- **Exclude**: Red (#DC2626)
- **Copy**: Slate (#475569)

### Highlight Color
- **Search Match**: Yellow (#FDE047)

## Typography

- **Headers**: Inter, 600 weight, slate-900
- **Body**: Inter, 400 weight, slate-700
- **Code/Logs**: Monospace, 400 weight, slate-600
- **Timestamps**: Monospace, 400 weight, slate-500

## Spacing

- Row height (collapsed): 60px
- Row height (expanded): Dynamic based on field count
- Padding: 16px (horizontal), 8px (vertical)
- Gap between elements: 8-12px

## Animations

1. **Expand/Collapse**: 200ms ease-out
2. **Quick Actions Popup**: Fade-in 150ms
3. **Hover Effects**: 200ms transition
4. **Copy Feedback**: 2s duration

## Responsive Behavior

### Desktop (> 1024px)
- Full width with all features
- Quick actions on hover
- All fields visible in expanded view

### Tablet (768px - 1024px)
- Optimized spacing
- Touch-friendly quick actions
- Horizontal scroll for long messages

### Mobile (< 768px)
- Stacked layout
- Tap to expand
- Quick actions on tap (no hover)
- Responsive field grid

## Accessibility

- **Keyboard Navigation**: Tab through expandable rows
- **Screen Readers**: ARIA labels for all interactive elements
- **Color Contrast**: WCAG AA compliant (4.5:1 minimum)
- **Focus Indicators**: Visible focus rings on all buttons

## Best Practices

### For Best Performance
1. Limit initial log count to 1000-5000 entries
2. Use pagination for larger datasets
3. Implement time-based filtering

### For Best UX
1. Provide clear search terms for highlighting
2. Use descriptive field names
3. Keep messages concise
4. Include relevant additional fields

### For Best Integration
1. Handle `onAddFilter` callback properly
2. Update search query in real-time
3. Show visual feedback when filters are added
4. Clear filters when appropriate

---

This visual guide demonstrates the professional, polished look and feel of the LogViewer component. It's designed to match the quality of enterprise logging solutions.
