# LogNog Landing Page - Marketing & Image Guide

This document provides a comprehensive guide to the LogNog landing page, including all image placeholders that need real screenshots and the marketing strategy behind each section.

## Overview

The landing page is designed to be **conversion-focused** with clear value propositions for Splunk users, homelab enthusiasts, and growing development teams. It emphasizes:

- **Zero learning curve** for Splunk users
- **Cost savings** compared to commercial solutions
- **Simplicity** compared to ELK/Loki stacks
- **Self-hosted control** over your data

## Component Structure

### ImagePlaceholder Component

**Location:** `ui/src/components/landing/ImagePlaceholder.tsx`

This reusable component displays:
- Aspect ratio badge (e.g., 16:9, 4:3)
- Dimensions badge (e.g., 1920x1080)
- Description of what the image should contain
- Alt text for accessibility

**Usage:**
```jsx
<ImagePlaceholder
  aspectRatio="16/9"
  width={1920}
  height={1080}
  description="Dashboard overview showing real-time log monitoring"
  alt="LogNog Dashboard"
/>
```

## Image Requirements

### 1. Hero Screenshot (Priority: CRITICAL)
**Location:** After "See It In Action" heading
**Aspect Ratio:** 16:9
**Dimensions:** 1920x1080px
**Description:** Full dashboard overview showing real-time log monitoring with search bar, multiple visualization panels (line charts, bar charts, stats), and live tail sidebar
**Purpose:** First impression - show the full power of LogNog at a glance
**What to capture:**
- Search bar with example query visible
- 3-4 dashboard panels showing different chart types
- Dark theme UI
- Live tail sidebar (if possible)
- Time range picker visible
- Professional, clean layout

### 2. Powerful Search Interface
**Aspect Ratio:** 16:9
**Dimensions:** 1920x1080px
**Description:** Search interface showing DSL query bar, field extraction sidebar, and log results table with syntax highlighting
**Purpose:** Show Splunk users the familiar query interface
**What to capture:**
- Query bar with example SPL-like query (e.g., `search severity=error | stats count by hostname`)
- Field extraction sidebar on the left
- Log results in table format
- Syntax highlighting in query bar
- Field list showing extracted fields
- Export/share buttons visible

### 3. Custom Dashboards
**Aspect Ratio:** 16:9
**Dimensions:** 1920x1080px
**Description:** Dashboard view with multiple panels: bar chart, line chart, pie chart, and stats tables with dark theme
**Purpose:** Showcase visualization capabilities
**What to capture:**
- 4-6 panels in grid layout
- Mix of chart types: bar, line, pie, gauge, stats
- Dashboard title and description
- Refresh controls
- Edit mode toggle
- Time range selector

### 4. Smart Alerts
**Aspect Ratio:** 16:9
**Dimensions:** 1920x1080px
**Description:** Alert management page showing alert rules list, severity indicators, and alert configuration form
**Purpose:** Show enterprise-grade alerting
**What to capture:**
- List of 3-5 configured alerts
- Severity badges (critical, warning, info)
- Alert status (active, silenced)
- Create alert form or edit modal
- Threshold configuration visible
- Email/webhook destinations

### 5. Real-Time Live Tail
**Aspect Ratio:** 16:9
**Dimensions:** 1920x1080px
**Description:** Live tail view with streaming logs, auto-scroll toggle, and real-time log count metrics
**Purpose:** Show real-time capabilities
**What to capture:**
- Logs streaming in real-time
- Auto-scroll toggle button
- Pause/play controls
- Log count metrics
- Color-coded severity levels
- Timestamp column
- Filter/search within live tail

### 6. NogChat AI Assistant
**Aspect Ratio:** 4:3
**Dimensions:** 1024x768px
**Description:** Chat interface showing conversation with AI assistant analyzing log patterns and suggesting queries
**Purpose:** Showcase AI-powered features
**What to capture:**
- Chat interface with 3-4 message bubbles
- User asking question about logs
- AI response with suggested query
- Code blocks for queries
- "Ask NogChat" prominent
- Send message input field

### 7. Data Source Templates
**Aspect Ratio:** 4:3
**Dimensions:** 1024x768px
**Description:** Template gallery showing database, security, and web server templates with quick-start guides
**Purpose:** Show ease of getting started
**What to capture:**
- Grid of template cards (MySQL, PostgreSQL, Nginx, sshd, etc.)
- Categories: Database, Security, Web, System
- Template icons/logos
- "Use Template" buttons
- Template descriptions visible
- Search/filter templates

## Landing Page Sections (In Order)

### 1. Header
- LogNog logo
- GitHub link
- Sign In button
**CTA:** Sign In

### 2. Hero Section
- Large logo (40x40 on desktop)
- Main tagline: "Your Logs. Your Control."
- Subheadline: "Enterprise-grade log management without the enterprise price tag"
- Quick stats: 10 min setup, millions of logs/day, $0/month, your servers only
**CTAs:**
  - "Start Searching Logs" (primary)
  - "View Source" (secondary)

### 3. Who It's For
- Startups & Indies
- SMBs & Agencies
- DevOps & Homelabs
**Purpose:** Help visitors self-identify

### 4. AI Onboarding Feature (Coming Soon)
- NogChat AI-powered setup wizard banner
**Purpose:** Tease upcoming feature, build excitement

### 5. Hosted Coming Soon Banner
- Cloud version announcement
**Purpose:** Capture interest in hosted offering

### 6. Hero Screenshot
- Single large screenshot showing full dashboard
**Purpose:** Visual proof of capability

### 7. Screenshot Showcase (6 screenshots)
- Alternating left/right layout
- Each with title, description, and detailed caption
**Purpose:** Detailed feature walkthrough

### 8. The Problem
- 4 cards showing pain points: Splunk cost, ELK complexity, Chronicle lock-in, SaaS privacy concerns
**Purpose:** Empathize with visitor's current pain

### 9. Coming From Splunk?
- Side-by-side SPL vs LogNog query comparison table
**Purpose:** Show zero learning curve for Splunk users

### 10. How LogNog Compares
- Full comparison table: LogNog vs Splunk vs ELK vs Loki vs Chronicle
- 8 criteria: Cost, Setup Time, Query Language, Dashboards, Alerts, Memory, Self-Hosted, Open Source
**Purpose:** Objective feature comparison

### 11. Features Grid
- 6 feature cards with icons
- Search, Dashboards, Alerts, Live Tail, FIM, GeoIP
**Purpose:** Quick feature scan

### 12. Integrations
- 6 integration badges: Supabase, Vercel, OpenTelemetry, Syslog, Generic HTTP, Windows Events
**Purpose:** Show ecosystem compatibility

### 13. Deployment Options
- 3 cards: Agent Only, LogNog Lite (popular), LogNog Full
**Purpose:** Show flexibility

### 14. Getting Started
- 3-step guide with code examples
- Step 1: Clone & Start
- Step 2: Configure Sources
- Step 3: Search & Alert
**CTA:** "Start Now"
**Purpose:** Reduce friction, show simplicity

### 15. Real Teams, Real Results
- 6 testimonial cards with use cases
- Homelab, Game Server, SaaS Startup, DevOps, Security Consultant, E-commerce
- Each with specific metrics (cost savings, time savings, deployment count)
**Purpose:** Social proof and relatable use cases

### 16. FAQ
- 6 common questions with answers
- Docker requirements, Loki comparison, scale, compliance, hosted version, contributing
**Purpose:** Address objections

### 17. Final CTA
- "Ready to Take Control of Your Logs?"
- "10 minute setup. Free forever. MIT licensed. No credit card required."
**CTAs:**
  - "Get Started Now" (primary)
  - "Star on GitHub" (secondary)

### 18. Footer
- 4 columns: Brand, Product, Resources, Deploy
- Product links: Search, Dashboards, Alerts, Data Sources
- Resource links: Docs, Query Language, GitHub Issues, Contributing
- Deploy links: LogNog Full, LogNog Lite, Agent, Hosted (coming soon)
- Copyright and tech stack credits

## Marketing Copy Strategy

### Target Personas

**1. Splunk Refugee**
- Pain: $1,800+/year licensing costs
- Value Prop: Same query language, $0 cost
- Key Message: "Your SPL knowledge transfers directly"

**2. Homelab Enthusiast**
- Pain: Tools are too complex or too expensive
- Value Prop: 10-minute setup, works with pfSense/Ubiquiti
- Key Message: "One docker-compose file"

**3. Startup/SMB Developer**
- Pain: Can't afford Splunk, ELK is too complex
- Value Prop: Enterprise features without enterprise complexity
- Key Message: "Stop paying $500/month for logs"

**4. DevOps Engineer**
- Pain: ELK requires constant tuning, multiple components
- Value Prop: Single deployment, low maintenance
- Key Message: "No Helm charts, no Kubernetes manifests"

### Key Differentiators

1. **Splunk-like Query Language** - Zero learning curve for Splunk users
2. **Cost** - Free vs $1,800+/year
3. **Simplicity** - One docker-compose file vs 3+ components
4. **Self-hosted** - Your data stays on your servers
5. **Open Source** - MIT license, not AGPL

### Conversion Tactics

1. **Multiple CTAs** - 5+ "Get Started" / "Sign In" buttons throughout
2. **Social Proof** - 6 detailed use cases with metrics
3. **Cost Comparison** - "Save $2,000/year" messaging
4. **Fear of Complexity** - "No Elasticsearch tuning required"
5. **Quick Wins** - "10 minute setup" emphasized 3+ times
6. **Risk Reversal** - "Free forever", "No credit card required"

## Screenshot Capture Guide

### Recommended Tool Settings

**For Windows:**
- Use Windows Snipping Tool or ShareX
- Save as PNG (not JPG) for crisp text
- Capture at 100% browser zoom
- Use 1920x1080 browser window for 16:9 shots
- Use 1024x768 browser window for 4:3 shots

**For macOS:**
- Use Command+Shift+4 then Spacebar for window capture
- Save as PNG
- Use full-screen browser window

### Before Capturing

1. **Populate with realistic data**
   - Use actual log data, not lorem ipsum
   - Show realistic queries: `search severity=error | stats count by hostname`
   - Use recognizable hostnames: `web-server-01`, `db-prod`, `firewall-gateway`

2. **Set dark theme** - All screenshots should use dark theme for consistency

3. **Clean up UI**
   - Close browser dev tools
   - Hide unnecessary browser extensions
   - Use incognito/private mode to hide bookmarks bar
   - Set browser to 100% zoom

4. **Show realistic timestamps** - Set time range to "Last 24 hours" or "Last 7 days"

5. **Add example data** - Insert test logs if needed:
   ```bash
   # Use the test syslog endpoint
   echo "<14>2025-01-15T10:30:00Z web-server-01 nginx: 192.168.1.100 - GET /api/users 200 0.042s" | nc -u localhost 514
   ```

### Post-Processing

1. **Resize** - Ensure exact dimensions (1920x1080 or 1024x768)
2. **Optimize** - Use TinyPNG or similar to reduce file size
3. **Name** - Use descriptive names: `lognog-dashboard-overview.png`
4. **Replace placeholders** - Update LandingPage.tsx to use actual image paths

## Updating with Real Images

When screenshots are ready, update `ui/src/pages/LandingPage.tsx`:

```typescript
// Replace ImagePlaceholder components with img tags
<img
  src="/screenshots/dashboard-overview.png"
  alt="LogNog Dashboard Overview"
  className="relative rounded-xl shadow-2xl border border-slate-700/50 w-full"
/>
```

Or keep placeholders and just add images to public folder:
- `/public/screenshots/dashboard-overview.png`
- `/public/screenshots/search-interface.png`
- etc.

## Testing Checklist

Before deploying the landing page:

- [ ] All CTAs work (Login, GitHub, Start Now buttons)
- [ ] All internal links work (Search, Dashboards, etc.)
- [ ] All external links work (GitHub, docs)
- [ ] Mobile responsive design works (test on 375px, 768px, 1024px, 1920px)
- [ ] Images load correctly (or placeholders display properly)
- [ ] No console errors
- [ ] Page loads in < 3 seconds
- [ ] Lighthouse score > 90
- [ ] All text is readable (contrast ratios meet WCAG AA)
- [ ] Footer links work
- [ ] GitHub star button works

## Future Enhancements

1. **Analytics**
   - Add Google Analytics or Plausible
   - Track CTA clicks
   - A/B test headlines

2. **Video**
   - Add 60-second demo video in hero section
   - Screen recording of search → dashboard → alert workflow

3. **Interactive Demo**
   - Embedded live demo (read-only LogNog instance)
   - Pre-populated with sample data

4. **Pricing Page**
   - For hosted version (when launched)
   - Free tier, Pro tier, Enterprise tier

5. **Customer Logos**
   - "Used by teams at..." section
   - Requires permission from users

6. **Changelog**
   - Link to recent updates
   - "New in v1.2.0" badge

## Files Created/Modified

### Created
- `ui/src/components/landing/ImagePlaceholder.tsx` - Reusable placeholder component
- `docs/LANDING-PAGE-GUIDE.md` - This file

### Modified
- `ui/src/pages/LandingPage.tsx` - Complete redesign with 18 sections
- `ui/src/pages/SettingsPage.tsx` - Fixed TypeScript import error

## Build Verification

Build completed successfully:
```
✓ built in 8.97s
dist/index.html                     0.71 kB │ gzip:   0.39 kB
dist/assets/index-DRquPMlg.css    127.73 kB │ gzip:  17.42 kB
dist/assets/index-D7wUn6Rq.js   2,410.84 kB │ gzip: 706.54 kB
```

No TypeScript errors, production-ready.

---

**Next Steps:**
1. Capture 7 screenshots using guide above
2. Replace ImagePlaceholder components with actual images
3. Test on mobile devices
4. Deploy to production
5. Share on Reddit, Hacker News, Product Hunt
