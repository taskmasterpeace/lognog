# TimePicker Integration Guide

This guide shows how to replace the existing time picker in SearchPage with the new TimePicker component.

## Current Implementation (SearchPage.tsx)

The current time picker is a simple dropdown around lines 199-228:

```tsx
{/* Time Range */}
<div className="relative">
  <button
    onClick={() => setShowTimeDropdown(!showTimeDropdown)}
    className="btn-secondary h-12 min-w-[140px]"
  >
    <Clock className="w-4 h-4 text-slate-400" />
    <span>{selectedPreset.short}</span>
    <ChevronDown className="w-4 h-4 text-slate-400" />
  </button>

  {showTimeDropdown && (
    <div className="dropdown right-0 w-48 animate-fade-in">
      {TIME_PRESETS.map((preset) => (
        <button
          key={preset.value}
          onClick={() => {
            setTimeRange(preset.value);
            setShowTimeDropdown(false);
          }}
          className={`dropdown-item ${
            timeRange === preset.value ? 'bg-sky-50 text-sky-600 font-medium' : ''
          }`}
        >
          {preset.label}
        </button>
      ))}
    </div>
  )}
</div>
```

## New Implementation

### Step 1: Import the Component

At the top of `SearchPage.tsx`, add:

```tsx
import TimePicker from '../components/TimePicker';
```

### Step 2: Update State (Optional)

The current state uses a single `timeRange` string. If you want to support custom ranges with both start and end dates, update the state:

```tsx
// Before:
const [timeRange, setTimeRange] = useState('-24h');

// After (if you want to support custom ranges):
const [timeRange, setTimeRange] = useState('-24h');
const [timeRangeEnd, setTimeRangeEnd] = useState<string | undefined>();
```

### Step 3: Create Handler

Add a handler for the time range change:

```tsx
const handleTimeRangeChange = (earliest: string, latest?: string) => {
  setTimeRange(earliest);
  if (latest !== undefined) {
    setTimeRangeEnd(latest);
  } else {
    setTimeRangeEnd(undefined);
  }
};
```

### Step 4: Replace the JSX

Replace the existing time range dropdown (lines 199-228) with:

```tsx
{/* Time Range */}
<TimePicker
  onRangeChange={handleTimeRangeChange}
  defaultRange={timeRange}
/>
```

### Step 5: Update Search Mutation (if using custom ranges)

If you added `timeRangeEnd` state and your API supports it:

```tsx
const searchMutation = useMutation({
  mutationFn: () => executeSearch(query, timeRange, timeRangeEnd),
});
```

### Step 6: Clean Up (Optional)

Remove the old code that's no longer needed:

```tsx
// Can remove these:
const [showTimeDropdown, setShowTimeDropdown] = useState(false);
const selectedPreset = TIME_PRESETS.find(p => p.value === timeRange) || TIME_PRESETS[3];

// Can remove this constant if not used elsewhere:
const TIME_PRESETS = [
  { label: 'Last 15 minutes', value: '-15m', short: '15m' },
  // ... etc
];
```

## Complete Example

Here's what the search bar section should look like after integration:

```tsx
{/* Search Bar */}
<div className="flex gap-3">
  {searchMode === 'ai' ? (
    /* AI Search Input */
    <div className="flex-1 relative">
      {/* ... existing AI input ... */}
    </div>
  ) : (
    /* DSL Query Input */
    <div className="flex-1 relative">
      {/* ... existing DSL input ... */}
    </div>
  )}

  {/* Time Range - NEW COMPONENT */}
  <TimePicker
    onRangeChange={handleTimeRangeChange}
    defaultRange={timeRange}
  />

  {/* Search Button */}
  {searchMode === 'ai' ? (
    <button onClick={handleAISearch} /* ... */>
      {/* ... */}
    </button>
  ) : (
    <button onClick={handleSearch} /* ... */>
      {/* ... */}
    </button>
  )}
</div>
```

## Benefits of the New Component

1. **More Options** - Includes 5m, 30m presets that weren't in the original
2. **Custom Ranges** - Users can select specific date/time ranges
3. **Better UX** - Visual feedback with duration display
4. **Reusable** - Can be used on other pages (Dashboards, Reports, etc.)
5. **Type Safe** - Full TypeScript support
6. **Consistent** - Matches LogNog design system

## API Compatibility

### If your API only supports relative times (current behavior):

```tsx
const handleTimeRangeChange = (earliest: string, latest?: string) => {
  if (latest) {
    // Custom range selected - you could show a warning or ignore
    console.warn('Custom ranges not yet supported by API');
    return;
  }
  setTimeRange(earliest);
};
```

### If your API supports absolute date ranges:

Your backend should accept both formats:

```typescript
// API endpoint signature
async function executeSearch(
  query: string,
  earliest: string,      // "-24h" or "2024-01-15T10:00:00.000Z"
  latest?: string        // undefined or "2024-01-20T15:00:00.000Z"
) {
  // Convert relative time to absolute if needed
  const startTime = earliest.startsWith('-')
    ? convertRelativeToAbsolute(earliest)
    : new Date(earliest);

  const endTime = latest
    ? new Date(latest)
    : new Date();

  // Use in ClickHouse query
}
```

## Backward Compatibility

The component is designed to be backward compatible:

- Default range is still `-24h`
- Preset values match the original format (`-15m`, `-1h`, etc.)
- Callback signature extends the original (optional `latest` parameter)
- Can ignore custom ranges if API doesn't support them

## Migration Checklist

- [ ] Import TimePicker component
- [ ] Add handleTimeRangeChange handler
- [ ] Replace time picker JSX
- [ ] Test all presets work
- [ ] Test custom range selection (if supported)
- [ ] Update API call if needed
- [ ] Remove old time picker code
- [ ] Test on different screen sizes
- [ ] Verify no console errors

## Rollback Plan

If you need to rollback, simply restore the original code from version control. The original time picker code is self-contained and doesn't depend on the new component.

## Future Enhancements

Once integrated, you can easily add:

- Saved time ranges
- Time range templates
- Time range sharing via URL params
- Time range presets per user preference
- Time zone selection

## Questions?

See the main README at `TimePicker.README.md` for detailed component documentation.
