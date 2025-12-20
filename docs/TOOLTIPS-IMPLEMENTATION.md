# Tooltips and Quality of Life UI Improvements

This document describes the implementation of floating-ui tooltips and UI enhancements throughout LogNog.

## Overview

Added comprehensive tooltips and inline help throughout the application to improve user experience and reduce learning curve. All tooltips are theme-aware (dark/light mode), use smooth animations, and position intelligently to avoid viewport edges.

## Dependencies Installed

```bash
npm install @floating-ui/react
```

## New Components

### 1. Tooltip Component (`ui/src/components/ui/Tooltip.tsx`)

Reusable tooltip component built with `@floating-ui/react`.

**Features:**
- Intelligent positioning with automatic flip and shift
- Smooth fade-in animations
- Arrow pointing to trigger element
- Configurable placement (top, bottom, left, right, etc.)
- Configurable delay and max width
- Hover and focus triggers
- Theme-aware styling (dark/light mode)

**Usage:**
```tsx
import { Tooltip } from '../components/ui/Tooltip';

<Tooltip content="Help text here" placement="top">
  <button>Hover me</button>
</Tooltip>
```

### 2. TooltipWithCode Component

Extended tooltip that can display both description and code examples.

**Usage:**
```tsx
import { TooltipWithCode } from '../components/ui/Tooltip';

<TooltipWithCode
  content="DSL query syntax explanation"
  code="search severity<=3
search host=web* app_name='nginx'"
  placement="bottom"
>
  <input type="text" />
</TooltipWithCode>
```

### 3. InfoTip Component (`ui/src/components/ui/InfoTip.tsx`)

Small (?) icon button that displays help on hover.

**Usage:**
```tsx
import { InfoTip } from '../components/ui/InfoTip';

<label className="flex items-center gap-2">
  Field Name
  <InfoTip
    content="Explanation of this field"
    placement="right"
  />
</label>
```

### 4. InfoIcon Component

Alternative to InfoTip using an info circle icon.

**Usage:**
```tsx
import { InfoIcon } from '../components/ui/InfoTip';

<InfoIcon
  content="Helpful information"
  code="optional code example"
/>
```

## Pages Enhanced with Tooltips

### 1. SearchPage (`ui/src/pages/SearchPage.tsx`)

**Tooltips Added:**
- **Page Title**: Explains DSL vs AI search modes
- **DSL Mode Toggle**: Describes Domain-Specific Language features
- **AI Mode Toggle**: Describes natural language query conversion
- **DSL Query Input**: Shows syntax help with code examples
  - Explains pipe syntax
  - Shows 5 common query patterns
  - Includes examples for filtering, aggregation, and time-based queries

**Example Code Snippets Shown:**
```
search severity<=3
search host=web* app_name="nginx"
search * | stats count by hostname
search error | timechart span=1h count
search * | top 10 app_name
```

### 2. AlertsPage (`ui/src/pages/AlertsPage.tsx`)

**Tooltips Added:**
- **Trigger Condition Section**: Explains when alerts fire
- **Trigger Type**: Explains number of results vs hosts vs custom
  - Number of Results: Total log count
  - Number of Hosts: Unique hosts count
  - Custom: Trigger if any results match
- **Condition**: Explains comparison operators and sudden changes
- **Threshold**: Explains numeric comparison value
- **Run Schedule**: Explains alert frequency
- **Time Range to Search**: Explains log search window
- **Throttling**: Explains alert fatigue prevention and suppression windows

### 3. DashboardViewPage (`ui/src/pages/DashboardViewPage.tsx`)

**Tooltips Added (Panel Editor):**
- **Panel Title**: Explains display name
- **Panel Query**: Shows DSL syntax with variable substitution
  - Explains `$variable$` syntax
  - Shows aggregation query examples
- **Visualization Types**: Detailed explanation of each chart type
  - Table: Raw results in tabular format
  - Bar Chart: Compare values across categories
  - Pie Chart: Show proportions
  - Area Chart: Display trends over time
  - Single Stat: One key metric
  - Heatmap: Visualize 2D patterns
  - Gauge: Metric with min/max range
- **Individual Visualization Buttons**: Hover tooltips on each type

### 4. SettingsPage (`ui/src/pages/SettingsPage.tsx`)

**Tooltips Added (API Keys Section):**
- **Key Name**: Explains descriptive naming
- **Permissions**: Explains read, write, and admin levels
  - read: View logs and search data
  - write: Ingest logs and create data
  - admin: Full access including settings
- **Expiry**: Explains automatic key rotation

## Styling and Theming

All tooltips automatically adapt to the current theme:

**Light Mode:**
- Background: `bg-gray-900`
- Text: `text-white`
- Border: `border-gray-700`
- Arrow: `fill-gray-900`

**Dark Mode:**
- Background: `dark:bg-gray-800`
- Text: `dark:text-gray-100`
- Border: `dark:border-gray-600`
- Arrow: `dark:fill-gray-800`

**Code Blocks in Tooltips:**
- Background: `bg-gray-950` (light) / `dark:bg-gray-900` (dark)
- Monospace font
- Border: `border-gray-700`
- Syntax highlighting compatible

## Animation

All tooltips use the existing `animate-fade-in` animation defined in `index.css`:

```css
.animate-fade-in {
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

## Positioning Intelligence

Tooltips use `@floating-ui/react` middleware for smart positioning:

1. **offset**: 8px gap between trigger and tooltip
2. **flip**: Automatically flips to opposite side if no space
3. **shift**: Shifts along the axis to stay in viewport
4. **arrow**: Arrow points to the trigger element

## Accessibility

- Tooltips use `role="tooltip"` for screen readers
- Keyboard focus triggers tooltips
- Escape key dismisses tooltips
- Mouse hover and focus both work

## Performance

- Tooltips are rendered in a Portal (outside DOM hierarchy)
- Only mounted when visible
- Uses `autoUpdate` for efficient position updates
- Minimal bundle size impact (~15KB gzipped)

## Best Practices

1. **Content Length**: Keep tooltip content concise (1-3 sentences)
2. **Code Examples**: Use for complex syntax (DSL queries, API examples)
3. **Placement**:
   - `right` for labels on the left
   - `top` for buttons and inputs
   - `bottom` for headers
4. **Rich Content**: Use structured HTML for multi-part explanations
5. **Icons**: Use InfoTip (?) for subtle inline help, InfoIcon for more prominent help

## Future Enhancements

Potential improvements for future iterations:

1. **Interactive Tooltips**: Add buttons or links inside tooltips
2. **Tour Mode**: Guided tour showing all tooltips sequentially
3. **Tooltip Preferences**: Allow users to disable tooltips
4. **Keyboard Shortcuts**: Show keyboard shortcuts in tooltips (e.g., Ctrl+Enter)
5. **Video Tutorials**: Embed short video clips in tooltips
6. **Search Help**: Context-aware help based on current query
7. **Error Explanations**: Detailed error messages with suggested fixes

## Testing

To test tooltips:

1. Start the UI: `cd ui && npm run dev`
2. Navigate to Search page
3. Hover over the (?) icon next to "Search & Explore"
4. Hover over DSL/AI mode toggles
5. Focus the query input to see syntax help
6. Navigate to Alerts page
7. Click "New Alert" and hover over all (?) icons
8. Navigate to Dashboards and edit a panel
9. Navigate to Settings and create an API key

All tooltips should:
- Appear smoothly with fade-in animation
- Position correctly without cutting off
- Display correct content with proper formatting
- Match the current theme (light/dark)
- Show code examples with proper styling

## Implementation Stats

- **Components Created**: 4 (Tooltip, TooltipWithCode, InfoTip, InfoIcon)
- **Pages Enhanced**: 4 (Search, Alerts, Dashboard, Settings)
- **Tooltips Added**: ~25 throughout the application
- **Code Examples**: 10+ DSL query examples
- **Lines of Code**: ~300 (components + integrations)
- **Bundle Impact**: ~15KB gzipped (floating-ui library)
