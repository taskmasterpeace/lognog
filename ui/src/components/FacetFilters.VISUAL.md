# FacetFilters Visual Reference

This document shows what the FacetFilters component looks like when rendered.

## Visual Layout

```
┌─────────────────────────────────────┐
│  FILTERS          Clear All         │  ← Header (slate-50 background)
│  2 filters active                   │
├─────────────────────────────────────┤
│  ▼ Severity               [2]       │  ← Panel header (collapsible)
│  ┌───────────────────────────────┐  │
│  │ ☑ Emergency            5      │  │  ← Selected (blue background)
│  │ ☐ Alert               12      │  │
│  │ ☑ Critical            23      │  │  ← Selected (blue background)
│  │ ☐ Error              145      │  │
│  │ ☐ Warning            342      │  │
│  │ ☐ Notice              89      │  │
│  │ ☐ Info             1,234      │  │
│  │ ☐ Debug              567      │  │
│  └───────────────────────────────┘  │
├─────────────────────────────────────┤
│  ▼ Host                              │
│  ┌───────────────────────────────┐  │
│  │ ☐ web-server-01      523      │  │
│  │ ☐ web-server-02      498      │  │
│  │ ☐ db-server-01       234      │  │
│  │ ☐ cache-server-01    189      │  │
│  │ ☐ app-server-01      156      │  │
│  │ ☐ app-server-02      143      │  │
│  │ ☐ lb-server-01        98      │  │
│  │ ☐ proxy-server-01     76      │  │
│  │ ☐ queue-server-01     54      │  │
│  │ ☐ monitor-server-01   32      │  │
│  └───────────────────────────────┘  │
├─────────────────────────────────────┤
│  ▼ App Name                          │
│  ┌───────────────────────────────┐  │
│  │ ☐ nginx              823      │  │
│  │ ☐ postgresql         456      │  │
│  │ ☐ redis              234      │  │
│  │ ☐ node-api           198      │  │
│  │ ☐ react-ui           167      │  │
│  │ ☐ docker             145      │  │
│  │ ☐ systemd             98      │  │
│  │ ☐ sshd                76      │  │
│  │ ☐ cron                43      │  │
│  │ ☐ kernel              21      │  │
│  └───────────────────────────────┘  │
├─────────────────────────────────────┤
│  Showing top 10 values per field    │  ← Footer
└─────────────────────────────────────┘
```

## Collapsed State

When a panel is collapsed, it shows:

```
┌─────────────────────────────────────┐
│  ▶ Severity               [2]       │  ← Chevron points right, badge shows count
│  ▼ Host                              │  ← Expanded
│  ┌───────────────────────────────┐  │
│  │ ☐ web-server-01      523      │  │
│  │ ...                            │  │
```

## Severity Panel Special Formatting

The severity panel shows colored badges:

```
☑ [Emergency]     5   ← Red badge (bg-red-50, text-red-700)
☐ [Alert]        12   ← Orange badge
☑ [Critical]     23   ← Amber badge
☐ [Error]       145   ← Yellow badge
☐ [Warning]     342   ← Lime badge
☐ [Notice]       89   ← Green badge
☐ [Info]      1,234   ← Emerald badge
☐ [Debug]       567   ← Cyan badge
```

## Color Scheme

- **Background**: White (`bg-white`)
- **Border**: Slate-200 (`border-slate-200`)
- **Header**: Slate-50 background (`bg-slate-50`)
- **Selected items**: Sky-100 background (`bg-sky-100`)
- **Hover**: Slate-100 background (`hover:bg-slate-100`)
- **Text**: Slate-700 for labels, Slate-500 for counts
- **Accent**: Sky-600 for buttons and selected state

## Interactive States

1. **Hover over checkbox item**: Background changes to slate-100 (or sky-200 if selected)
2. **Click checkbox**: Toggles selection, calls `onFilterChange` callback
3. **Hover over panel header**: Chevron color changes from slate-400 to slate-600
4. **Click "Clear All"**: Removes all selections, button only visible when filters active
5. **Click panel header**: Toggles expand/collapse state

## Responsive Behavior

- Fixed width of 256px (w-64) recommended for sidebar
- Height fills parent container (h-full)
- Scrollable content area (overflow-y-auto)
- Long values are truncated with ellipsis
- Counts use tabular numbers for alignment

## Empty State

When no facets are provided:

```
┌─────────────────────────────────────┐
│  FILTERS                             │
├─────────────────────────────────────┤
│                                      │
│    Run a search to see filters      │
│                                      │
└─────────────────────────────────────┘
```

## Usage in Layout

Typical integration in a search page:

```
┌──────────┬─────────────────────────────────────┐
│          │  Search Bar                         │
│          ├─────────────────────────────────────┤
│ Facet    │                                     │
│ Filters  │  Search Results                     │
│          │                                     │
│ (256px)  │  Table or Log Viewer                │
│          │                                     │
│          │                                     │
└──────────┴─────────────────────────────────────┘
```
