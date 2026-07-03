<!--
LogNog — User & Admin Guide
Brand tokens for any PDF/HTML render:
  Primary chocolate brown #5A3F24 · Dark #3D2A18 · Cream #FAF8F5 / #F5F0E8 · Honey accent (amber/gold).
  NO purple, NO sky blue. Font: Inter / system-ui.
Screenshots: spots are marked with SCREENSHOT bracket-tags (e.g. search-page); the screenshot-capture skill fills them.
-->

# LogNog — User & Admin Guide

**Your logs, your control — a friendly, self-hosted Splunk for every log you own.**
**Current as of v0.9.0** · updated 2026-07-03

> See [what's new](../SHIPPING-LOG.md) for changes since the last version.
> Sections marked **(Coming soon)** or **Planned** are in active development; everything else is live today.
> This is the first versioned edition of the complete LogNog user and admin guide.

---

## Table of contents

1. [Overview](#1-overview)
2. [Quick Start](#2-quick-start)
3. [User Roles and Permissions](#3-user-roles-and-permissions)
4. [Navigation Guide](#4-navigation-guide)
5. [Core Concepts](#5-core-concepts)
6. [Main User Workflows](#6-main-user-workflows)
7. [Feature Reference](#7-feature-reference)
   - 7.1 [Search & Explore](#71-search--explore)
   - 7.2 [The DSL Query Language](#72-the-dsl-query-language)
   - 7.3 [Saved Searches](#73-saved-searches)
   - 7.4 [Dashboards](#74-dashboards)
   - 7.5 [Dashboard Studio](#75-dashboard-studio)
   - 7.6 [Alerts](#76-alerts)
   - 7.7 [Silences](#77-silences)
   - 7.8 [Anomaly Detection](#78-anomaly-detection)
   - 7.9 [Synthetic Monitoring](#79-synthetic-monitoring)
   - 7.10 [Analytics](#710-analytics)
   - 7.11 [Reports](#711-reports)
   - 7.12 [Data Sources & Onboarding](#712-data-sources--onboarding)
   - 7.13 [The LogNog Windows Agent (LogNog In)](#713-the-lognog-windows-agent-lognog-in)
   - 7.14 [Data Models (CIM)](#714-data-models-cim)
   - 7.15 [Knowledge](#715-knowledge)
   - 7.16 [Assets](#716-assets)
   - 7.17 [Identities](#717-identities)
   - 7.18 [AI features (AI Agent, NogChat, NL→DSL)](#718-ai-features-ai-agent-nogchat-nldsl)
   - 7.19 [MCP server for Claude Desktop](#719-mcp-server-for-claude-desktop)
8. [Admin Guide](#8-admin-guide)
9. [Examples and Scenarios](#9-examples-and-scenarios)
10. [Troubleshooting](#10-troubleshooting)
11. [FAQ](#11-faq)
12. [Glossary](#12-glossary)
13. [Known Gaps, Unclear Areas, and Suggested Improvements](#13-known-gaps-unclear-areas-and-suggested-improvements)
14. [Documentation Maintenance Notes](#14-documentation-maintenance-notes)

---

## 1. Overview

**LogNog is a self-hosted log-management platform** — think of it as a friendlier Splunk you run on your own hardware. You point your apps, servers, routers, and devices at LogNog; it stores every log line; and then you search, chart, alert on, and report against those logs from a warm, clean web interface.

**What it's for.** When something breaks — a website goes down, a payment fails, a server floods with errors, someone tries to break into your VPN — the evidence is in your logs. LogNog gives you one place to ask "what just happened?" and get an answer in seconds instead of SSH-ing into ten machines. It also watches for trouble on your behalf (alerts, anomaly detection, uptime checks) so you hear about problems before your users do.

**Who it's for.**

- **Homelab and small-business owners** who want Splunk-style power without Splunk's price tag and without sending their data to anyone's cloud.
- **Developers** who want their app's logs (errors, signups, payments, performance) searchable in one place.
- **IT and security teams** who need to investigate incidents, monitor uptime, and keep an audit trail.

**The core value / job to be done.** Get every log you care about into one searchable home, then answer questions and get alerted — all on infrastructure you control. Everything runs locally: your data never leaves your network, the AI features can run against a local model, and there are no per-query fees.

**Documentation status.** This is the **first versioned edition** of the full guide, written against LogNog **v0.9.0**. Each feature below is honestly labeled **Available**, **Partially available**, **Planned**, or **Unclear** based on what the running product actually does.

[SCREENSHOT: landing-page]

---

## 2. Quick Start

The fastest path from "logged in" to "I can see and search my logs."

### Before you begin

- **Access to a LogNog site.** In production that's **https://logs.machinekinglabs.com**. If you're running your own copy, it's usually `http://localhost` (or your server's address).
- **An account.** If you're the very first person on a brand-new LogNog, you'll create the admin account yourself (see below). Otherwise an admin gives you a username and password.
- **Something to send logs** (optional for exploring) — an app, a device, or the built-in demo-data generator.

### First access (sign in)

1. Open the LogNog site in your browser.
2. **If this is a brand-new install** with no accounts yet, you'll land on a **Setup** screen titled *"Create your admin account."* Enter a username, email, and a password of at least 8 characters, then click **Create Admin Account**. You're logged in automatically as an administrator.
3. **Otherwise**, on the **Sign in** screen enter your **Username or Email** and **Password** and click **Sign In**.

The default local development credentials are username `admin`, password `admin` — change these immediately in production.

[SCREENSHOT: login-page]

### The welcome wizard (first login)

The first time you sign in, a **"Let's get you started!"** wizard appears. It walks you through four quick steps:

1. **Welcome** — a summary of what you'll set up. Click **Get Started**.
2. **Choose Your Data Source** — pick **Generate Demo Data** (creates 500 realistic sample logs so you have something to explore right away) or **Connect Real Logs** (shows you the syslog, HTTP, and agent options for later).
3. **Create Your First Dashboard** — tick one or more starter templates (System Overview is pre-selected).
4. **Set Up Alerts (optional)** — tick any pre-built alerts you want (Security, Errors, Performance, Availability, System).

You can **Skip Setup** at any time, and re-run the wizard later from **Settings → Preferences → Show Welcome Wizard Again**.

### First task — run your first search

1. In the left sidebar, under **Explore**, click **Search**.
2. In the query box, leave the default `search *` (which means "all logs") or type a simple query like `search severity<=3` (errors and worse).
3. Set the **time range** (top right of the search bar) to something like **Last 24 hours**.
4. Click **Search** (or press **Ctrl+Enter**).

### What success looks like

You'll see a results count (e.g. *"1,204 results in 87ms"*), a small **timeline histogram** of events over time, and your log lines below. If you generated demo data, you'll see a healthy mix of web, database, firewall, and auth logs. Click any value in a log line to filter by it. Congratulations — you're searching.

[SCREENSHOT: search-page]

---

## 3. User Roles and Permissions

LogNog has three built-in roles. Your role is set by an administrator (the first person to set up LogNog is automatically an **admin**).

| Role | What they can do | What they cannot do | Notes |
|------|------------------|---------------------|-------|
| **Admin** | Everything: search, dashboards, alerts, reports; **plus** manage users, create/revoke API keys, configure notification channels, AI settings, GeoIP, system settings, and generate/clear/delete log data. | — (full access) | The **Users**, **Data**, **GeoIP**, **System**, and **AI** tabs in Settings are admin-only. |
| **User** | Search and view logs; create and edit dashboards, alerts, saved searches, reports; manage their own account and preferences. | Manage other users; create/revoke API keys for the whole system; change system/AI settings; generate or delete log data. | The standard role for most people. |
| **Read Only** | View logs and dashboards. | Create or edit dashboards, alerts, reports, or any configuration. | Good for stakeholders who should see data but not change anything. |

Your current role is shown in the sidebar under your username, and in **Settings → Account**. Role names in the system are `admin`, `user`, and `readonly`. The MCP integration and API keys respect these same roles.

---

## 4. Navigation Guide

The left sidebar groups every page into five collapsible sections. Each group remembers whether you left it open or closed.

| Area / Page | Group | Purpose | Who uses it | Common actions |
|-------------|-------|---------|-------------|----------------|
| **Search** | Explore | Run DSL queries, live-tail, explore fields | Everyone | Search, filter, export, save |
| **Saved Searches** | Explore | Store, schedule, and reuse queries | Everyone | Run, edit, turn into alert/report/panel |
| **Dashboards** | Explore | Browse, create, and open dashboards | Everyone | Open, create, import, duplicate |
| **Alerts** | Monitor | Rules that notify you when conditions are met | User/Admin | Create, test, enable, snooze |
| **Anomaly Detection** | Monitor | Learn "normal" and flag unusual behavior (UEBA) | User/Admin | Run detection, review, mark true/false |
| **Synthetic** | Monitor | Proactive uptime checks (HTTP/API/TCP) | User/Admin | Create test, run now, view results |
| **Analytics** | Analyze | Live metrics: volume, severity, top hosts/apps | Everyone | Read charts, click to drill down |
| **Reports** | Analyze | Generate and schedule emailed reports | User/Admin | Generate, schedule, export HTML |
| **Data Sources** | Configure | See active log sources, indexes, volumes; add new sources | User/Admin | Add source, view source's logs, mute |
| **Data Models** | Configure | CIM: normalize field names across sources | User/Admin | Define models, map fields |
| **Knowledge** | Configure | Field extractions, event types, tags, lookups, workflow actions, source annotations | User/Admin | Create/edit knowledge objects |
| **Assets** | Configure | Inventory of servers/devices discovered from logs | User/Admin | Discover, add, set criticality |
| **Identities** | Configure | Inventory of users/accounts discovered from logs | User/Admin | Discover, add, flag privileged |
| **AI Agent** | Tools | Conversational AI assistant that investigates your logs | Everyone | Chat, pick a persona |
| **AI Onboarding** | Tools | Guided help to instrument an app for logging | Developers | Answer questions, get code |
| **Documentation** | Tools | In-app reference (DSL, guides) | Everyone | Read reference |
| **Settings** (gear, bottom) | — | Preferences, account, notifications; admin config | Everyone (admin extras) | Configure |
| **NogChat** (floating, bottom-right) | — | Always-available help + query assistant | Everyone | Ask questions |

The sidebar footer shows the storage backend (**ClickHouse**) and reminds you that **syslog ingest listens on port 514**. On mobile, the sidebar collapses behind a hamburger menu.

[SCREENSHOT: sidebar-nav]

---

## 5. Core Concepts

Only the terms you actually need to use LogNog.

| Term | Meaning | Example |
|------|---------|---------|
| **Log / event** | One line of activity from an app or device, stored as a row with fields. | `Failed password for admin from 203.0.113.5` |
| **Field** | A named piece of a log — hostname, severity, message, or any custom value you send. | `hostname=web-01`, `severity=3`, `user=admin` |
| **Index** | A named "folder" that groups related logs. Created automatically on the first log; you never pre-provision one. | `hey-youre-hired`, `main`, `vercel` |
| **Source** | A single app/device sending logs (identified by app name + hostname). Appears automatically under Data Sources. | `nginx` on `web-01` |
| **Severity** | Syslog severity 0–7, low number = more urgent. | 0 Emergency … 3 Error … 6 Info … 7 Debug |
| **DSL** | LogNog's Splunk-style query language: `search … | stats … | sort …`. | `search severity<=3 | stats count by hostname` |
| **Pipe (`|`)** | Passes results from one command to the next, like a conveyor belt of filters. | `search * | stats count | sort -count` |
| **Time range** | The window of time your search covers (e.g. last 15 min, last 7 days). Chosen with the time picker. | `-24h` to `now` |
| **Dashboard** | A saved page of panels (charts/tables), each backed by a query. | "System Overview" |
| **Panel** | One visualization on a dashboard (bar, pie, stat, table, etc.). | "Errors by host" bar chart |
| **Alert** | A rule that runs a query on a schedule and notifies you when a condition is met. | "More than 10 failed logins in 5 min" |
| **Silence** | A temporary mute for alerts — globally, per host, or per alert. | "Silence host web-01 for 2 hours" |
| **API key** | A secret token that lets an app send logs (or an integration read data) without a password. | `lnog_abc123…` |
| **Lookup** | A translation table that enriches logs (e.g. IP → location, status code → meaning). | `192.168.1.20 → "John's workstation"` |

---

## 6. Main User Workflows

### Workflow: Investigate an incident (search → context → filter)

**Goal:** Find out what happened around a problem and narrow to the root cause.
**Who uses this:** Everyone.
**When to use it:** A service errored, a user complained, an alert fired.
**Steps:**
1. Open **Search**.
2. Start broad: `search severity<=3` with a time range covering the incident.
3. Read the **timeline histogram** at the top — spikes tell you *when*. Click a bar to zoom into that moment, or drag across bars to select a range.
4. In a suspicious log line, click a value (e.g. a hostname) to **add it as a filter**, or use the **field sidebar** on the left to see which values are most common.
5. On a key log line, choose **"Events ±5 min on this host"** (Nearby Events) to see everything that happened around it on the same machine.
6. Refine with pipes: `search host=web-01 severity<=3 | stats count by app_name | sort -count`.

**Example:** A payment page is failing. You run `search index=my-app severity<=3`, spot a spike at 14:05, click the spike to zoom, click **"Nearby Events"** on the first error, and discover the database timed out at 14:04.
**Expected result:** A short list of the events that explain the problem.
**Common mistakes:** Time range too narrow (widen it); using an alias in a complex spot (use `hostname`, not `host`, if a filter behaves oddly).
**Troubleshooting:** No results? Start with `search *`, widen the time range, then add conditions one at a time.

### Workflow: Turn a search into ongoing monitoring (search → save → alert)

**Goal:** Get notified automatically the next time this problem happens.
**Who uses this:** User/Admin.
**Steps:**
1. Build the query on the **Search** page (e.g. `search app_name=sshd message~"Failed password" | stats count by source_ip | filter count>10`).
2. Click the **Alert** button in the results toolbar (or go to **Alerts → Create Alert**). The query and time range come with you.
3. Set a **trigger condition** (e.g. Number of Results *is greater than* 10), a **schedule** (e.g. every 5 minutes), a **severity**, and at least one **action** (email, notification channel, webhook…).
4. Click **Test Alert** to preview whether it would fire, then **Create Alert**.

**Example:** Alert when SSH brute-force is detected, sending a Slack message via a notification channel.
**Expected result:** A live alert that runs on schedule and notifies you when tripped.
**Common mistakes:** Forgetting to add an action (the alert will fire silently); setting the schedule tighter than the time range needs.
**Troubleshooting:** Use **Test Alert** and the **Alert History** modal to confirm it evaluates as expected.

### Workflow: Build a dashboard visually (Studio → canvas → save)

**Goal:** Create an at-a-glance operational view without editing config.
**Who uses this:** User/Admin.
**Steps:**
1. Open **Dashboards → Open Studio** (or **Dashboard Studio** directly).
2. On the left, type or click a starter query (e.g. **Top hosts**) and **Run** it — a live preview appears.
3. Use **Visualize as** to flip the chart type; LogNog marks a **Recommended** type for your data.
4. Click **Add to canvas**. Repeat for more panels, or use the **Field Explorer** to make a panel from any field in one click ("Top hostname", "hostname over time").
5. **Drag panels to reorder**, **duplicate**, or remove them on the right.
6. Click **Save dashboard**, name it (or pick an existing one), and you're done.

**Example:** A "Homelab Overview" with events-over-time, top hosts, errors by app, and a total-count stat — built in about a minute.
**Expected result:** A saved, shareable dashboard.
**Common mistakes:** Saving with zero panels (the Save button is disabled until you add one).
**Troubleshooting:** If a preview errors, fix the query in the editor — the preview updates live.

### Workflow: Connect a new app (get a key → send logs → verify)

**Goal:** Start collecting logs from one of your applications.
**Who uses this:** Developers/Admins.
**Steps:**
1. Go to **Settings → API Keys** (or **Account → API Keys**) and **create a key**. Copy it — it's shown only once.
2. Point your app at `POST /api/ingest/http` with the header `X-API-Key: <your key>` and a JSON array of logs (see the curl example in [§7.12](#712-data-sources--onboarding)).
3. Optionally add `X-Index: my-app` to group the logs under a named index.
4. In **Search**, run `search index=my-app` to confirm they arrived. The source also appears under **Data Sources** on its own.

**Example:** A Next.js app posts batches of 50 events every 5 seconds; they land in the `my-app` index and show up under Data Sources within seconds.
**Expected result:** `{"accepted":N,"index":"my-app"}` from the API, and searchable logs.
**Common mistakes:** Not flushing buffered logs before a script exits (logs get lost); reading the API key from env before it's loaded.
**Troubleshooting:** A `401 Unauthorized` means the key is missing or wrong; check the `X-API-Key` header and the key in Settings.

---

## 7. Feature Reference

Every feature gets: what it does · where to find it · how to use it · a concrete example · inputs/outputs · admin notes · limitations.

### 7.1 Search & Explore

**Status:** Available.
**What it does:** The heart of LogNog. Write a query in the **DSL** or plain English (AI mode), pick a time range, and see matching logs — as a log view, a table, or raw JSON — plus a timeline of when events occurred. Explore fields, live-tail incoming logs, and turn any search into an alert, report, or export.
**Where to find it:** Sidebar → **Explore → Search** (`/search`). The page title is **"Search & Explore."**

**How to use it:**
1. Choose a **mode** with the toggle top-right: **DSL** (query syntax) or **AI** (natural language — LogNog writes the query for you).
2. Type your query. In DSL mode you get **autocomplete**; a **history** dropdown remembers your recent queries and a **templates** dropdown offers ready-made queries (Basic, Statistics, Time Series, Data Shaping, Advanced).
3. Set the **time range** with the picker (relative like `-15m`, `-24h`, `-7d`, or an absolute window).
4. Click **Search** (or **Ctrl+Enter**).

**Reading the results:**
- The header shows the **result count and execution time** (e.g. *"1,204 results in 87ms"*).
- A **timeline histogram** ("Events over time") shows volume; **click a bar to zoom** into that bucket or **drag to select** a custom range.
- Toggle the view with **Log / Table / JSON**.
- The **field sidebar** (left) lists discovered fields and their top values; click to filter. Toggle it with the panel icon.
- Click a value inside a log line to **add it as a filter** (a chip appears; click the × to remove it).
- On any log line, use **"Events ±5 min on this host"** (Nearby Events) to see the surrounding activity on that machine.

**Live tail:** Click the **Live** button (or press **`l`**) to stream new logs in real time. It shows a per-second rate and total; **scroll up to pause** (auto-resumes after 5 seconds), or use **Pause / Resume / Clear / Stop**.

**Export & share:**
- **Copy** results as JSON, **CSV**, or **NDJSON** (NDJSON preserves nested fields).
- **curl** copies the search as a runnable `curl` command (replace `<YOUR_TOKEN>` with an API token).
- The current query and time range live in the URL (`?q=…&earliest=…&latest=…`), so you can **bookmark or share a search link** — it re-runs automatically when opened.
- **Save** the search, or one-click **Alert** / **Report** from the toolbar.

**Keyboard shortcuts** (press **`?`** to see them; disabled while typing in a field):

| Key | Action |
|-----|--------|
| `/` or `Ctrl+K` | Focus the query input |
| `t` | Open the time range picker |
| `l` | Toggle live tail |
| `Ctrl+Enter` | Run the search |
| `?` | Show the shortcuts cheat sheet |
| `Esc` | Close modals and dropdowns |

**Saving a search:** Click **Save**, then give it a **Name** (required), optional **Description**, **Folder**, and **Tags**. Optionally toggle **Schedule Search** to precompute results on a cron (every 5 min up to daily).

**Example use case:** `search app_name=nginx status_code>=500 | stats count by url | sort -count | limit 10` — the top ten URLs throwing server errors.
**Inputs:** A DSL or natural-language query and a time range.
**Outputs:** Matching log rows, counts/aggregations, a timeline, and exportable data.
**Admin notes:** Muting a source (in Data Sources) injects exclusion filters into everyone's searches so noisy sources disappear from results.
**Limitations:** Very broad queries over long time ranges are slow — narrow the time range, add filters, or aggregate with `stats`. AI mode quality depends on a configured AI model.

### 7.2 The DSL Query Language

**Status:** Available.
**What it does:** LogNog's Splunk-style query language. Every query starts with `search` and pipes results through transformation commands that compile to fast database SQL under the hood.
**Where to find it:** Used on the **Search** page; full reference in **Documentation** and in `docs/DSL_REFERENCE.md`.

**Shape of a query:**
```
search <conditions> | command1 | command2 | command3
```

**Search operators:** `=` (equals), `!=` (not equals), `>` `>=` `<` `<=` (numeric), `~` (contains / regex), `!~` (does not contain). Conditions are combined with implicit **AND**; `AND`, `OR`, and `IN (a, b, c)` are also supported. For OR-style matching you can also use regex alternation: `hostname~"^(router|firewall)$"`.

**Field aliases** (either form works): `host`→`hostname`, `app`→`app_name`, `src`→`source_ip`, `dst`→`dest_ip`, `srcport`→`source_port`, `dstport`→`dest_port`, `msg`→`message`.

**Commands** (all live today):

| Command | What it does | Example |
|---------|--------------|---------|
| `search` | Start the query; filter by field conditions. | `search severity<=3 host=web-01` |
| `filter` / `where` | Filter again mid-pipeline. | `… | where count>10` |
| `stats` | Aggregate: `count`, `sum`, `avg`, `min`, `max`, `dc` (distinct count), `values`, `earliest`, `latest`, with `by`. | `… | stats count by hostname` |
| `sort` | Order results (`sort -count` = descending by count; `sort asc timestamp`). | `… | sort -count` |
| `limit` | Keep the first N rows. | `… | limit 10` |
| `head` / `tail` | First / last N rows. | `… | head 100` |
| `table` / `fields` | Choose which columns to show. | `… | table timestamp hostname message` |
| `dedup` | Remove duplicates by field(s). | `… | dedup hostname` |
| `rename` | Rename a column. | `… | rename hostname as host` |
| `top` | Most common values of a field. | `… | top 10 hostname` |
| `rare` | Least common values. | `… | rare 10 hostname` |
| `bin` | Bucket a numeric/time field. | `… | bin span=1h timestamp` |
| `timechart` | Time-bucketed aggregation for line/area charts. | `… | timechart span=1h count` |
| `rex` | Extract fields from text with regex named groups. | `… | rex field=message "user=(?<user>\w+)"` |
| `eval` | Compute a new field. | `… | eval mb=bytes/1024/1024` |
| `filldown` | Fill blank values from the row above. | `… | filldown hostname` |
| `lookup` | Enrich rows from a lookup table. | `… | lookup geoip field=source_ip output country, city` |
| `transaction` | Group related events into transactions. | `… | transaction host` |

**Severity levels:** 0 Emergency, 1 Alert, 2 Critical, 3 Error, 4 Warning, 5 Notice, 6 Info, 7 Debug. Common filters: `severity<=2` (critical+), `severity<=4` (warnings+), `severity<=6` (exclude debug).

**Example use case:**
```
search message~"failed password" | stats count by source_ip | sort -count | limit 20
```
The twenty IPs with the most failed logins.
**Inputs:** A text query.
**Outputs:** Rows, aggregations, or time series.
**Admin notes:** The compiler targets ClickHouse in the Docker deployment and SQLite in the single-machine "Lite" deployment; the DSL is the same either way.
**Limitations:** Leading-wildcard/regex patterns (`message~".*error.*"`) are slow — prefer `message~"error"`. Not every Splunk command exists; the table above is the complete set. Some advanced patterns shown in older docs (e.g. `hour(timestamp)` grouping) are best expressed with `bin`/`timechart`.

### 7.3 Saved Searches

**Status:** Available.
**What it does:** Stores queries so you can rerun, schedule, share, and reuse them — and spin them into alerts, reports, or dashboard panels.
**Where to find it:** Sidebar → **Explore → Saved Searches** (`/saved-searches`). Also created from the **Search** page's **Save** button.

**How to use it:**
1. Click **New Saved Search** (or Save from the Search page).
2. Fill in **Name**, **Query**, optional **Description**, a **Default Time Range**, a **Cache TTL** (how long precomputed results stay fresh), an optional **Schedule** (with an **Enabled** toggle), **Tags**, and optionally **Share with all users**.
3. Back on the list, each card shows the query, time range, version, run count, and cache status. Use **Play** to run it (cached or forced), or the **⋮** menu for **Force Refresh, Edit, Duplicate, Create Alert, Add to Dashboard, Create Report, Delete**.

**Filtering the list:** Search by name/query/description, and toggle **My Searches**, **Shared**, **Scheduled**, or filter by **Tags**.

**Example use case:** Save "Top attacking IPs," schedule it every 15 minutes, and add it to a Security dashboard as a bar chart.
**Inputs:** A query plus metadata.
**Outputs:** A reusable, optionally scheduled saved search with cached results.
**Admin notes:** Sharing makes a search visible to all users; scheduling precomputes results in the background.
**Limitations:** Results modals show up to 100 rows; heavy scheduled searches add background load.

### 7.4 Dashboards

**Status:** Available.
**What it does:** Saved pages of panels (charts, tables, stats) that visualize your logs, with time control, auto-refresh, drilldown, sharing, branding, and import/export.
**Where to find it:** Sidebar → **Explore → Dashboards** (`/dashboards`); open one to view it (`/dashboards/:id`).

**Creating a dashboard** — four ways from the Dashboards page toolbar:
- **Open Studio** — the visual builder (see [§7.5](#75-dashboard-studio)).
- **Build from Index** — a wizard that generates a dashboard from an index's structure.
- **Blank** — an empty dashboard you fill with panels.
- **Import** — load a dashboard someone exported as JSON.

There are also **Starter Templates**: **System Overview**, **Network Traffic**, **Security Events**, **Application Logs**. Clicking one pre-fills the create dialog.

**Viewing & using a dashboard:**
- **Time picker** and **Auto-Refresh** (Off, 30s, 1m, 5m, 15m — with a live countdown; pauses for 30s after you interact, then resumes) sit in the header.
- **Refresh** re-runs all panels; **Share** opens the share dialog; the **Settings** dropdown holds Edit Layout, Branding, Export JSON, Export PDF, Duplicate, Set as Default, and AI Insights.
- **Drilldown:** click a bar, pie slice, table row, word, scatter point, funnel stage, or treemap node to jump into a filtered Search.
- **Variables:** dashboards can define variables (text/number/date/query, single or multi-select) referenced in panel queries with `$variable$`; a variables bar appears above the panels.
- **Pages/tabs:** a dashboard can have multiple pages (with emoji icons), always starting with an **All Panels** tab.

**Panel visualization types:** table, bar, pie (donut), line/area, **single stat**, heatmap, gauge, word cloud, scatter, funnel, treemap. Each panel supports **Fullscreen**, **View Origin**, **Edit**, **Duplicate**, and **Delete**.

**Editing:** turn on **Edit Layout** (a banner reads *"Drag panels to rearrange, resize from corners"*), then drag/resize panels, add pages, and use **Add Panel** (Title, Description, Query, and a visualization picker). **Copy Panel** pulls panels in from other dashboards. The **Studio** button jumps to the visual builder for the current dashboard.

**Sharing:** the share dialog can make a dashboard **public** (a token URL anyone can open) and optionally **password-protect** it. Public dashboards are read-only, render a subset of chart types, and show a *"Powered by LogNog"* footer. **Branding** lets you set a logo, accent color, and header color.

**Example use case:** A public, password-protected "Status" dashboard for stakeholders showing uptime and error rates.
**Inputs:** Panels (each a query + visualization), time range, optional variables and branding.
**Outputs:** A live, shareable, exportable (JSON/PDF) visual view.
**Admin notes:** "Set as Default" pins a dashboard as your landing dashboard. Public links bypass login — only share what's safe to expose.
**Limitations:** Public view supports fewer chart types than the private view; PDF export renders the current on-screen layout.

[SCREENSHOT: dashboard-view]

### 7.5 Dashboard Studio

**Status:** Available. *(Flagship, newer feature.)*
**What it does:** A visual, two-pane dashboard builder: search on the left with a **live preview**, drop panels onto a **canvas** on the right, reorder by dragging, then save to a new or existing dashboard — no config files, no guessing.
**Where to find it:** **Dashboards → Open Studio**, or `/dashboards/studio`. To edit an existing dashboard in Studio, use its **Studio** button or open `/dashboards/studio?dashboard=<id>`.

**How to use it:**
1. **Search & preview (left).** Type a query (with autocomplete) or click a starter — **Events over time**, **Top hosts**, **Errors by app**, **Total event count** — and it runs automatically. The result renders as a live panel preview.
2. **Pick the visualization.** Under **"Visualize as,"** flip between table, stat, line, area, bar, pie, gauge, heatmap, and word cloud. LogNog **auto-suggests** the best type and marks it **Recommended** with a sparkle.
3. **Name and add.** The panel title auto-fills from the query (a "smart title" like "Count by hostname"); override it if you like, then click **Add to canvas**.
4. **Field Explorer.** Below the preview, every field in your results appears as a pill with one-click buttons: **"Top <field>"** and **"<field> over time"** — instantly turning any field into a panel.
5. **Arrange (right).** Panels you add appear on the **Canvas**. **Drag to reorder**, **Duplicate**, or **Remove** them; click a panel's title to load it back into the editor for tweaking.
6. **Save.** Click **Save dashboard**, choose **➕ New dashboard** (and name it) or an existing dashboard, and Studio lays the panels out for you (two per row). In edit mode the button reads **Save changes** and updates the existing dashboard in place — creating new panels, updating edited ones, and deleting removed ones.

**Why it's easier than Splunk Dashboard Studio:** there's no JSON/XML source to hand-edit and no separate "data source" objects to wire up. You literally search, see the panel, flip its chart type, and drop it on a canvas. The Field Explorer turns exploration into panels in a single click, and editing an existing dashboard is the same flow — so building and refining feel identical.

**Example use case:** From `search * | stats count by app_name`, accept the recommended bar chart, click **Add to canvas**, then click **"Top severity"** in the Field Explorer to add a second panel — save both as "App Health" in under a minute.
**Inputs:** Queries and chart-type choices.
**Outputs:** A new or updated dashboard with laid-out panels.
**Admin notes:** Works against live data, so previews reflect exactly what a viewer will see.
**Limitations:** The canvas arranges panels in a simple two-per-row grid on save; fine-grained sizing/positioning is done afterward in the dashboard's **Edit Layout** mode.

[SCREENSHOT: dashboard-studio]

### 7.6 Alerts

**Status:** Available.
**What it does:** Rules that run a query on a schedule and notify you (or run an action) when a condition is met — with severity, throttling, testing, history, and silences.
**Where to find it:** Sidebar → **Monitor → Alerts** (`/alerts`).

**Creating an alert:**
1. Click **+ Create Alert** (or arrive from the Search/Saved Search **Alert** button with the query pre-filled).
2. **Basic Information:** **Alert Name** (required) and optional **Description**.
3. **Search Query:** the **DSL Query** that finds what you care about.
4. **Trigger Condition:**
   - **Type** — *Number of Results*, *Number of Hosts*, *Custom (any results)*, or *No Data (silence)*.
   - **Condition** — *is greater than*, *is less than*, *is equal to*, *is not equal to*, *drops by*, *rises by*.
   - **Threshold** — the number to compare against.
5. **Schedule:** a **Run Schedule** (every minute up to daily) and a **Time Range to Search** (last 1 minute up to last 24 hours).
6. **Severity:** Info, Low, Medium, High, or Critical.
7. **Throttling (optional):** enable to suppress repeat notifications for N seconds (prevents alert fatigue).
8. **Actions** (add one or more):
   - **Notify** (a notification channel or a custom Apprise URL → Slack, Discord, Telegram, PagerDuty, Teams, and 100+ services), with Title, Message, and Format (Plain/Markdown/HTML).
   - **Email** (recipient, subject, body).
   - **Webhook** (URL, GET/POST/PUT, optional custom JSON payload).
   - **Script** (a shell command — runs with the server's permissions; use with care).
   - **Log** (writes to LogNog's own logs).
   - **On Login** (shows a notification in the UI on next login, with an expiry).
9. Click **Test Alert** to preview whether it would fire and see sample results, then **Create Alert**.

**Message variables:** action text supports `{{variables}}` — e.g. `{{alert_name}}`, `{{alert_severity}}`, `{{result_count}}`, `{{timestamp}}`, `{{search_query}}`, log fields like `{{hostname}}`/`{{message}}`/`{{source_ip}}`, and stats like `{{count}}`/`{{avg}}`. Filters (`{{count:comma}}`, `{{name:upper}}`, `{{ts:relative}}`, `{{severity:badge}}`), aggregate helpers (`{{results:sum:bytes}}`), conditionals (`{{#if …}}`), loops (`{{#each results}}`), and even an AI summary (`{{ai_summary}}`) are available. Use the **VariableHelper** button next to any message field.

**Managing alerts:** the list shows severity, query, schedule, and trigger count. Per alert you can **Run Now** (▶), **Snooze** (quick 15 min–24 h, or "More options" for a custom silence), **Enable/Disable**, **Edit**, and **Delete**. Select several for **bulk Enable/Disable**. **Alert History** shows every time an alert fired and whether each action succeeded. Expanding an alert reveals its **health**: trigger condition, time range, **Last Run**, **Last Triggered**, and trigger count.

**Example use case:** *"High Error Rate"* — `search severity<=3 | stats count` → Number of Results *is greater than* 100, every 5 minutes over the last 5 minutes, Critical, Notify a Slack channel with `{{ai_summary}}`.
**Inputs:** A query, condition, schedule, severity, and actions.
**Outputs:** Notifications/actions when tripped, plus history.
**Admin notes:** Notification channels are configured centrally in **Settings → Notifications**; email needs SMTP configured server-side; scripts run with API-server permissions.
**Limitations:** "No Data" triggers depend on a source having sent data before; script actions are powerful and should be restricted to trusted admins.

[SCREENSHOT: alerts-page]

### 7.7 Silences

**Status:** Available.
**What it does:** Temporarily mutes alerts so maintenance windows or known issues don't spam you.
**Where to find it:** `/silences` (also reachable from an alert's **Snooze → More options**).

**How to use it:**
1. Click **+ Create Silence**.
2. Pick a **Silence Level**: **Global** (all alerts), **Host** (enter a hostname), or **Alert** (pick a specific alert).
3. Choose a **Duration** (1 hour, 4 hours, 24 hours, 1 week, or Indefinite) and optionally a **Reason** and **Created By**.
4. Active silences appear as cards showing the level, target, reason, remaining time, and who created them; delete a card to end the silence early.

**Example use case:** Silence host `web-01` for 2 hours during a planned reboot.
**Inputs:** Level, target, duration, reason.
**Outputs:** Suppressed alert notifications for the window.
**Limitations:** Silences suppress notifications, not evaluation — the underlying condition is still checked.

### 7.8 Anomaly Detection

**Status:** Available (AI analysis requires a configured model).
**What it does:** UEBA — "User and Entity Behavior Analytics." LogNog learns each entity's normal baseline (logins per user, data per host, error rates per app, activity by time) and flags statistically unusual behavior, with optional AI risk scoring.
**Where to find it:** Sidebar → **Monitor → Anomaly Detection** (`/anomaly`).

**How to use it:**
1. Click **Calculate Baselines** to learn what "normal" looks like from your history.
2. Click **Run Detection** to scan for outliers.
3. Review the **stat cards** (Total Anomalies, Critical, High Risk, Entities Affected) and charts (**Anomaly Trend**, **Top Affected Entities**).
4. In the **Recent Anomalies** list, each row shows the entity, severity, anomaly type (Spike, Drop, Unusual Time, New Behavior, Peer Anomaly), the metric (observed vs expected), a deviation (σ), and a risk score. Filter by severity.
5. Click **Analyze** (brain icon) for an AI risk assessment and suggested actions, and mark each anomaly a **true positive** (👎 confirm) or **false positive** (👍 dismiss) to improve accuracy.

**Example use case:** A service account that normally has 0 failed logins suddenly has 50 in five minutes — flagged as a Spike with a high risk score.
**Inputs:** Historical logs (for baselines); your true/false feedback.
**Outputs:** Ranked anomalies with explanations.
**Admin notes:** AI analysis uses the configured Ollama/OpenRouter model; baselines need enough history to be meaningful.
**Limitations:** Without baselines or with sparse data, detection is limited; AI explanations require an AI model.

### 7.9 Synthetic Monitoring

**Status:** Available (Browser test type is Planned).
**What it does:** Proactively tests that your websites, APIs, and services are up and responding correctly — like a robot user checking from the outside — and can alert after repeated failures.
**Where to find it:** Sidebar → **Monitor → Synthetic** (`/synthetic`).

**How to use it:**
1. Click **New Test**.
2. Enter a **Test Name** and optional description, then pick a **type**: **HTTP** (URL check), **API** (endpoint with assertions), **TCP** (port connectivity), or **Browser** (Planned).
3. Configure the target (method + URL for HTTP/API; host + port for TCP), a **Schedule** (every minute up to daily via cron), and a **Timeout**.
4. Set **Alert after consecutive failures** (1–10).
5. Save. The dashboard shows **Total Tests**, **Healthy**, **Avg Response**, and a by-type breakdown. Each test card shows its status (success/failure/timeout/error), response time, and last run.
6. Use **Run now** (▶) to test immediately, the play/pause toggle to enable/disable, and **View results** (bar-chart icon) to see the last 50 runs (timestamp, status, response time, status code, assertions passed/failed, error).

**Example use case:** "Production API Health" — HTTP GET `https://api.example.com/health` every 5 minutes, alert after 3 consecutive failures.
**Inputs:** A target, schedule, timeout, and failure threshold.
**Outputs:** Uptime/response history and (via alerts) notifications on failure.
**Admin notes:** Tests run from the LogNog server; Browser tests use Playwright and require backend support.
**Limitations:** The assertion builder isn't fully exposed in the UI yet; scheduling granularity is limited to cron; Browser type is Planned.

### 7.10 Analytics

**Status:** Available.
**What it does:** A live, auto-refreshing metrics dashboard summarizing your logs: volume, severity mix, and the busiest hosts and applications.
**Where to find it:** Sidebar → **Analyze → Analytics** (`/stats`). Two tabs: **Analytics** and **Storage**.

**How to use it:**
- **Stat cards:** Total Logs, Last 24 Hours, Errors (24h), Active Hosts.
- **Charts:** **Log Volume** (events per hour, total vs errors), **Severity Distribution** (donut — click a slice to search that severity), **Top Hosts** (bar — click to search that host), **Top Applications** (bar — click to search that app).
- The page auto-refreshes (stats every 30s, trends every 60s); a *"Live"* indicator confirms this.
- The **Storage** tab shows disk usage.

**Example use case:** Spot an error spike in the last 24 hours, click the Error slice, and land in Search already filtered.
**Inputs:** None — it reads your existing logs.
**Outputs:** Charts and drill-through links into Search.
**Admin notes:** An empty state ("No data yet") appears until logs are ingested.
**Limitations:** Time windows are fixed (24h for trends, all-time for totals); drilldown is from charts, not the stat cards.

### 7.11 Reports

**Status:** Available (email delivery requires SMTP).
**What it does:** Generates HTML reports from a query — view in the browser, print to PDF, download — and schedules them to be emailed automatically.
**Where to find it:** Sidebar → **Analyze → Reports** (`/reports`).

**How to use it:**
- **Generate now:** click **Generate Report**, enter a **Report Title**, a **Query**, and a **Time Range** (last hour to last 30 days), then **Preview** (opens an in-browser HTML report you can print or make fullscreen) or **Download** the HTML.
- **Schedule:** click **Schedule**, enter a **Report Name**, **Query**, a **Schedule** (every hour, every 6 hours, daily at midnight, daily at 8 AM, weekly, monthly), and **Recipients** (comma-separated emails), then **Create Schedule**.
- Scheduled reports list their query, schedule, recipients, and last run; toggle each on/off or delete it.

**Example use case:** A "Daily Error Summary" (`search severity<=3 | stats count by hostname`) emailed to the team every morning.
**Inputs:** A query, schedule, and recipients.
**Outputs:** An HTML report (viewable/downloadable) and scheduled emails.
**Admin notes:** Email delivery needs `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` set on the server; in production, reports are triggered from inside the API container which holds the SMTP credentials.
**Limitations:** No manual "run now" for a scheduled report from the UI; no built-in report templates (you supply the query); no email preview before scheduling.

### 7.12 Data Sources & Onboarding

**Status:** Available.
**What it does:** Shows every source currently sending logs (with indexes and volumes) and walks you through connecting new ones. **The key idea: all you need is an API key.** You never pre-declare or request access to an index — indexes are created automatically on the first log, and sources appear here on their own.
**Where to find it:** Sidebar → **Configure → Data Sources** (`/data-sources`). Three tabs: **Active Sources**, **Source Templates**, **Source Config**.

**The simplified onboarding message (verbatim from the UI):** *"All you need is an API key. There's nothing to provision — no index to create or request access to. Name a key, paste it into your app, and start sending logs. They'll show up under Data Sources automatically."* The optional **`X-Index`** header just groups logs into a named index (like a folder); leave it off and logs land in a default index.

**Active Sources tab:**
- An **index summary** row (each index is clickable → Search filtered to it) with log counts and a mute toggle.
- A table of active sources: **Status** (green Active <15 min, yellow Recent, orange Inactive, gray Stale), **Source** (app + hostname), **Index**, **Protocol** (http/syslog/agent…), **Logs (7d)**, **Errors**, **Last Seen**, and **Actions** (mute, or **View Logs** which opens Search scoped to that source).
- If nothing is sending yet, an empty state shows three ways to start: **Syslog** (port 514), **HTTP API** (`POST /api/ingest/http` with `X-Index`), and the **LogNog In Agent**.

**Add Data Source wizard** — click **Add Data Source**:
1. **Choose Type:** **HTTP / JSON** (popular), **Syslog**, **LogNog Agent**, **Supabase**, or **Vercel**.
2. **Configure:** create a new API key (or pick an existing one) right in the wizard, see the read-only **endpoint URL**, and optionally set an **Index Name** (with the reassurance that a blank index just uses a default and any name auto-creates). Syslog and Agent show their own setup notes (port 514; download the agent).
3. **Test & code snippets:** paste sample JSON to **Preview Fields**, click **Send Test Event** (*"Event received! View in Search"* on success), and copy ready-made **curl / Node.js / Python / Go** snippets with your key and index pre-filled.

**Source types and how they connect:**

| Type | How logs arrive |
|------|-----------------|
| **HTTP / JSON** | `POST /api/ingest/http` with `X-API-Key` and a JSON array; optional `X-Index`. Best for apps. |
| **Syslog** | Point routers/firewalls/servers at **UDP/TCP port 514**. Best for network gear (pfSense, Synology, UniFi, rsyslog). |
| **LogNog Windows Agent** | Install the agent to ship log files and Windows Event Logs (see [§7.13](#713-the-lognog-windows-agent-lognog-in)). |
| **Supabase** | Supabase Log Drains → `POST /api/ingest/supabase`; index `supabase` (Postgres, Auth, Storage, Realtime, Edge Functions). |
| **Vercel** | Vercel Log Drains → `POST /api/ingest/vercel`; index `vercel` (Static, Lambda, Edge, Build). |

**curl example (HTTP/JSON):**
```bash
curl -X POST https://logs.machinekinglabs.com/api/ingest/http \
  -H "Content-Type: application/json" \
  -H "X-API-Key: lnog_your_key_here" \
  -H "X-Index: my-app" \
  -d '[{"level":"info","message":"Hello from my app!","userId":"user_123"}]'
# → {"accepted":1,"index":"my-app"}
```
Then confirm with `search index=my-app` on the Search page.

**Field mapping niceties:** LogNog auto-maps common field names — `timestamp`/`time`/`@timestamp`/`date` → timestamp; `level`/`severity`/`loglevel` → severity (mapped to syslog levels); `message`/`msg`/`log`/`text`/`body` → message; `hostname`/`host`/`source`/`server` → hostname. Everything else is stored as searchable structured data.

**Source Templates tab:** pre-built parsing profiles (database, security, web, system, application) with setup instructions, agent/syslog config examples, field extractions, sample log lines, and example queries. Filter by category and click a template for details.

**Example use case:** Connect Hey You're Hired by creating a key named "HYH Production," setting `X-Index: hey-youre-hired`, and posting batched events — they appear under Data Sources within seconds.
**Inputs:** An API key and log payloads.
**Outputs:** Searchable logs, an auto-created index, and a listed source.
**Admin notes:** Keys can be scoped to `ingest`/`read`/`write`/`admin`; in production the `/api/ingest` path is exempt from the Cloudflare Access login so machines can ship logs.
**Limitations:** Only the HTTP ingest path currently enforces per-key **index scoping**; syslog is unauthenticated by design (network-restricted).

[SCREENSHOT: data-sources]

### 7.13 The LogNog Windows Agent (LogNog In)

**Status:** Available (Windows/Linux/macOS; some collectors are Partial/Planned).
**What it does:** A lightweight agent you install on a machine to ship its log files and Windows Event Logs to LogNog, with offline buffering so nothing is lost during an outage. It also offers File Integrity Monitoring (FIM).
**Where to find it:** Download from the project releases (linked in the Add Data Source wizard's **LogNog Agent** step); configured via a system-tray menu or `config.yaml`.

**Installing & first run:**
1. Download and run the agent (Windows `lognog-in.exe --install`; Linux/macOS packages also available).
2. It appears in the **system tray**. Right-click → **Configure**.
3. Enter your **LogNog server URL** and paste an **API key** (from Settings → API Keys).
4. Add **Watch Paths** (files/globs to ship) and, optionally, **FIM paths** to monitor for changes.
5. Save. The tray icon shows **🟢 connected**, **🟡 buffering** (server unreachable, will retry), or **🔴 error**.

**What it collects:**
- **Log files** — any files/globs you point it at (e.g. `C:\Logs\*.txt`, `/var/log/**/*.log`).
- **Windows Event Logs** — Security, System, Application channels, with a built-in focus on high-value security events (4624 logon, 4625 failed logon, 4740 lockout, 7045 service installed, etc.). Configure in `config.yaml` under `windows_events`.
- **File Integrity Monitoring** — SHA-256 hashes of monitored files; alerts on create/modify/delete.

**Running as a Windows Service / reliability:** enable **Start on boot** so the agent runs unattended. It keeps a local SQLite **buffer** of pending events and a FIM baseline, so if the server or machine restarts, queued logs are shipped when the connection returns — **no data loss on an outage or restart**. It's designed to be light (target <50 MB RAM, <1% CPU).

**Querying agent data:**
```
search source_type=windows_events event_id=4625 | stats count by computer   # failed logons
search source_type=windows_events event_id=7045 | table timestamp computer message  # new services
```
**Inputs:** Watch paths, event-log channels, server URL, API key.
**Outputs:** Log and FIM events shipped to LogNog (index typically `agent`).
**Admin notes:** Store the API key securely (the agent uses the OS keychain where available) and require TLS to the server.
**Limitations:** macOS Unified Log and Linux journald collection are Partial/Planned; the richest, best-tested path today is Windows (files + Event Log).

### 7.14 Data Models (CIM)

**Status:** Available.
**What it does:** The Common Information Model — normalize different sources' field names to standard ones so a single search works everywhere (e.g. Windows `AccountName`, Linux `user`, and AWS `userName` all become `user`).
**Where to find it:** Sidebar → **Configure → Data Models** (`/cim`). Two tabs: **Data Models** and **Field Mappings**.

**How to use it:**
1. **Data Models tab:** browse built-in models by category (Authentication, Network, Endpoint, Web, Custom). Expand one to see its fields (name, type, description, required, aliases). Create your own with **Add Model**.
2. **Field Mappings tab:** click **Add Mapping** and set **Source Type** (e.g. `nginx`), **Source Field** (e.g. `remote_addr`), a **Data Model**, the target **CIM Field**, and an optional **Transform** (`lower()`, `int()`, `float() * 1000`, `substr(0,10)`, …). Enable it.
3. Now searches using the standard field (`search user=admin`) match across all mapped sources.

**Example use case:** Map `AccountName` (Windows) and `user` (Linux) both to the CIM `user` field, then investigate `search user=admin` everywhere at once.
**Inputs:** Models and per-source field mappings.
**Outputs:** Normalized fields usable in searches.
**Admin notes:** Built-in models can't be edited or deleted; create Custom models for your own needs.
**Limitations:** Mappings must be maintained as you add new source types.

### 7.15 Knowledge

**Status:** Available.
**What it does:** The "brain" layer that turns raw text into structured, enriched, actionable data. Six tools: **Field Extractions**, **Event Types**, **Tags**, **Lookups**, **Workflow Actions**, and **Source Annotations**.
**Where to find it:** Sidebar → **Configure → Knowledge** (`/knowledge`), with a tab per tool.

**Field Extractions** — parse fields out of message text using **regex** (named groups) or **grok** patterns. Create one with a name, source type, field name, pattern type, and pattern; **Test** it against a sample log before saving. Example grok: `SRC=%{IP:source_ip} DPT=%{NUMBER:dest_port}`.

**Event Types** — auto-classify logs by a DSL search string. Give it a name, a search string (e.g. `app_name=sshd message~"Failed password"`), a priority (lower = evaluated first), and enable it. Then query `search event_type=ssh_failure`.

**Tags** — attach a label to a field value (Tag Name + Field + Value Pattern), e.g. tag `production` when `hostname` matches `prod-*`. Query `search tag=env:production`.

**Lookups** — enrichment tables (Manual JSON or CSV) with a key field and output fields, e.g. map an IP to a location/owner or a status code to its meaning. Use in the DSL with `lookup`.

**Workflow Actions** — quick actions from a log value: **URL** (open an external page with `$field_value$` substituted, e.g. an AbuseIPDB reputation check) or **Search** (run a related query). Advanced script-type actions (Slack, PagerDuty, block-IP, threat scoring) are available via the API.

**Source Annotations** — add context that appears as a tooltip when you hover over `hostname`, `app_name`, or `source` in results: an emoji, title, description, extended details, a linked lookup, tags, and a highlight color.

**Example use case:** Extract `source_ip` from firewall logs, classify them as `firewall_block`, tag internal IPs, and add a "Check IP reputation" workflow action — so investigators get structure, labels, and one-click enrichment.
**Inputs:** Patterns, search strings, tables, and action definitions.
**Outputs:** Richer, classified, enriched, and actionable logs.
**Admin notes:** Extraction/event-type priority controls order (lower first); test patterns before enabling.
**Limitations:** Script workflow actions run server-side with a timeout and should be reserved for trusted admins; tags and lookup keys are case-sensitive.

### 7.16 Assets

**Status:** Available.
**What it does:** An inventory of the "things" in your environment (servers, workstations, network devices, containers, cloud instances), auto-discovered from logs and enrichable with owner and criticality.
**Where to find it:** Sidebar → **Configure → Assets** (`/assets`).

**How to use it:**
1. Click **Discover** to auto-populate assets from the last 24 hours of logs, or **Add Asset** manually.
2. Each asset has a **Type**, **Status** (Active/Inactive/Decommissioned), **Criticality** (0–100), **Owner**, **Department**, **Location**, identifier, and display name.
3. Filter by type/status or search; edit to add context.

**Example use case:** Mark the production database as criticality 95 with an owner, so incident responders instantly know its importance.
**Inputs:** Discovery + manual enrichment.
**Outputs:** A searchable asset inventory (usable in lookups/correlation).
**Admin notes:** Discovered assets are marked source **auto**; manual ones **manual**.
**Limitations:** Discovery is a background job; criticality is set by you, not inferred.

### 7.17 Identities

**Status:** Available.
**What it does:** An inventory of the "people/accounts" in your environment (users, service accounts, system, external), auto-discovered from logs, with privilege flags and risk scores.
**Where to find it:** Sidebar → **Configure → Identities** (`/identities`).

**How to use it:**
1. **Discover** from recent logs or **Add Identity** manually.
2. Each identity has a **Type**, **Status**, **Privileged** flag, **Risk Score** (0–100), plus email, department, title, manager.
3. Filter by type, status, or privilege; edit to enrich.

**Example use case:** Flag `svc-backup` as a privileged service account and review privileged identities that haven't logged in for 90 days.
**Inputs:** Discovery + manual enrichment.
**Outputs:** A searchable identity inventory for investigations and access reviews.
**Admin notes:** Pairs with Anomaly Detection (per-identity baselines) and Assets for full incident context.
**Limitations:** Risk scores are set by you unless enriched by other tooling.

### 7.18 AI features (AI Agent, NogChat, NL→DSL)

**Status:** Available (requires a configured AI model — local Ollama or OpenRouter).
**What they do:** Three ways to work with your logs in plain English.

**Natural language → DSL (AI search mode).** On the **Search** page, flip to **AI** mode and ask a question ("Show me all errors in the last hour"). LogNog generates a DSL query, shows its **confidence** (High/Medium/Low) and an explanation, and you can run or **Edit** it. Suggested questions help you start.

**AI Agent** (sidebar → **Tools → AI Agent**, `/agent`). A full conversational assistant that can search logs, look up assets/identities, check anomalies, enrich IPs, and create alerts — reasoning step by step and showing its tool calls and results. Pick a **persona** (e.g. Security Analyst, SRE, Compliance) from the header; keep multiple **conversations** in the left panel. A status badge shows **AI Online/Offline**.

**NogChat** (the floating chat button, bottom-right, on every page). Your always-available assistant. It answers "how do I…" questions about LogNog, helps you write queries (with copy-ready DSL and documentation **citations**), compares Splunk to LogNog, and can analyze your data ("What are my top error sources?") by running a query and summarizing the result. Quick-action buttons and starter prompts get you going.

**How to use it:** Open the AI Agent or NogChat, type a question, and follow up conversationally. In AI search mode, type your question in the query box and press **Ask AI**.
**Inputs:** Plain-English questions.
**Outputs:** Generated queries, answers, analyses, and (via the Agent) actions.
**Admin notes:** Configure the model in **Settings → AI** (Ollama URL + models, or an OpenRouter API key); test the connection there. Everything can run locally with Ollama — no cloud, no per-query cost.
**Limitations:** All AI features are disabled/limited when no model is configured (badges read "AI Offline"); generated queries should be reviewed, especially at lower confidence.

[SCREENSHOT: nogchat]

### 7.19 MCP server for Claude Desktop

**Status:** Available.
**What it does:** Lets Claude Desktop talk to LogNog through the Model Context Protocol — so you can search logs, build dashboards, set alerts, and generate reports by chatting with Claude, while your data stays on your infrastructure.
**Where to find it:** Configured in Claude Desktop; LogNog exposes it at `/mcp/sse`.

**How to use it:**
1. In **Settings → API Keys**, create a key named e.g. "Claude Desktop."
2. Add LogNog to your Claude Desktop config (`claude_desktop_config.json`) pointing at `/mcp/sse` with your `X-API-Key`.
3. Restart Claude Desktop and ask things like "Show me error logs from the last hour" or "Create a dashboard for nginx traffic."

**Inputs:** Natural-language prompts in Claude Desktop.
**Outputs:** Searches, dashboards, alerts, silences, ingested logs, and reports created in LogNog.
**Admin notes:** MCP respects LogNog roles (admin full, user read + create, readonly read); all traffic stays on your network.
**Limitations:** Requires Claude Desktop and a valid API key; SSE connections can drop behind aggressive reverse proxies.

---

## 8. Admin Guide

Administrators use the same app plus extra tabs in **Settings** (gear icon, bottom of the sidebar). Admin-only tabs are **Users**, **Data**, **GeoIP**, **System**, and **AI**; everyone sees **Preferences**, **Account**, and **Notifications**.

### First-time setup

On a brand-new LogNog with no accounts, the login page becomes a **Setup** screen. Enter a username, email, and password (8+ characters) and click **Create Admin Account** — you become the first administrator and are logged in automatically.

### Managing users (Settings → Users)

- **Create user:** click **New**, enter **Username** (letters/numbers/underscore/hyphen), **Email**, **Password** (8+ chars), and a **Role** (`user`, `readonly`, or `admin`).
- **Change a role:** use the role dropdown on a user's card (takes effect immediately).
- **Activate/Deactivate:** toggle a user's access without deleting them.
- Role reminder shown in-page: *"Admin has full access. User can search and view dashboards. Read Only can only view data."*
- You can't change your own role/status from your own card.

### API keys (Settings → API Keys, also under Account)

- **Create a key:** click **New Key**, give it a descriptive **Name** (e.g. "LogNog In Agent – Server 1"), choose **Permissions** (`read`, `write`, `admin`; the Add-Data-Source wizard uses an `ingest` scope), and optionally an **expiry in days**.
- **Save it immediately:** the full key is shown **once** in a banner (*"This is the only time you'll see this key"*) with a copy button. After that only a masked prefix is visible.
- **Restrict by index (optional):** keys can be scoped so an app can only write to its own index (enforced on the HTTP ingest path).
- **Revoke:** click the trash icon on a key; confirm. Revoked keys are marked and stop working immediately.

### Notification channels (Settings → Notifications)

- **Add a channel:** name it, pick a **Service**, paste an **Apprise URL** (e.g. `slack://tokenA/tokenB/tokenC/#channel`), add a description, and enable it. LogNog uses **Apprise**, supporting 100+ services (Slack, Discord, Telegram, Teams, PagerDuty, ntfy, Pushover, SMS, email, generic webhooks…).
- **Test** a channel with the send button; a green/red result tells you if delivery worked.
- Channels appear as options in every alert's **Notify** action, so you configure a destination once and reuse it everywhere.
- A banner tells you whether **Apprise is configured** on the backend.

### Scheduled reports (Reports page + SMTP)

Email delivery requires SMTP configured on the server: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. In the containerized production deployment, reports are triggered from inside the API container (which holds the SMTP credentials). Create and manage schedules from the **Reports** page (see [§7.11](#711-reports)).

### Data management (Settings → Data)

- **Generate demo data:** choose a count (10–10,000), a time range, and log types (syslog, nginx, auth, app, firewall, database) — great for demos and screenshots.
- **Export data:** download recent logs as JSON.
- **Clear all data** or **delete logs by criteria** (index, app, app-scope, older-than-N-days) — both require confirmation. In ClickHouse, deletions are asynchronous.
- The tab also shows total log count and the oldest→newest time range.

### GeoIP (Settings → GeoIP)

Enable geographic IP lookups (country/city/ASN) using MaxMind GeoLite2 databases. If not configured, the tab shows setup instructions (register at MaxMind, generate a license key, run the download script in the API container, restart the API). Once enabled you can test a lookup (e.g. `8.8.8.8`) and see country, city, coordinates, timezone, and ASN.

### System (Settings → System)

Read-only system info (API version, Node version, uptime, memory) and configuration (retention, rate limit, max batch size). Also configure **Internal Logging** — LogNog logging its own operations to the `lognog-internal` index (toggle self-monitoring, set a minimum level and categories). Query it with `search app_name="lognog-internal"`.

### AI (Settings → AI)

Configure the AI backend that powers AI search, the AI Agent, NogChat, and anomaly analysis:
- **Ollama:** URL, Chat Model, optional Reasoning Model, Embedding Model; **Test Connection** lists available models.
- **OpenRouter (cloud fallback):** API key + model.

### Preferences & Account (all users)

**Preferences:** Theme (Light/Dark/System), Default Time Range, Date & Time Format, Display Timezone, Default View Mode (Log/Table/JSON), Field Sidebar default, Query History Limit, and a button to re-show the welcome wizard. **Account:** view profile/role/last login, change password, and manage your own API keys.

### Production operations (self-hosted)

- **Deployment:** everything runs in Docker (`docker-compose up -d`) — ClickHouse (storage), Vector (syslog on 514), API (4000), UI + Nginx (80), Apprise (notifications). A single-machine "Lite" mode uses SQLite instead of ClickHouse.
- **Remote access:** commonly a Cloudflare Tunnel or a reverse proxy with automatic HTTPS (Caddy). The `/api/ingest` path is exempt from the login gate so machines can ship logs.
- **If the site is down (502/530):** the Docker containers are usually stopped or wedged. Check `docker ps`, `docker start lognog-api`, then `docker restart lognog-nginx`. If ClickHouse is wedged, `wsl --shutdown` (engine auto-restarts) then `docker compose up -d`.
- **Backups:** back up the ClickHouse data volume (or the `/data/lognog.db` SQLite file in Lite/production auth) on a schedule.

---

## 9. Examples and Scenarios

### Scenario 1: "Our website is throwing 500s"

**User goal:** Find and explain a spike in server errors.
**Steps taken:**
1. **Search:** `search app_name=nginx status_code>=500` over Last 24 hours.
2. Notice a spike in the timeline; **click the bar** to zoom.
3. `search app_name=nginx status_code>=500 | stats count by url | sort -count | limit 10` to find the worst endpoints.
4. **Nearby Events** on the first error to see what else happened on that host.
**Expected outcome:** A short list of failing URLs and the surrounding events (e.g. an upstream timeout).
**What the user learns:** How to go from broad → zoomed → aggregated → root cause using pipes and the timeline.

### Scenario 2: "Alert me about SSH brute-force"

**User goal:** Get a Slack ping when someone hammers SSH.
**Steps taken:**
1. Build `search app_name=sshd message~"Failed password" | stats count by source_ip | filter count>10`.
2. Click **Alert**, set Number of Results *is greater than* 0, every 5 minutes, severity High.
3. Add a **Notify** action to the "slack-ops" channel with message `{{ai_summary}} — {{result_count}} sources`.
4. **Test Alert**, then **Create Alert**.
**Expected outcome:** A live alert that Slacks you when brute-force is detected.
**What the user learns:** Search → Alert handoff, message variables, notification channels.

### Scenario 3: "Give leadership a status page"

**User goal:** A shareable, always-current health view.
**Steps taken:**
1. **Dashboard Studio:** add **Events over time**, **Errors by app**, and a **Total event count** stat; use the Field Explorer to add **Top hostname**.
2. **Save** as "Ops Status."
3. Open it, set **Auto-Refresh** to 1 minute, add **Branding** (logo + accent), then **Share** → make public with a password.
**Expected outcome:** A password-protected public URL that refreshes itself.
**What the user learns:** Visual building, auto-refresh, and safe public sharing.

### Scenario 4: "Instrument a new app"

**User goal:** Get a Next.js app's logs into LogNog.
**Steps taken:**
1. **Settings → API Keys → New Key** ("MyApp Prod"); copy it.
2. In the app, POST batches to `/api/ingest/http` with `X-API-Key` and `X-Index: my-app` (flush the buffer before the process exits).
3. `search index=my-app` to verify; the source shows up under **Data Sources**.
4. Optionally use **AI Onboarding** to get framework-specific logging code.
**Expected outcome:** Live app logs in a dedicated index.
**What the user learns:** The "just an API key" model, indexes as auto-created folders, and verification.

---

## 10. Troubleshooting

| Problem | Likely cause | What to try | When to contact admin |
|---------|--------------|-------------|-----------------------|
| Search returns **no results** | Time range too narrow, wrong field name, or no data yet | Widen the time range; start with `search *`; check `hostname` vs `host`; confirm the source is active in Data Sources | If the source shows Stale/Inactive in Data Sources |
| **Logs from my app aren't arriving** | Missing/invalid API key, wrong endpoint, or unflushed buffer | Test with the curl example; expect `{"accepted":N,…}`; ensure the endpoint is `/api/ingest/http`; flush before script exit | A `401` means the key is missing/invalid — ask an admin to check it |
| **Search is slow** | Broad query over a long time range | Narrow the time range, add filters, aggregate with `stats`, avoid leading-wildcard regex | If consistently slow across small ranges (server sizing) |
| **Alert never fires** | Wrong condition/threshold, or an active silence | Use **Test Alert**; check **Alert History**; check for a matching silence on `/silences` | If the schedule/evaluation itself looks broken |
| **Alert fired but no notification** | No action added, or channel misconfigured | Confirm the alert has an action; test the notification channel in Settings | Email needs SMTP; Notify needs a configured channel |
| **Report email didn't send** | SMTP not configured | Verify `SMTP_*` env vars; in production trigger from inside the API container | SMTP is an admin/server task |
| **AI Agent / NogChat says "AI Offline"** | No model configured or unreachable | Ask an admin to set Ollama/OpenRouter in **Settings → AI** and Test Connection | This is an admin-only setting |
| **Public dashboard asks for a password I don't have** | It's password-protected | Ask the dashboard owner for the password | — |
| **Whole site returns 502 / 530** | Docker containers stopped or ClickHouse wedged | (Admin) `docker start lognog-api`; `docker restart lognog-nginx`; if wedged, `wsl --shutdown` then `docker compose up -d` | Admin/server task |
| **Can't see the Users/Data/System tabs** | You're not an admin | These tabs are admin-only | Ask an admin to grant the role if you need it |

---

## 11. FAQ

**Do I have to create an index before sending logs?**
No. Indexes are created automatically on the first log. The optional `X-Index` header just groups logs under a name of your choosing; leave it off and logs land in a default index.

**What's the difference between an index and a source?**
An **index** is a named folder for logs; a **source** is a single app/device that's sending them. Many sources can write into one index, and one source writes into one index at a time.

**Is my data sent anywhere?**
No. LogNog is self-hosted — logs stay in your ClickHouse/SQLite on your infrastructure. Even the AI features can run against a local Ollama model.

**Do I need to know Splunk?**
No, but if you do, you'll feel at home: the DSL is Splunk-style (`search … | stats … | sort …`). If you don't, use **AI mode** on the Search page or ask **NogChat** to write queries for you.

**How do I share a search or a dashboard?**
For a search, copy the browser URL — it contains the query and time range and re-runs on open. For a dashboard, use **Share** to create a public (optionally password-protected) link, or **Export JSON** to hand off the whole dashboard.

**How do I get alerts into Slack/Discord/Teams?**
An admin adds a **Notification channel** in **Settings → Notifications** (via Apprise). Then any alert's **Notify** action can target it.

**Can I export my results?**
Yes — from the Search toolbar: **CSV**, **NDJSON** (keeps nested fields), **Copy as JSON**, or **Copy as curl**. Dashboards export to **JSON** and **PDF**.

**What's the LogNog In agent for?**
Shipping logs from a machine that can't easily POST JSON — log files and Windows Event Logs — with offline buffering so nothing is lost during outages.

**Why can't I see the admin settings tabs?**
They're restricted to the **admin** role. Ask an administrator if you need access.

**How is the AI Agent different from NogChat?**
NogChat is the lightweight, always-available helper (great for "how do I…" and quick queries). The **AI Agent** is a fuller assistant that runs multi-step investigations with tools and personas.

**Can Claude Desktop use LogNog?**
Yes — via the **MCP server**. Create an API key and add LogNog to Claude Desktop's config (see [§7.19](#719-mcp-server-for-claude-desktop)).

---

## 12. Glossary

- **Alert** — A saved rule that runs a query on a schedule and notifies you or runs an action when a condition is met.
- **Anomaly / UEBA** — An event that deviates from an entity's learned baseline; UEBA is the technique that learns those baselines.
- **API key** — A secret token (`lnog_…`) that lets an app send logs or an integration read data without a password.
- **Apprise** — The notification gateway LogNog uses to reach 100+ services (Slack, Discord, PagerDuty, etc.).
- **CIM (Common Information Model)** — Standard field names that let one search work across differently-named sources.
- **ClickHouse** — The high-volume database that stores logs in the Docker deployment (SQLite in "Lite").
- **Dashboard / Panel** — A saved page of visualizations; a panel is one chart/table backed by a query.
- **DSL** — LogNog's Splunk-style query language.
- **Field** — A named piece of a log (hostname, severity, message, custom values).
- **FIM (File Integrity Monitoring)** — The agent feature that hashes files and alerts on changes.
- **Index** — A named folder that groups logs; auto-created on first log.
- **Ingest** — Sending logs into LogNog (HTTP, syslog, agent, Supabase, Vercel).
- **Live tail** — Streaming new logs in real time on the Search page.
- **Lookup** — An enrichment table that adds context to logs.
- **MCP** — Model Context Protocol; lets Claude Desktop drive LogNog.
- **NogChat** — The floating in-app AI helper.
- **Severity** — Syslog urgency 0–7 (lower = more urgent).
- **Silence** — A temporary mute for alerts.
- **Source** — A single app/device sending logs.
- **Synthetic monitoring** — Proactive uptime/endpoint checks run from the server.

---

## 13. Known Gaps, Unclear Areas, and Suggested Improvements

Written honestly, based on inspecting the running product.

| Area | What's missing or unclear | Why it matters | Suggested fix |
|------|---------------------------|----------------|---------------|
| Synthetic assertions | The assertion builder (status code, response time, body-contains, JSON path) is described in docs but not fully exposed in the create-test UI | Users can't fully define "success" from the UI | Add an assertions section to the test modal |
| Synthetic Browser tests | "Browser" type is offered but labeled coming soon / needs Playwright backend | Sets an expectation that may not be met | Clearly mark Browser as Planned in the UI |
| Reports "run now" | No manual trigger for a *scheduled* report from the UI (only one-off Generate) | Admins must wait for the schedule or use the container | Add a "Run now" button per scheduled report |
| Index scope enforcement | Only the `/api/ingest/http` path enforces per-key index scoping | Other ingest paths could write outside a key's intended index | Extend scope checks to syslog/agent/other ingest routes |
| AI availability | All AI features silently degrade to "Offline" without a model; the reason isn't always obvious to non-admins | Users may think the feature is broken | Show a clear "ask an admin to configure AI" hint to non-admins |
| AI Onboarding wizard | The multi-step "codebase interview" flow is partly a design/roadmap doc; the live page's depth may differ | Expectations vs. reality | Confirm which steps are live and label the rest Planned |
| Analytics time windows | Fixed 24h/all-time windows; no custom range on the Analytics page | Limits ad-hoc analysis there | Add a time picker to Analytics |
| Public dashboards | Render a smaller set of chart types than the private view | A public dashboard may look different from the authored one | Note the supported subset in the share dialog |
| Shipping log link | This guide links `../SHIPPING-LOG.md`, which may not exist yet in `docs/` | Broken "what's new" link | Generate `docs/SHIPPING-LOG.md` (shipping-log skill) |
| Deletions in ClickHouse | Log deletions are asynchronous; the UI doesn't always show progress | Admins may think a delete failed | Surface deletion status/progress |

---

## 14. Documentation Maintenance Notes

- **Documents version:** v0.9.0 (matches `docs/VERSION`).
- **Last updated:** 2026-07-03.
- **Inspected:**
  - Routes/nav: `ui/src/App.tsx`.
  - Pages: `ui/src/pages/` — SearchPage, SavedSearchesPage, DashboardsPage, DashboardViewPage, DashboardStudioPage, PublicDashboardPage, AlertsPage, SilencesPage, AnomalyPage, SyntheticPage, StatsPage, ReportsPage, DataSourcesPage, OnboardingPage, CIMPage, KnowledgePage, AssetsPage, IdentitiesPage, AgentPage, SettingsPage, LoginPage, LandingPage.
  - Components: `ShortcutsModal.tsx`, `NogChat.tsx`, onboarding `WelcomeWizard`/`AddDataSourceWizard`, `AuthContext.tsx`.
  - DSL implementation: `api/src/dsl/` (lexer, parser, compiler, compiler-sqlite, types) to confirm the real command set.
  - Docs: `DSL_REFERENCE.md`, `APP-ONBOARDING.md`, `LOGNOG_IN_AGENT.md`, `QUICK_START.md`, `KNOWLEDGE_MANAGEMENT.md`, `MCP-INTEGRATION.md`, `NEW-FEATURES-GUIDE.md`, `DEPLOYMENT-GUIDE.md`, `SUPABASE-INTEGRATION.md`, `VERCEL-INTEGRATION.md`, `docs/VERSION`.
- **Assumptions:**
  - Role behavior (`admin`/`user`/`readonly`) is inferred from the code and MCP docs; exact per-route enforcement wasn't re-verified endpoint-by-endpoint.
  - The AI Onboarding page's live depth is assumed to match its design doc where the code wasn't fully read; labeled accordingly.
  - Production ops steps reflect the project's CLAUDE.md/memory notes for the machinekinglabs deployment.
- **Needs future review:**
  - Synthetic assertions UI, Browser test type, and Reports "run now" — confirm status each release.
  - Whether `docs/SHIPPING-LOG.md` exists; update the header link if the path changes.
  - Any new nav destinations, DSL commands, or visualization types added after v0.9.0.
  - Replace every `[SCREENSHOT: …]` marker with a real capture via the screenshot-capture skill.
