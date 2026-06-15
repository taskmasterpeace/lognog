# TimePicker Component - Manual Test Guide

## Quick Verification

To verify the TimePicker component is working correctly, follow these steps:

### 1. Start the Development Server

```bash
cd ui
npm run dev
```

### 2. Add to SearchPage (Temporary Test)

You can temporarily replace the existing time picker in `SearchPage.tsx`:

```tsx
// Import the component
import TimePicker from '../components/TimePicker';

// Replace the existing time range section (around line 199-228) with:
<TimePicker
  onRangeChange={(earliest, latest) => {
    console.log('Time range changed:', { earliest, latest });
    setTimeRange(earliest);
  }}
  defaultRange={timeRange}
/>
```

### 3. Visual Checklist

Test the following features:

#### Dropdown Opens/Closes
- [ ] Click the button to open dropdown
- [ ] Click outside to close
- [ ] Press ESC to close (should work with click outside handler)

#### Preset Selection
- [ ] Click "Last 5 minutes" - should close and show "-5m"
- [ ] Click "Last 15 minutes" - should close and show "-15m"
- [ ] Click "Last 1 hour" - should close and show "-1h"
- [ ] Click "Last 24 hours" - should close and show "24h"
- [ ] Click "Last 7 days" - should close and show "7d"
- [ ] Click "All time" - should close and show "All"

#### Custom Range Selection
- [ ] Click "Custom range" - should show date picker interface
- [ ] Select start date - should update
- [ ] Select start time - should update
- [ ] Select end date - should update
- [ ] Select end time - should update
- [ ] Visual display shows selected range and duration
- [ ] Click "Apply" - should close and show "Custom"
- [ ] Custom range info appears below button
- [ ] Click "Cancel" - should revert to previous selection

#### Visual Design
- [ ] Matches LogNog color scheme (sky blue primary)
- [ ] Smooth transitions and animations
- [ ] Icons render correctly (Clock, Calendar, ChevronDown, X)
- [ ] Button matches other buttons in the UI
- [ ] Dropdown has proper shadow and border
- [ ] Date picker styled consistently

#### Callback Functionality
- [ ] Console logs show correct values for presets
- [ ] Console logs show ISO dates for custom ranges
- [ ] Parent component receives updates

### 4. Browser Console Tests

Open browser console and verify:

```javascript
// After selecting "Last 24 hours"
// Should see: { earliest: "-24h", latest: undefined }

// After selecting custom range (Jan 1, 2024 10:00 to Jan 2, 2024 15:00)
// Should see: { earliest: "2024-01-01T10:00:00.000Z", latest: "2024-01-02T15:00:00.000Z" }
```

### 5. Edge Cases

Test these scenarios:

- [ ] Try to select end date before start date (should be prevented)
- [ ] Try to select future dates (should be disabled)
- [ ] Open custom picker, select dates, click Cancel (should revert)
- [ ] Switch between presets rapidly (should handle correctly)
- [ ] Open dropdown, then click another UI element (should close)

### 6. Responsive Design

Test on different screen sizes:

- [ ] Desktop (1920x1080) - full width
- [ ] Tablet (768px) - still works
- [ ] Mobile (375px) - dropdown stays on screen

### 7. TypeScript Validation

The component should have no TypeScript errors. Common props:

```tsx
interface TimePickerProps {
  onRangeChange: (earliest: string, latest?: string) => void;
  defaultRange?: string;
  className?: string;
}
```

## Integration Example

Once tested, here's how to integrate it into SearchPage:

```tsx
// In SearchPage.tsx
import TimePicker from '../components/TimePicker';

// State
const [timeRange, setTimeRange] = useState('-24h');
const [timeRangeEnd, setTimeRangeEnd] = useState<string | undefined>();

// Handler
const handleTimeRangeChange = (earliest: string, latest?: string) => {
  setTimeRange(earliest);
  setTimeRangeEnd(latest);
  // If you want to auto-trigger search on time change:
  // searchMutation.mutate();
};

// JSX (replace existing time picker around line 199-228)
<TimePicker
  onRangeChange={handleTimeRangeChange}
  defaultRange={timeRange}
/>

// Update search mutation to include latest if present
const searchMutation = useMutation({
  mutationFn: () => executeSearch(query, timeRange, timeRangeEnd),
});
```

## Troubleshooting

### Dropdown Not Showing
- Check z-index in dropdown class (should be z-50)
- Check if dropdown ref is working
- Look for console errors

### Date Picker Styling Broken
- Ensure TimePicker.css is imported
- Ensure react-datepicker CSS is imported
- Check for CSS conflicts

### Callback Not Firing
- Check console for errors
- Verify onRangeChange prop is passed
- Add console.log inside component to debug

### TypeScript Errors
- Ensure @types/react-datepicker is installed
- Check tsconfig.json includes src directory
- Verify all imports are correct

## Success Criteria

Component is ready when:
- ✅ All presets work and return correct values
- ✅ Custom range picker opens and functions
- ✅ Visual design matches LogNog aesthetic
- ✅ No TypeScript errors
- ✅ No runtime errors in console
- ✅ Callbacks fire with correct data
- ✅ Click outside closes dropdown
- ✅ Responsive on all screen sizes
