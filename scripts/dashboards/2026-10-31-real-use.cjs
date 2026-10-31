#!/usr/bin/env node
/*
 * One-off dashboard repair, 2026-10-31 (Robert's LogNog walkthrough).
 *
 * The product dashboards live in the SQLite store, not in code, so this script
 * is the record of what changed. It is idempotent: run it again and it writes
 * the same rows. It backs the database up first unless --dry-run is given.
 *
 *   node scripts/dashboards/2026-10-31-real-use.cjs [--db /data/lognog.db] [--dry-run]
 *
 * What it does:
 *  1. "Directors Palette — Real Use" leaves Robert's own account out of every
 *     use / cost panel. Only two tiles did before, so cost, charged, margin,
 *     failures and the per-model tables were all his own testing. A separate
 *     "Your own use" table shows what was left out. "HeyYoureHired — Real Use"
 *     leaves him out of job searches; its visit, sign-up and login events carry
 *     no user id, so those panels count everyone and say so.
 *  2. Money goes first on DP Real Use; tables are tall enough that no row is cut in half.
 *  3. "DP: Daily Overview" searched app_name/message names Directors Palette no
 *     longer sends, so every panel said "No data". It now uses
 *     index=directors-palette + event=..., and its count gauges are stat tiles.
 *  4. "Studio Machines": the two tables get friendly column names, and
 *     the chart (a sideways bar of "machines answering", always the maximum) is
 *     now one line per machine showing the share of pings it answered each hour.
 *  5. The studio's own product dashboards (a fixed list of ids, below) get
 *     their product logo, served by LogNog itself from /logos/, when they have
 *     no logo or the old DP icon link that now 404s. The listed HYH dashboards
 *     get HYH's #00BCD4 accent where theirs is empty or the studio default.
 *     Any other logo or colour is left alone, and no other dashboard is touched.
 *
 * Deploy: the api image does not include scripts/, so copy it in first:
 *   docker cp scripts/dashboards/2026-10-31-real-use.cjs <api>:/tmp/ && \
 *   docker exec -w /app <api> node /tmp/2026-10-31-real-use.cjs --db /data/lognog.db
 */
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dbArg = args.indexOf('--db');
const dbPath = dbArg >= 0 ? args[dbArg + 1] : process.env.SQLITE_PATH || '/data/lognog.db';

let Database;
for (const base of [process.cwd(), '/app', path.join(__dirname, '..', '..', 'api')]) {
  try { Database = require(require.resolve('better-sqlite3', { paths: [base] })); break; } catch { /* next */ }
}
if (!Database) throw new Error('better-sqlite3 not found (run from /app in the api container)');

const ROBERT_DP = 'user_id!="d3a01f94-671e-483a-89f6-0284f7aaaf85"';
const ROBERT_DP_ONLY = 'user_id="d3a01f94-671e-483a-89f6-0284f7aaaf85"';
const ROBERT_HYH = 'user_id!="f0ce2d4b-f7ab-4e46-bd05-c61d1367c660"';
// HYH's visit, sign-up and login events carry no user id (checked 10-31), so
// those panels cannot leave Robert out and say so.
const HYH_EVERYONE = 'Counts everyone, you included: HYH sign-up and login events do not say who.';
const HYH_VISITS = 'Counts everyone, you included: visits and blog reads do not say who.';

const DP = 'index=directors-palette';
const GEN = `${DP} event=generation_completed ${ROBERT_DP}`;
const SPEND = `${DP} event=credit_event amount<0 ${ROBERT_DP}`;

// Product colours: Directors Palette cyan (its app accent); HeyYoureHired the
// #00BCD4 already chosen by hand on the "Hey You're Hired" dashboard.
const PRODUCTS = {
  dp: { logo: '/logos/directors-palette.png', accent: '#06B6D4', header: '#0A0A0E' },
  hyh: { logo: '/logos/hey-youre-hired.png', accent: '#00BCD4', header: '#0A0A0E' },
  presidium: { logo: '/logos/presidium.png' },
  game: { logo: '/logos/cof.png' },
  studio: { logo: '/logos/mkl.png' },
};

const DEFAULT_CYAN = '#06B6D4';
const DEFAULT_HEADER = '#0A0A0E';
// The DP dashboards' old icon link (directors-palette-v2.vercel.app) returns 404.
const DEAD_LOGOS = ['https://directors-palette-v2.vercel.app/dp-icon.png'];

// The studio's own dashboards, by id, so a look-alike name never gets branded.
const BRANDED = {
  'd7129277-b168-43a1-a8a9-da78bc76b500': 'dp', // Directors Palette — Real Use
  '8b747afe-77e1-4cec-9d4e-905a3c90fb8a': 'dp', // DP: Daily Overview
  '0714893d-1f0e-4d90-b3eb-96a502d875ff': 'dp', // DP: Feature Usage
  '7c74600a-9216-4116-bedd-b5aa6db2b828': 'dp', // DP: Revenue & Credits
  '66a29a9b-7b91-4703-83b4-cd7bbb9c2777': 'dp', // DP: API Health
  'a5626f7b-ac0e-472d-b001-d53a5decda30': 'dp', // DP: External Services
  'be45c6a6-cf41-4d2f-bb80-8180d65a5c9f': 'hyh', // HeyYoureHired — Real Use
  '3e132db3-6e2d-4a53-8a8b-ec9e3bcbbe89': 'hyh', // HYH: User Acquisition & Funnel
  'f77f54b2-3c7c-4e54-afe3-1bb8cd7c4c71': 'hyh', // HYH: Feature Usage
  'fd5b9d19-4657-44e5-8380-49cbf4ca97a9': 'hyh', // HYH: Revenue & Subscriptions
  'f50641f5-abdc-4348-b33d-93b4c642a82b': 'hyh', // HYH: API & System Health
  '1bd5f9e1-d010-4787-9c57-d98f4b37207e': 'hyh', // HYH: Job Search Performance
  'a6cb8a57-9aff-4cb8-a046-f2f843764ce2': 'hyh', // HYH: Blog Performance
  'e757749d-84bd-4b45-9de6-6e8cb2d0013f': 'hyh', // HYH: Conversion Funnel
  '5ff76400-acd0-4871-b0fd-75e275d55613': 'presidium', // Presidium + Talk Advantage — Status
  '21ac1de4-1130-44c9-9b12-85160de0e79c': 'game', // Game — Status
  '1497304d-ee98-4a19-a037-1e6c6a718e1d': 'studio', // Studio Machines — Status
  '95ddec6b-f240-4951-8be4-69d37fa91865': 'studio', // Main Suite — Today
};

const DASH = {
  dpReal: 'd7129277-b168-43a1-a8a9-da78bc76b500',
  hyhReal: 'be45c6a6-cf41-4d2f-bb80-8180d65a5c9f',
  dpDaily: '8b747afe-77e1-4cec-9d4e-905a3c90fb8a',
  machines: '1497304d-ee98-4a19-a037-1e6c6a718e1d',
};

// Panels are matched by their CURRENT title within the dashboard; `title` is
// the new one. Every rewritten panel gets exactly the description given here
// (none = cleared), so no text from before the filters survives. x/y/w/h are grid units (12 columns).
const P = (match, title, query, viz, x, y, w, h, description) => ({ match, title, query, viz, x, y, w, h, description });
// Panels whose old title changed in an earlier run of this script still match by the new title.

const dpRealUse = [
  // Row 1: money first, then people.
  P('AI cost (¢)', 'AI cost (¢)', `${SPEND} | stats sum(cost_cents) as cost`, 'stat', 0, 0, 2, 2, "What other people's generations cost us at the provider. Your own use is left out."),
  P('Charged (¢)', 'Charged (¢)', `${SPEND} | stats sum(price_cents) as charged`, 'stat', 2, 0, 2, 2, 'Credits other people spent, in cents. Your own use is left out.'),
  P('Margin (¢)', 'Margin (¢)', `${SPEND} | stats sum(margin_cents) as margin`, 'stat', 4, 0, 2, 2, 'Charged minus cost, other people only.'),
  P('Other people', 'Other people', `${GEN} | stats dc(user_id) as people`, 'stat', 6, 0, 2, 2, "Accounts that finished an image or video. Your own account is left out."),
  P('Their creations', 'Their creations', `${GEN} | stats count as made`, 'stat', 8, 0, 2, 2, 'Images and videos other people made.'),
  P('Failed', 'Their failures', `${DP} event=generation_failed ${ROBERT_DP} | stats count as failed`, 'stat', 10, 0, 2, 2, 'Generations that failed for other people.'),
  // Row 2: trend + uptime.
  P('Made per day (image vs video, everyone incl. Robert)', 'Made per day (other people)', `${GEN} | timechart span=1d count by generation_type`, 'line', 0, 2, 8, 3),
  P('Site up? (response time)', 'Site up? (response time)', 'index=uptime product="Directors Palette" | timechart span=15m avg(response_ms) as response_ms', 'line', 8, 2, 4, 3, 'From the Mac Mini check every 5 minutes.'),
  // Row 3: what and how much.
  P('What was made, by model (everyone)', 'What they made, by model', `${GEN} | stats count as made, dc(user_id) as people by generation_type, model_id | sort -made`, 'table', 0, 5, 6, 4),
  P('AI cost vs charge, by model', 'Their cost vs charge, by model', `${SPEND} | stats count as uses, sum(cost_cents) as cost_cents, sum(price_cents) as charged_cents, sum(margin_cents) as margin_cents by model | sort -cost_cents`, 'table', 6, 5, 6, 4, 'From credit_event. Cents. Your own use is left out.'),
  // Row 4: who + speed.
  P('Who spends the most credits', 'Who spends the most credits', `${SPEND} | stats count as uses, sum(price_cents) as charged_cents by user_email | sort -charged_cents | head 15`, 'table', 0, 9, 6, 4),
  P('How long each model takes', 'How long each model takes (their runs)', `${GEN} | stats count as made, avg(duration_ms) as avg_ms, p95(duration_ms) as slowest_5pct_ms by model_id | sort -made`, 'table', 6, 9, 6, 4),
  // Row 5: problems.
  P('Why generations failed', 'Why their generations failed', `${DP} event=generation_failed ${ROBERT_DP} | stats count by model_id, error | sort -count | head 15`, 'table', 0, 13, 6, 5),
  P('Errors (what broke)', 'Errors on the site (everyone)', `${DP} severity<=3 | stats count by message | sort -count | head 15`, 'table', 6, 13, 3, 5, 'Site errors are about the site, not a person, so nobody is left out here.'),
  P('Warnings', 'Warnings on the site', `${DP} severity=4 | stats count by message | sort -count | head 15`, 'table', 9, 13, 3, 5),
  // Row 6: small tables.
  P('Sign-ins, sign-ups, payments', 'Sign-ins, sign-ups, payments', `${DP} ${ROBERT_DP} (message="User login" OR message="User signup completed" OR event=payment_completed OR event=checkout_session_created OR event=checkout_session_failed) | stats count by message`, 'table', 0, 18, 3, 4, 'Other people only, so it is empty when the only sign-ins were yours.'),
  P('Page views by signed-in people', 'Page views (other people)', `${DP} event=page_view ${ROBERT_DP} | stats count as views, dc(user_id) as people`, 'table', 3, 18, 3, 4),
  P('Uploads', 'Uploads (other people)', `${DP} event=upload_completed ${ROBERT_DP} | stats count as uploads, dc(user_id) as people, sum(size_bytes) as bytes`, 'table', 6, 18, 3, 4),
  P('Your own use (left out above)', 'Your own use (left out above)', `${DP} event=credit_event amount<0 ${ROBERT_DP_ONLY} | stats count as uses, sum(cost_cents) as cost, sum(price_cents) as charged`, 'table', 9, 18, 3, 4, "Robert's own account, so you can see what the panels above leave out. Cents."),
];

const hyhRealUse = [
  P('Visitors', 'Visitors', 'index=hey-youre-hired ua_class!="bot" | stats dc(ip_address) as visitors', 'stat', 0, 0, 2, 2, HYH_VISITS),
  P('Blog views', 'Blog views', 'index=hey-youre-hired message="Blog article viewed" ua_class!="bot" | stats count as views', 'stat', 2, 0, 2, 2, HYH_VISITS),
  P('Read to the end', 'Read to the end', 'index=hey-youre-hired message="Blog article read completed" | stats count as reads', 'stat', 4, 0, 2, 2, HYH_VISITS),
  P('Signups', 'Signups', `index=hey-youre-hired message="Signup attempt" | stats count as signups`, 'stat', 6, 0, 2, 2, HYH_EVERYONE),
  P('Job searches', 'Job searches', `index=hey-youre-hired message="Feature used: job_recommendations" ${ROBERT_HYH} | stats count as searches`, 'stat', 8, 0, 2, 2, 'Your own account is left out.'),
  P('Problems', 'Problems', 'index=hey-youre-hired severity<=4 message!="CSP violation (report-only)" | stats count as problems', 'stat', 10, 0, 2, 2),
  P('Signup funnel', 'Signup funnel', 'index=hey-youre-hired (message="Signup page view" OR message="Signup attempt" OR message="Profile created" OR message="User login") | stats count by message | sort -count', 'bar', 0, 2, 6, 3, HYH_EVERYONE),
  P('Site up? (response time)', 'Site up? (response time)', 'index=uptime product="HeyYoureHired" | timechart span=15m avg(response_ms) as response_ms', 'line', 6, 2, 6, 3),
  P('Most-read articles', 'Most-read articles', 'index=hey-youre-hired message="Blog article viewed" ua_class!="bot" | stats count as views by blog_title | sort -views | head 15', 'table', 0, 5, 6, 5, HYH_VISITS),
  P('Activity per day', 'Activity per day', `index=hey-youre-hired message!="CSP violation (report-only)" ${ROBERT_HYH} | timechart span=1d count`, 'line', 6, 5, 6, 5, 'Your job searches are left out; visits, sign-ups and logins count everyone (they do not say who).'),
  P('What broke (warnings + errors)', 'What broke (warnings + errors)', 'index=hey-youre-hired severity<=4 message!="CSP violation (report-only)" | stats count by message | sort -count | head 15', 'table', 0, 10, 6, 5),
  P('Job searches: results + speed', 'Job searches: results + speed (not you)', `index=hey-youre-hired message="Feature completed: job_recommendations" ${ROBERT_HYH} | stats count as searches, avg(jobs_found) as avg_jobs, avg(duration_ms) as avg_ms`, 'table', 6, 10, 6, 2, 'Your own account is left out.'),
  P('Bots', 'Bots', 'index=hey-youre-hired ua_class="bot" | stats count as bot_hits', 'stat', 6, 12, 6, 3),
  P('Browser security (CSP) reports', 'Browser security (CSP) reports', 'index=hey-youre-hired message="CSP violation (report-only)" | stats count by violated_directive, blocked_uri | sort -count | head 10', 'table', 0, 15, 12, 4),
  P('Bots by name', 'Bots by name', 'index=hey-youre-hired ua_class="bot" | stats count as hits, dc(ip_address) as ips, latest(ua) as example_ua by bot_name | sort -hits | head 20', 'table', 0, 19, 12, 5),
];

const dpDaily = [
  P('API Requests Over Time', 'Events over time', `${DP} | timechart span=1h count`, 'line', 0, 0, 12, 3),
  P('Generations Over Time', 'Generations over time', `${DP} event=generation_completed | timechart span=1h count`, 'line', 0, 3, 6, 3),
  P('Errors Over Time', 'Errors + warnings over time', `${DP} severity<=4 | timechart span=1h count`, 'line', 6, 3, 6, 3),
  P('Total Requests', 'Events', `${DP} | stats count`, 'stat', 0, 6, 3, 2),
  P('Generations', 'Generations', `${DP} event=generation_completed | stats count`, 'stat', 3, 6, 3, 2),
  P('Errors', 'Errors', `${DP} severity<=3 | stats count`, 'stat', 6, 6, 3, 2),
  P('Payments', 'Payments', `${DP} event=payment_completed | stats count`, 'stat', 9, 6, 3, 2),
];

const machines = [
  // Friendly column names come from format.columnLabels (the query language
  // can't rename a field after stats).
  { ...P('Answering right now?', 'Answering right now?', 'index=uptime kind=machine | stats latest(up) as up_now, latest(response_ms) as ping_ms by product | sort product', 'table', 0, 0, 6, 6, 'Last ping from the Mac Mini (every 5 minutes). 1 = answered, 0 = no answer.'),
    options: { format: { columnLabels: { product: 'Machine', up_now: 'Answering (1 = yes)', ping_ms: 'Ping (ms)' } } } },
  { ...P('Pings answered / sent', 'Pings answered / sent', 'index=uptime kind=machine | stats sum(up) as answered, count as sent by product | sort product', 'table', 6, 0, 6, 6),
    options: { format: { columnLabels: { product: 'Machine', answered: 'Answered', sent: 'Sent' } } } },
  // A line per machine: 1 = answered every ping that hour, a dip = missed some.
  // (It was a sideways bar of "machines answering", always the maximum.)
  { ...P('Machines answering over time', 'Pings answered each hour, per machine (1 = always up)', 'index=uptime kind=machine | timechart span=1h avg(up) as answered by product', 'linechart', 0, 6, 12, 4, 'Each line is one machine. 1 means it answered every ping that hour; a dip means it missed some.'), options: { format: { yMin: 0, yMax: 1 } } },
];

function main() {
  if (!fs.existsSync(dbPath)) throw new Error(`no database at ${dbPath}`);
  if (!dryRun) {
    const backup = `${dbPath}.bak-20261031-real-use`;
    if (!fs.existsSync(backup)) {
      const src = new Database(dbPath, { readonly: true });
      src.backup(backup).then(() => { src.close(); apply(); });
      console.log(`backup -> ${backup}`);
      return;
    }
    console.log(`backup already exists: ${backup}`);
  }
  apply();
}

function apply() {
  const db = new Database(dbPath, { readonly: dryRun });
  const findPanel = db.prepare('SELECT id FROM dashboard_panels WHERE dashboard_id = ? AND (title = ? OR title = ?)');
  const update = db.prepare(`UPDATE dashboard_panels SET title = ?, query = ?, visualization = ?, position_x = ?, position_y = ?, width = ?, height = ?, description = ?, options = COALESCE(?, options) WHERE id = ?`);
  const insert = db.prepare(`INSERT INTO dashboard_panels (id, dashboard_id, title, query, visualization, options, position_x, position_y, width, height, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const brand = db.prepare(`UPDATE dashboards SET logo_url = ?, accent_color = ?, header_color = ?, updated_at = datetime('now') WHERE id = ?`);
  const { randomUUID } = require('crypto');

  let changed = 0;
  const run = db.transaction(() => {
    for (const [dash, panels] of [[DASH.dpReal, dpRealUse], [DASH.hyhReal, hyhRealUse], [DASH.dpDaily, dpDaily], [DASH.machines, machines]]) {
      for (const p of panels) {
        const row = findPanel.get(dash, p.match, p.title);
        if (row) {
          if (!dryRun) update.run(p.title, p.query, p.viz, p.x, p.y, p.w, p.h, p.description ?? null, p.options ? JSON.stringify(p.options) : null, row.id);
          console.log(`update ${dash.slice(0, 8)} "${p.title}"`);
        } else {
          if (!dryRun) insert.run(randomUUID(), dash, p.title, p.query, p.viz, JSON.stringify(p.options ?? {}), p.x, p.y, p.w, p.h, p.description ?? null);
          console.log(`insert ${dash.slice(0, 8)} "${p.title}"`);
        }
        changed++;
      }
    }
    // Logos + product colours, for the studio's own dashboards only (by id).
    const one = db.prepare('SELECT id, name, logo_url, accent_color, header_color FROM dashboards WHERE id = ?');
    for (const [id, key] of Object.entries(BRANDED)) {
      const d = one.get(id);
      if (!d) continue;
      const b = PRODUCTS[key];
      // Only fill what is empty or known broken; a colour other than the
      // studio default these dashboards were created with was chosen by hand.
      const logo = !d.logo_url || DEAD_LOGOS.includes(d.logo_url) ? b.logo : d.logo_url;
      const isDefault = (cur, def) => !cur || cur.toUpperCase() === def;
      const accent = b.accent && isDefault(d.accent_color, DEFAULT_CYAN) ? b.accent : d.accent_color;
      const header = b.header && isDefault(d.header_color, DEFAULT_HEADER) ? b.header : d.header_color;
      if (logo === d.logo_url && accent === d.accent_color && header === d.header_color) continue;
      if (!dryRun) brand.run(logo, accent, header, d.id);
      console.log(`brand ${d.name} -> ${key}${logo !== d.logo_url ? ' logo' : ''}${accent !== d.accent_color ? ` accent ${accent}` : ''}`);
    }
  });
  run();
  db.close();
  console.log(`${dryRun ? '[dry run] ' : ''}${changed} panels written`);
}

main();
