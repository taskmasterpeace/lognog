# TimePicker Component

A sophisticated time range picker component for the LogNog log analytics platform. Features quick preset selection and custom date/time range picking with a clean, modern UI that matches the LogNog design aesthetic.

## Features

- **Quick Range Presets** - 11 commonly used time ranges from 5 minutes to 30 days
- **Custom Date/Time Picker** - Precise selection with react-datepicker integration
- **Visual Feedback** - Clear display of selected range with duration calculation
- **Responsive Design** - Works seamlessly on all screen sizes
- **Keyboard Accessible** - Full keyboard navigation support
- **TailwindCSS Styling** - Matches existing LogNog design system
- **TypeScript** - Fully typed for better developer experience

## Installation

The component uses `react-datepicker` which is already installed in the project:

```json
{
  "dependencies": {
    "react-datepicker": "^9.0.0",
    "@types/react-datepicker": "^6.2.0"
  }
}
```

## Usage

### Basic Example

```tsx
import TimePicker from './components/TimePicker';

function SearchPage() {
  const handleRangeChange = (earliest: string, latest?: string) => {
    console.log('Selected range:', { earliest, latest });
    // Use the values to filter your data
  };

  return (
    <TimePicker
      onRangeChange={handleRangeChange}
      defaultRange="-24h"
    />
  );
}
```

### With State Management

```tsx
import { useState } from 'react';
import TimePicker from './components/TimePicker';

function SearchPage() {
  const [timeRange, setTimeRange] = useState({
    earliest: '-24h',
    latest: undefined as string | undefined
  });

  const handleRangeChange = (earliest: string, latest?: string) => {
    setTimeRange({ earliest, latest });
    // Trigger search or data refresh
    fetchLogs(earliest, latest);
  };

  return (
    <div className="search-controls">
      <TimePicker
        onRangeChange={handleRangeChange}
        defaultRange={timeRange.earliest}
      />
    </div>
  );
}
```

## Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `onRangeChange` | `(earliest: string, latest?: string) => void` | Yes | - | Callback function called when time range changes |
| `defaultRange` | `string` | No | `"-24h"` | Initial time range value |
| `className` | `string` | No | `""` | Additional CSS classes for the container |

## Return Values

The `onRangeChange` callback receives:

### Preset Ranges

When a preset is selected, `earliest` contains a relative time string and `latest` is undefined:

```ts
onRangeChange("-5m")    // Last 5 minutes
onRangeChange("-15m")   // Last 15 minutes
onRangeChange("-30m")   // Last 30 minutes
onRangeChange("-1h")    // Last 1 hour
onRangeChange("-4h")    // Last 4 hours
onRangeChange("-12h")   // Last 12 hours
onRangeChange("-24h")   // Last 24 hours
onRangeChange("-7d")    // Last 7 days
onRangeChange("-30d")   // Last 30 days
onRangeChange("")       // All time
```

### Custom Ranges

When a custom range is selected, both `earliest` and `latest` contain ISO 8601 date strings:

```ts
onRangeChange(
  "2024-01-15T10:30:00.000Z",  // Start date
  "2024-01-20T15:45:00.000Z"   // End date
)
```

## Available Presets

1. **Last 5 minutes** - `-5m`
2. **Last 15 minutes** - `-15m`
3. **Last 30 minutes** - `-30m`
4. **Last 1 hour** - `-1h`
5. **Last 4 hours** - `-4h`
6. **Last 12 hours** - `-12h`
7. **Last 24 hours** - `-24h` (default)
8. **Last 7 days** - `-7d`
9. **Last 30 days** - `-30d`
10. **All time** - `` (empty string)
11. **Custom range** - Opens date/time picker

## Custom Range Picker

When "Custom range" is selected, a date/time picker interface appears with:

- **Start Date & Time** - Select the beginning of the range
- **End Date & Time** - Select the end of the range
- **Time Interval** - 15-minute intervals for time selection
- **Visual Display** - Shows selected range and duration
- **Apply/Cancel** - Confirm or cancel custom selection

### Custom Range Features

- Date validation (start date cannot be after end date)
- Cannot select future dates
- Shows duration calculation in hours
- Displays formatted date/time preview
- Persists selection across dropdown open/close

## Styling

The component uses TailwindCSS classes and matches the LogNog design system:

- **Primary Color**: Sky blue (`sky-500`, `sky-600`)
- **Font**: Inter (system font stack)
- **Border Radius**: Rounded corners (`rounded-lg`, `rounded-xl`)
- **Shadows**: Subtle shadows (`shadow-sm`, `shadow-md`)
- **Transitions**: Smooth 200ms transitions
- **Animations**: Fade-in and slide-up animations

### Custom Datepicker Styling

The component includes custom CSS (`TimePicker.css`) that styles react-datepicker to match the LogNog aesthetic:

- Custom header background
- Styled date cells with hover effects
- Selected date gradient background
- Disabled date styling
- Time list styling
- Custom input styling

## Accessibility

- Keyboard navigation support
- Click outside to close
- Proper ARIA labels
- Focus management
- Tab navigation

## Examples

### Integration with Search Page

```tsx
// In SearchPage.tsx
import { useState } from 'react';
import TimePicker from '../components/TimePicker';
import { executeSearch } from '../api/client';

export default function SearchPage() {
  const [query, setQuery] = useState('search *');
  const [timeRange, setTimeRange] = useState({ earliest: '-24h', latest: undefined });

  const handleRangeChange = (earliest: string, latest?: string) => {
    setTimeRange({ earliest, latest });
  };

  const handleSearch = async () => {
    const results = await executeSearch(query, timeRange.earliest, timeRange.latest);
    // Process results
  };

  return (
    <div className="search-bar">
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <TimePicker onRangeChange={handleRangeChange} />
      <button onClick={handleSearch}>Search</button>
    </div>
  );
}
```

### Custom Styling

```tsx
<TimePicker
  onRangeChange={handleRangeChange}
  className="ml-4"  // Add margin
/>
```

## File Structure

```
ui/src/components/
├── TimePicker.tsx           # Main component
├── TimePicker.css           # Custom datepicker styles
├── TimePicker.example.tsx   # Usage examples
└── TimePicker.README.md     # This file
```

## Dependencies

- `react` - ^18.2.0
- `react-datepicker` - ^9.0.0
- `lucide-react` - ^0.312.0 (for icons)
- `tailwindcss` - ^3.4.1

## Browser Support

Works in all modern browsers that support:
- ES6+
- CSS Grid
- CSS Flexbox
- CSS Custom Properties

## Performance

- Minimal re-renders with proper state management
- Click outside handler cleanup on unmount
- Efficient date calculations
- No memory leaks

## Future Enhancements

Potential improvements for future versions:

- [ ] Relative time input (e.g., "2h ago to 1h ago")
- [ ] Saved time ranges
- [ ] Quick range shortcuts (Today, Yesterday, This Week)
- [ ] Time zone selection
- [ ] Real-time preview of log count for selected range
- [ ] Keyboard shortcuts for common ranges
- [ ] Custom time format preferences

## License

Part of the LogNog project - MIT License
