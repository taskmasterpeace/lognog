# Tooltip Usage Examples

Quick reference guide for using tooltips in LogNog components.

## Basic Tooltip

Simple text tooltip on hover:

```tsx
import { Tooltip } from '../components/ui/Tooltip';

<Tooltip content="This button saves your work">
  <button className="btn-primary">Save</button>
</Tooltip>
```

## Tooltip with Placement

Control where the tooltip appears:

```tsx
<Tooltip content="Helpful text" placement="right">
  <input type="text" />
</Tooltip>

// Options: top, bottom, left, right, top-start, top-end, etc.
```

## Tooltip with Code Examples

Show code snippets alongside explanations:

```tsx
import { TooltipWithCode } from '../components/ui/Tooltip';

<TooltipWithCode
  content="Filter logs by severity level. Levels 0-3 are errors."
  code="search severity<=3
search severity=0  # Emergency only"
  placement="bottom"
>
  <input
    type="text"
    placeholder="Enter search query"
    className="input"
  />
</TooltipWithCode>
```

## InfoTip for Inline Help

Small (?) icon for field labels:

```tsx
import { InfoTip } from '../components/ui/InfoTip';

<label className="flex items-center gap-2">
  Alert Threshold
  <InfoTip
    content="Number of log events that must occur before this alert triggers"
    placement="top"
  />
</label>
<input type="number" />
```

## InfoTip with Rich Content

Use JSX for structured explanations:

```tsx
<InfoTip
  content={
    <div className="space-y-2">
      <p className="font-semibold">Trigger Types</p>
      <div className="space-y-1 text-xs">
        <p><strong>Number of Results:</strong> Count of matching logs</p>
        <p><strong>Number of Hosts:</strong> Count of unique hostnames</p>
        <p><strong>Custom:</strong> Any match triggers alert</p>
      </div>
    </div>
  }
  placement="right"
/>
```

## InfoTip with Code Example

Combine rich content and code:

```tsx
<InfoTip
  content={
    <div className="space-y-1">
      <p>Use aggregation queries for dashboard panels</p>
      <p className="text-xs opacity-80">Variables: $hostname$, $severity$</p>
    </div>
  }
  code="search host=$hostname$ | stats count by app_name
search severity<=$severity$ | timechart span=1h count"
  placement="right"
/>
```

## InfoIcon Alternative

Use info circle icon instead of (?):

```tsx
import { InfoIcon } from '../components/ui/InfoTip';

<div className="flex items-center gap-2">
  <h3>Dashboard Settings</h3>
  <InfoIcon
    content="Configure panel refresh intervals and time ranges"
    placement="right"
  />
</div>
```

## Tooltip on Disabled Elements

Wrap disabled elements in a span:

```tsx
<Tooltip content="Complete required fields first">
  <span>
    <button disabled className="btn-primary">
      Submit
    </button>
  </span>
</Tooltip>
```

## Tooltips in Forms

Example form with tooltips on every field:

```tsx
import { InfoTip } from '../components/ui/InfoTip';

<form className="space-y-4">
  {/* Text Input with Tooltip */}
  <div>
    <label className="flex items-center gap-2 text-sm font-medium mb-1">
      Dashboard Name
      <InfoTip
        content="Descriptive name shown in the dashboard list"
        placement="right"
      />
    </label>
    <input type="text" className="input" />
  </div>

  {/* Select with Tooltip */}
  <div>
    <label className="flex items-center gap-2 text-sm font-medium mb-1">
      Time Range
      <InfoTip
        content="Default time range for all panels in this dashboard"
        placement="right"
      />
    </label>
    <select className="input">
      <option>Last 24 hours</option>
      <option>Last 7 days</option>
    </select>
  </div>

  {/* Checkbox with Tooltip */}
  <div className="flex items-center gap-2">
    <input type="checkbox" id="autorefresh" />
    <label htmlFor="autorefresh" className="flex items-center gap-2">
      Auto-refresh
      <InfoTip
        content="Automatically reload panels every 30 seconds"
        placement="right"
      />
    </label>
  </div>
</form>
```

## Tooltips in Button Groups

Show tooltips on icon buttons:

```tsx
import { Tooltip } from '../components/ui/Tooltip';
import { Play, Pause, RefreshCw } from 'lucide-react';

<div className="flex gap-2">
  <Tooltip content="Run query" placement="bottom">
    <button className="btn-ghost p-2">
      <Play className="w-4 h-4" />
    </button>
  </Tooltip>

  <Tooltip content="Pause auto-refresh" placement="bottom">
    <button className="btn-ghost p-2">
      <Pause className="w-4 h-4" />
    </button>
  </Tooltip>

  <Tooltip content="Refresh all panels" placement="bottom">
    <button className="btn-ghost p-2">
      <RefreshCw className="w-4 h-4" />
    </button>
  </Tooltip>
</div>
```

## Custom Styled Tooltips

Customize max width and delay:

```tsx
<Tooltip
  content="This is a longer explanation that needs more space to display properly"
  placement="top"
  maxWidth={400}  // Default is 300
  delay={500}     // Default is 200ms
>
  <button>Hover me</button>
</Tooltip>
```

## Tooltips in Tables

Add tooltips to table headers:

```tsx
<table className="table">
  <thead>
    <tr>
      <th>
        <div className="flex items-center gap-2">
          Timestamp
          <InfoTip
            content="Time the log event was received (UTC)"
            placement="top"
          />
        </div>
      </th>
      <th>
        <div className="flex items-center gap-2">
          Severity
          <InfoTip
            content="0=Emergency, 3=Error, 5=Notice, 7=Debug"
            placement="top"
          />
        </div>
      </th>
      <th>Message</th>
    </tr>
  </thead>
</table>
```

## Tooltips with Markdown-like Formatting

Use HTML elements for rich formatting:

```tsx
<InfoTip
  content={
    <div className="space-y-2">
      <p className="font-semibold">Search Operators</p>
      <ul className="list-disc list-inside text-xs space-y-1">
        <li><code className="bg-gray-800 px-1 rounded">=</code> equals</li>
        <li><code className="bg-gray-800 px-1 rounded">!=</code> not equals</li>
        <li><code className="bg-gray-800 px-1 rounded">~</code> contains</li>
        <li><code className="bg-gray-800 px-1 rounded">&lt;=</code> less than or equal</li>
      </ul>
    </div>
  }
  placement="right"
/>
```

## Conditional Tooltips

Show different tooltips based on state:

```tsx
<Tooltip
  content={
    isEnabled
      ? "Click to disable this feature"
      : "Click to enable this feature"
  }
>
  <button onClick={() => setIsEnabled(!isEnabled)}>
    {isEnabled ? 'Enabled' : 'Disabled'}
  </button>
</Tooltip>
```

## Tooltips on Chart Elements

Example with Recharts visualization buttons:

```tsx
import { Tooltip } from '../components/ui/Tooltip';
import { BarChart3, PieChart, LineChart } from 'lucide-react';

<div className="flex gap-2">
  {VISUALIZATION_OPTIONS.map((viz) => (
    <Tooltip
      key={viz.value}
      content={viz.description}
      placement="top"
    >
      <button
        onClick={() => setVisualization(viz.value)}
        className={`p-3 rounded-lg border-2 ${
          visualization === viz.value
            ? 'border-sky-500 bg-sky-50'
            : 'border-slate-200'
        }`}
      >
        <viz.icon className="w-5 h-5" />
      </button>
    </Tooltip>
  ))}
</div>
```

## Best Practices

### DO:
- ✅ Keep content concise (1-3 sentences)
- ✅ Use code blocks for technical examples
- ✅ Place tooltips on labels, not inputs
- ✅ Use consistent placement within a form
- ✅ Test on mobile/tablet for touch devices
- ✅ Use InfoTip for optional fields
- ✅ Provide keyboard shortcuts in tooltips

### DON'T:
- ❌ Put tooltips on every single element
- ❌ Use tooltips for critical information
- ❌ Nest tooltips inside tooltips
- ❌ Make tooltip content too long (>150 words)
- ❌ Block important UI elements
- ❌ Use tooltips instead of proper labels
- ❌ Forget to test in dark mode

## Accessibility Considerations

1. **Keyboard Navigation**: Tooltips appear on focus, not just hover
2. **Screen Readers**: Use `aria-label` on trigger elements
3. **Touch Devices**: Tooltips work on tap, not just hover
4. **High Contrast**: Tooltips maintain good contrast ratios
5. **Motion**: Fade-in animation is subtle (200ms)

## Common Patterns

### Pattern 1: Form Field Help
```tsx
<label className="flex items-center gap-2 text-sm font-medium mb-1">
  Field Name
  <InfoTip content="Help text" placement="right" />
</label>
<input type="text" className="input" />
```

### Pattern 2: Icon Button with Tooltip
```tsx
<Tooltip content="Action description" placement="bottom">
  <button className="btn-ghost p-2">
    <Icon className="w-4 h-4" />
  </button>
</Tooltip>
```

### Pattern 3: Section Header Help
```tsx
<div className="flex items-center gap-2 mb-4">
  <h3 className="font-medium">Section Title</h3>
  <InfoIcon content="Section explanation" placement="right" />
</div>
```

### Pattern 4: Complex Input with Code
```tsx
<TooltipWithCode
  content="Field explanation with example"
  code="example code here"
  placement="bottom"
>
  <textarea className="input font-mono" />
</TooltipWithCode>
```

## Troubleshooting

**Tooltip not showing?**
- Check that the child element can receive focus/hover
- Ensure the child is not `display: none`
- Verify imports are correct

**Tooltip positioning wrong?**
- Try different `placement` values
- Check for `overflow: hidden` on parent containers
- Ensure tooltip has space to render

**Tooltip content cut off?**
- Increase `maxWidth` prop
- Use Portal rendering (automatic)
- Check viewport constraints

**Dark mode styling wrong?**
- Verify dark mode classes are applied
- Check index.css for dark: variants
- Test with theme toggle
