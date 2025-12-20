# LogNog Animation System

This document describes the comprehensive animation system implemented throughout the LogNog application.

## Animation Philosophy

- **Subtle & Professional**: Animations are kept brief (150-300ms) to feel responsive without being distracting
- **Purposeful**: Each animation serves a functional purpose - guiding user attention or providing feedback
- **Accessible**: Full support for `prefers-reduced-motion` to respect user preferences
- **Performance**: Uses CSS transforms and opacity for GPU-accelerated animations

## Core Animations

### Page Transitions
- **Class**: `.animate-page-enter`
- **Duration**: 250ms
- **Effect**: Fade in + subtle slide up (8px)
- **Usage**: Wraps all page content via `<AnimatedPage>` component

### Modal Animations
- **Overlay**: `.animate-modal-overlay` - Fade in backdrop (200ms)
- **Content**: `.animate-modal-enter` - Scale + fade + slide (250ms with elastic easing)
- **Effect**: Creates a polished "pop-in" effect

### Dropdown Menus
- **Class**: `.animate-dropdown`
- **Duration**: 150ms
- **Effect**: Fade in + slide down (4px)
- **Usage**: Applied automatically to `.dropdown` class

### Toast Notifications
- **Enter**: `.animate-toast-enter` - Slide in from right (250ms)
- **Exit**: `.animate-toast-exit` - Slide out to right (200ms)
- **Usage**: See `<Toast>` component

### Loading States
- **Shimmer**: `.animate-shimmer` - Gradient shimmer effect (2s loop)
- **Skeleton**: `.animate-skeleton` - Pulse opacity (1.5s loop)
- **Usage**: See `<Skeleton>` component variants

### Content Animations
- **Fade In**: `.animate-fade-in` - Subtle fade + slide up (200ms)
- **Slide Up**: `.animate-slide-up` - Larger slide up movement (300ms)
- **Slide Right**: `.animate-slide-right` - Slide in from left (300ms)
- **Scale In**: `.animate-scale-in` - Scale up from 0.9 (200ms)
- **Chart Fade**: `.animate-chart-fade` - Delayed fade for visualizations (400ms)

### Staggered Animations
Use stagger classes to create sequential reveal effects:
- `.animate-stagger-1` through `.animate-stagger-8`
- Each adds 50ms delay (50ms, 100ms, 150ms, etc.)
- Perfect for lists and grid items

## Interactive Animations

### Buttons
All `.btn` classes include:
- `hover:scale-[1.02]` - Subtle grow on hover
- `active:scale-[0.98]` - Press down feedback
- Smooth 200ms transitions

### Cards
- `.card-hover` includes:
  - Shadow increase on hover
  - Subtle lift (`-translate-y-0.5`)
  - Border color transition
  - 200ms duration

### Table Rows
- Hover: Background color + subtle shadow
- Duration: 150ms
- Creates visual separation without being jarring

### Navigation Links
- Sidebar nav links slide right 0.5px on hover
- Icons scale up 10% (`scale-110`)
- Active indicator pulses

## Component-Specific Animations

### NogChat
- Floating button: Scale entrance + hover grow + active shrink
- Chat window: Scale entrance when opening
- Messages: Fade in as they appear
- Quick actions: Staggered fade-in (1-6)

### TimePicker
- Dropdown: Standard dropdown animation
- Presets: Staggered fade-in for list items
- Custom date picker: Slide right transition
- Icon hover: Scale up clock icon

### FacetFilters
- Panel expand/collapse: Smooth slide animation
- Checkboxes: Subtle scale on hover
- Selected count badge: Scale-in entrance
- Clear All button: Scale feedback on click

### SearchPage
- Results container: Slide up on load
- Filter chips: Fade in when applied
- Empty states: Center fade-in

## Usage Examples

### Adding animation to a new component

```tsx
// Simple fade-in
<div className="animate-fade-in">
  Content appears smoothly
</div>

// Staggered list items
{items.map((item, i) => (
  <div key={i} className={`animate-fade-in animate-stagger-${Math.min(i + 1, 8)}`}>
    {item.name}
  </div>
))}

// Interactive card
<div className="card-hover">
  Lifts and shadows on hover
</div>

// Button with feedback
<button className="btn-primary">
  Grows on hover, shrinks on click
</button>
```

### Using the Skeleton component

```tsx
import { SkeletonCard, SkeletonTable, SkeletonChart } from '@/components/ui/Skeleton';

// While loading...
{isLoading ? (
  <SkeletonCard />
) : (
  <div className="card animate-fade-in">
    {/* Actual content */}
  </div>
)}
```

### Using the Toast system

```tsx
import { useToast, ToastContainer } from '@/components/ui/Toast';

function MyComponent() {
  const toast = useToast();

  const handleSuccess = () => {
    toast.success('Operation completed', 'Your changes have been saved');
  };

  return (
    <>
      <button onClick={handleSuccess}>Save</button>
      <ToastContainer toasts={toast.toasts} onClose={toast.close} />
    </>
  );
}
```

## Accessibility

All animations respect the `prefers-reduced-motion` media query:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

This ensures users with vestibular disorders or motion sensitivity have a comfortable experience.

## Best Practices

1. **Don't overuse**: Not everything needs animation. Reserve it for:
   - Page/view transitions
   - State changes (loading, success, error)
   - User interactions (hovers, clicks)
   - Drawing attention to important elements

2. **Keep it fast**: Most animations should be 150-300ms
   - Faster than 150ms feels abrupt
   - Slower than 300ms feels sluggish

3. **Use appropriate easing**:
   - `ease-out` for entrances (starts fast, slows down)
   - `ease-in` for exits (starts slow, speeds up)
   - `cubic-bezier(0.16, 1, 0.3, 1)` for elastic effects

4. **Test with reduced motion**: Always verify animations are disabled properly

5. **Consider mobile**: Touch devices may have different performance characteristics

## Performance Tips

- Animations use `transform` and `opacity` which are GPU-accelerated
- Avoid animating properties like `height`, `width`, `top`, `left`
- Use `will-change` sparingly and only when needed
- Remove animations from off-screen elements

## Future Enhancements

Potential additions to the animation system:
- Page transition router integration
- Shared element transitions between views
- Micro-interactions for specific actions (copy, delete, etc.)
- Loading skeleton auto-detection
- Animation playground for testing
