# LogNog Landing Page - Image Specifications Quick Reference

## Required Screenshots (7 Total)

### 1. Hero Dashboard Overview ⭐ CRITICAL
- **File:** `hero-dashboard.png`
- **Size:** 1920x1080 (16:9)
- **Show:** Full dashboard with search bar, 3-4 chart panels, live tail sidebar
- **Theme:** Dark
- **Priority:** 1 (most important)

### 2. Search Interface
- **File:** `search-interface.png`
- **Size:** 1920x1080 (16:9)
- **Show:** Query bar with SPL-like query, field extraction sidebar, log results table
- **Example Query:** `search severity=error | stats count by hostname`
- **Priority:** 2

### 3. Dashboard View
- **File:** `dashboard-view.png`
- **Size:** 1920x1080 (16:9)
- **Show:** 4-6 panels in grid: bar chart, line chart, pie chart, gauge, stats
- **Priority:** 2

### 4. Alert Management
- **File:** `alert-management.png`
- **Size:** 1920x1080 (16:9)
- **Show:** Alert rules list with severity badges, alert configuration form
- **Priority:** 3

### 5. Live Tail
- **File:** `live-tail.png`
- **Size:** 1920x1080 (16:9)
- **Show:** Real-time streaming logs, auto-scroll toggle, pause/play controls
- **Priority:** 3

### 6. NogChat AI
- **File:** `nogchat-ai.png`
- **Size:** 1024x768 (4:3)
- **Show:** Chat interface with AI conversation, suggested queries in code blocks
- **Priority:** 4

### 7. Data Source Templates
- **File:** `data-source-templates.png`
- **Size:** 1024x768 (4:3)
- **Show:** Template gallery grid (MySQL, PostgreSQL, Nginx, sshd, etc.)
- **Priority:** 4

## Capture Checklist

Before taking screenshots:

- [ ] Dark theme enabled
- [ ] Browser at 100% zoom
- [ ] Browser window sized exactly to target dimensions
- [ ] Dev tools closed
- [ ] Incognito/private mode (clean browser chrome)
- [ ] Realistic data populated (not placeholder text)
- [ ] Time range set to "Last 24 hours" or "Last 7 days"

## Quick Capture Commands

```bash
# Windows (PowerShell) - Resize browser window
$width = 1920
$height = 1080
# Then use Windows+Shift+S to capture

# macOS - Capture specific window
# Cmd+Shift+4, then Space, then click window

# Linux - Use GNOME Screenshot or Spectacle
gnome-screenshot -w -f screenshot.png
```

## Post-Processing

1. **Resize** (if needed): `convert input.png -resize 1920x1080! output.png`
2. **Optimize**: Use TinyPNG.com or `pngquant`
3. **Verify**: Check file size < 500KB per image

## Folder Structure

```
ui/public/screenshots/
├── hero-dashboard.png
├── search-interface.png
├── dashboard-view.png
├── alert-management.png
├── live-tail.png
├── nogchat-ai.png
└── data-source-templates.png
```

## Updating the Code

Replace ImagePlaceholder components in `LandingPage.tsx`:

```tsx
// Before (placeholder)
<ImagePlaceholder
  aspectRatio="16/9"
  width={1920}
  height={1080}
  description="..."
  alt="LogNog Dashboard"
/>

// After (real image)
<img
  src="/screenshots/hero-dashboard.png"
  alt="LogNog Dashboard Overview"
  className="relative rounded-xl shadow-2xl border border-slate-700/50 w-full"
/>
```

## Image Optimization Tools

- **TinyPNG**: https://tinypng.com (web, lossless)
- **pngquant**: `pngquant --quality=65-80 input.png -o output.png`
- **ImageOptim**: macOS app
- **Squoosh**: https://squoosh.app (web, more control)

Target: < 500KB per image, total page weight < 4MB
