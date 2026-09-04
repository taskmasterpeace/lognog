# LogNog — Shipping Log

What's new, newest first. Guide is **current as of v0.9.0**.

## v0.9.0 — 2026-07-03

**New**
- **Dashboard Studio** — build dashboards by searching: run a query, preview it live, let LogNog suggest the best chart, drop panels onto a canvas, and save. Add a panel from any field in one click, and edit existing dashboards visually (the **Studio** button on any dashboard). Build everything visually — no config files to hand-edit.
- **Ask LogNog help bot** — a floating assistant (bottom-right) that answers "how do I…" questions from this guide *with links*, and "how many…/show me…" questions about your own logs (it writes the query, runs it, and links you to the results in Search).
- **User Guide** — this searchable guide, in-app under **Tools → User Guide**.
- **Search power-ups** — shareable/bookmarkable search links, a keyboard shortcut menu (press `?`), Copy-as-curl, NDJSON export, and "Events ±5 min on this host" from any log line.

**Improved**
- **Connecting an app is now obviously simple** — all you need is an API key. You never pre-declare or request access to an index; indexes are created automatically, and your app appears under **Data Sources** on its own.
- Dashboards honor the full time range, render every series on multi-series charts, and show the right value on single-stat panels.

**Fixed**
- **Alerting works again.** Every alert can now fire correctly (a long-standing issue meant some alerts silently never triggered), and a broken alert now shows its error instead of failing quietly.
- Public dashboard sharing now works end-to-end, and shared dashboards show real data to anyone with the link.

**Reliability**
- The Windows agent no longer loses logs during a network outage or duplicates them after a restart, and can run as a Windows Service.
