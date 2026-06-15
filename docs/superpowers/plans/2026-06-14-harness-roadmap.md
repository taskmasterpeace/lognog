# LogNog Universal Harness — Phased Roadmap

> **Status:** Roadmap / overview. Each phase below becomes its own detailed implementation plan
> (one per subsystem) when it is picked up. Phase 1 is fully detailed in
> `2026-06-14-phase-1-entity-scoped-keys.md`.

**Vision:** Turn LogNog into a drop-in harness so any SaaS app, IoT device, or arbitrary
asset/entity can be onboarded for logging, alerting, and reporting with near-zero custom code.

**Guiding decisions (locked 2026-06-14):**
1. **Internal now, SaaS later** — build tenancy-*ready* (every entity has an `index`/owner and
   scoped keys), but do NOT ship full multi-tenant UI/hard walls yet. The SaaS leap must be
   additive, not a rewrite.
2. **ClickHouse (Full) only** — skip SQLite-Lite parity work for harness features.
3. **IoT transports deferred** — near-term sources speak HTTP/OTLP/webhooks. MQTT/Kafka collectors
   are a later phase.

---

## Why this order

The audit found the *data plane* (capture → normalize → search → alert → report) is already
harness-grade. The blockers are all in the *control plane*: provisioning, isolation, and
absence-detection. Phase 1 (entity-scoped keys) is both the biggest single unlock and the most
contained change — everything else (provisioning presets, per-tenant reports) depends on the
"every key belongs to a scoped entity" foundation it establishes.

```
Phase 1  Isolate    ─┬─►  Phase 2  Provision  ─┬─►  Phase 5  Scale (SaaS)
(keys scoped to      │    (1-call onboarding)   │   (multi-tenant views,
 index/entity)       │                          │    per-tenant reports)
                     └─►  Phase 3  Monitor      │
                          (heartbeat/no-data)   │
                                                └─►  Phase 4  Reach
                                                     (MQTT/webhook/pull) [deferred]
```

---

## Phase 1 — Isolate: entity-scoped API keys  ⭐ START HERE

**Objective:** An API key can be restricted to one or more indexes. Ingesting to an index the key
doesn't own is rejected (403). Keys with no restriction keep working (backward compatible, `NULL = all`).

**Why first:** Today *any* valid key can write to *any* index. This is the structural blocker for
pointing multiple sources at one instance. The `allowed_indexes` column is also the seam tenancy
(Phase 5) hangs off later.

**Touches:** `api/src/auth/auth.ts`, `api/src/auth/middleware.ts`, new `api/src/auth/index-scope.ts`,
`api/src/routes/ingest.ts`, `api/src/routes/auth.ts`.

**Exit criteria:**
- [ ] `api_keys` has an `allowed_indexes` column (nullable; `NULL`/empty = all indexes).
- [ ] A scoped key ingesting outside its indexes gets 403; an unscoped key is unaffected.
- [ ] Key create/list API surfaces `allowed_indexes`.
- [ ] All existing ingest/auth tests still pass.

**Detailed plan:** `2026-06-14-phase-1-entity-scoped-keys.md`

**Explicitly deferred to Phase 1b (separate plan):** read-side scoping (filtering *search* results
by the requester's allowed indexes). Higher risk (touches DSL/backend) and not needed for the
internal-first milestone, where the threat is *write* pollution, not cross-read.

---

## Phase 2 — Provision: one-call entity onboarding

**Objective:** A single API call / wizard registers a new entity and returns everything needed to
start sending: `{ index, scoped write-key, source-config preset, starter alert, starter dashboard }`.
Convert today's hard-coded per-source ingest handlers (supabase/vercel/nextjs/smartthings) into
**config presets** instead of code.

**Depends on:** Phase 1 (scoped keys are part of what gets provisioned).

**Touches:** new `api/src/routes/sources.ts` (or extend `source-configs.ts`),
`api/src/services/source-processor.ts`, a UI provisioning wizard.

**Exit criteria:**
- [ ] `POST /api/sources/provision { name, type }` creates index + scoped key + source-config +
      starter alert + dashboard atomically.
- [ ] At least one existing coded source (e.g. Vercel) re-expressed as a preset, proving the pattern.
- [ ] Wizard in UI walks a user through onboarding a new source end-to-end.

---

## Phase 3 — Monitor: heartbeat / no-data alerting  ⭐ HIGH VALUE

**Objective:** First-class "this entity went silent" alerting — the defining monitor for IoT/SaaS
health. Add a `no_data` trigger type and "expected sources" tracking so a source that *stops*
sending fires an alert, even though it produces zero rows.

**Why valuable:** Current triggers (`number_of_results`, `number_of_hosts`, `custom_condition`) can
only fake no-data via `results < 1` against a hand-named query. There's no auto-coverage of newly
discovered entities and no concept of "expected but absent."

**Touches:** `api/src/services/alerts.ts` (trigger evaluation, `testAlert`),
`api/src/db/sqlite-alerts.ts` (trigger_type enum), `api/src/services/scheduler.ts`,
new "expected sources" registry, Alerts UI.

**Exit criteria:**
- [ ] New `no_data` trigger type: fires when an entity/source has sent nothing in the window.
- [ ] Expected-sources registry so silence of a *known* source is detectable.
- [ ] Heartbeat alert can be attached as a provisioning preset (ties to Phase 2).

---

## Phase 4 — Reach: more transports  (DEFERRED)

**Objective:** Let non-HTTP things plug in: an MQTT bridge (covers most IoT), a generic
webhook-with-field-mapping receiver, and scheduled **pull** collectors (poll a SaaS API → map →
ingest) for sources that only expose pull APIs.

**Status:** Deferred per decision #3. Detailed plan to be written when IoT becomes a near-term need.

**Touches:** new `api/src/ingest/mqtt-bridge.ts`, generic webhook receiver, a pull-collector built on
the existing scheduler + synthetic-runner scaffolding.

---

## Phase 5 — Scale: multi-tenant + SaaS

**Objective:** Turn "tenancy-ready" into real tenancy — per-tenant data views, per-tenant report and
dashboard distribution, durable per-key quotas, and thin multi-language ingest SDKs.

**Depends on:** Phases 1–3 (scoped keys, provisioning, monitoring all become per-tenant).

**Touches:** tenant model across `auth`, `search`/`backend` read scoping (Phase 1b generalized),
`reports.ts`, `dashboards.ts`, durable rate limiting (replaces the in-memory `rateLimit` in
`middleware.ts`).

---

## Cross-cutting cleanup (fold into whichever phase touches the area)

- **Durable rate limiting:** the current `rateLimitStore` Map in `middleware.ts:225` is in-memory
  only — replace with a persistent/per-key quota when Phase 1 or Phase 5 touches keys.
- **DSL correlation gaps:** `transaction`/`filldown` are parsed but only `lookup` is wired
  post-SQL (`backend.ts:77`). `join`/`eventstats`/`streamstats` are absent. Address if/when
  cross-entity correlation becomes a requirement — not on the critical path.
