# UI Changes Reference - Visual Guide

## Dashboard View Page - New Buttons

### Header Section (Top Right)
```
┌─────────────────────────────────────────────────────────────┐
│ Dashboard Name                                               │
│                                                               │
│  [Variables] [Time] [Auto-refresh] [Refresh] [Share]        │
│  [Settings ▼] [Copy Panel] [Add Panel]                      │
│             ↑ NEW                ↑ NEW                       │
└─────────────────────────────────────────────────────────────┘
```

### Panel Card (Hover State)
```
┌────────────────────────────────────────────┐
│ 📊 Panel Title                  [⚙] [✕]   │ ← Always visible
│                                             │
│ ┌────────────────────────────────────────┐ │
│ │ [Chart/Table Content]                  │ │
│ │                                        │ │
│ └────────────────────────────────────────┘ │
│                                             │
│ Hover reveals: [🔍][🔀][🔄][✏️][📋][🗑️]    │ ← Appears on hover
│                ↑ NEW                        │
│           View Origin                       │
└────────────────────────────────────────────┘

Icons:
🔍 = Fullscreen (Maximize2)
🔀 = View Origin (GitMerge) ← NEW
🔄 = Refresh (RefreshCw)
✏️ = Edit (Edit3)
📋 = Duplicate (Copy)
🗑️ = Delete (Trash2)
```

---

## Copy Panel Modal - 3 Steps

### Step 1: Select Project
```
┌──────────────────────────────────────────┐
│ 📋 Copy Existing Panel               ✕   │
│ Step 1 of 3: Select Project             │
├──────────────────────────────────────────┤
│                                          │
│ Select a project                         │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ [Logo] Project Alpha                 │ │
│ │        Analytics platform            │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ [Logo] Project Beta                  │ │
│ │        Security monitoring           │ │
│ └──────────────────────────────────────┘ │
│                                          │
├──────────────────────────────────────────┤
│              [Cancel] [Next →]           │
└──────────────────────────────────────────┘
```

### Step 2: Select Dashboard
```
┌──────────────────────────────────────────┐
│ 📋 Copy Existing Panel               ✕   │
│ Step 2 of 3: Select Dashboard            │
│ from Project Alpha    Change project     │
├──────────────────────────────────────────┤
│                                          │
│ Select a dashboard from Project Alpha   │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ System Overview                      │ │
│ │ Monitor system health and metrics    │ │
│ │ 8 panels                             │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ Error Tracking                       │ │
│ │ Track and analyze errors             │ │
│ │ 12 panels                            │ │
│ └──────────────────────────────────────┘ │
│                                          │
├──────────────────────────────────────────┤
│              [Cancel] [Next →]           │
└──────────────────────────────────────────┘
```

### Step 3: Select Panels
```
┌──────────────────────────────────────────┐
│ 📋 Copy Existing Panel               ✕   │
│ Step 3 of 3: Select Panels               │
│                     Change dashboard     │
├──────────────────────────────────────────┤
│                                          │
│ Select panels to copy                    │
│ ┌──────────────────────────────────────┐ │
│ │ 🔍 Search panels...                  │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ ☑ Error Rate by Service              │ │
│ │   From: System Overview • Project A  │ │
│ │   search * | stats count by service  │ │
│ │   Type: bar                          │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ ☐ Response Time Trend                │ │
│ │   From: System Overview • Project A  │ │
│ │   search * | timechart avg(latency)  │ │
│ │   Type: line                         │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ Custom title (optional)                  │
│ ┌──────────────────────────────────────┐ │
│ │ [Leave empty to use original title]  │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ⚠️ 1 panel selected                     │
│                                          │
├──────────────────────────────────────────┤
│              [Cancel] [Copy Panel]       │
└──────────────────────────────────────────┘
```

---

## Panel Provenance Modal

```
┌──────────────────────────────────────────┐
│ 🔀 Panel Origin                      ✕   │
├──────────────────────────────────────────┤
│                                          │
│ Current Panel                            │
│ ┌──────────────────────────────────────┐ │
│ │ Error Rate by Service                │ │
│ └──────────────────────────────────────┘ │
│                                          │
│          │                               │
│          │ (visual connector)            │
│          ↓                               │
│                                          │
│ Copied From                              │
│ ┌──────────────────────────────────────┐ │
│ │ Project: Project Alpha               │ │
│ │ Dashboard: System Overview           │ │
│ │                                      │ │
│ │ Copied on Jan 23, 2026 3:45 PM      │ │
│ │                                      │ │
│ │ View original dashboard →            │ │
│ └──────────────────────────────────────┘ │
│                                          │
├──────────────────────────────────────────┤
│                        [Close]           │
└──────────────────────────────────────────┘
```

**OR if not copied:**

```
┌──────────────────────────────────────────┐
│ 🔀 Panel Origin                      ✕   │
├──────────────────────────────────────────┤
│                                          │
│ Current Panel                            │
│ ┌──────────────────────────────────────┐ │
│ │ Error Rate by Service                │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ ℹ️ This panel was created directly   │ │
│ │   in this dashboard (not copied).    │ │
│ └──────────────────────────────────────┘ │
│                                          │
├──────────────────────────────────────────┤
│                        [Close]           │
└──────────────────────────────────────────┘
```

---

## MultiLogoIcon Component Examples

### 1 Logo
```
┌────────┐
│ [LOGO] │
│        │
└────────┘
```

### 2 Logos (Side by side)
```
┌────────┐
│[L1][L2]│
└────────┘
```

### 3 Logos (2 top, 1 bottom)
```
┌────────┐
│[L1][L2]│
│  [L3]  │
└────────┘
```

### 4 Logos (2x2 grid)
```
┌────────┐
│[L1][L2]│
│[L3][L4]│
└────────┘
```

**Usage in Dashboard List (Future):**
```
┌──────────────────────────────────────────┐
│ 📁 Project Alpha                 [△]     │  ← Collapsible
│                                          │
│   ┌────────────────────────────────────┐│
│   │ ┌──┐ System Overview     [⚙] [✕]  ││
│   │ │📊│ Monitor system health         ││
│   │ └──┘ 8 panels          [Open →]   ││
│   └────────────────────────────────────┘│
│                                          │
│   ┌────────────────────────────────────┐│
│   │ ┌──────┐ Error Dashboard [⚙] [✕]  ││
│   │ │ [L1] │ Track errors              ││
│   │ │ [L2] │ 12 panels    [Open →]     ││
│   │ └──────┘                           ││
│   └────────────────────────────────────┘│
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│ 📁 Uncategorized                 [△]     │
│                                          │
│   [Dashboards without a project...]     │
└──────────────────────────────────────────┘
```

---

## Color Scheme

All components follow LogNog's color scheme:

**Light Mode:**
- Primary: Amber (#f59e0b, #f97316)
- Success: Green
- Danger: Red
- Background: White/Slate-50
- Text: Slate-900 to Slate-500

**Dark Mode:**
- Primary: Amber (#f59e0b, #fbbf24)
- Background: Nog-900/Nog-800
- Text: Slate-100 to Slate-400
- Borders: Nog-700

**Hover States:**
- Border: Amber-300/Amber-500
- Background: Amber-50/Amber-900/20

---

## Accessibility

All new components include:
- ✅ Keyboard navigation
- ✅ ARIA labels and titles
- ✅ Focus states
- ✅ Clear error messages
- ✅ Loading indicators
- ✅ Proper contrast ratios

---

## Mobile Responsive

All components adapt to mobile:
- Copy Panel modal: Full-height scroll
- Panel buttons: Show on tap (not just hover)
- Text: Truncates with ellipsis
- Icons: Larger touch targets

---

## Icon Reference

New icons used from lucide-react:
- `Folder` - Copy Panel button
- `GitMerge` - View Origin button
- `Copy` - Duplicate/Copy actions
- `Search` - Panel search
- `ChevronDown` - Dropdown arrows
- `ExternalLink` - Link to original
- `Check` - Selection checkboxes
- `Loader2` - Loading spinner
- `X` - Close modal
