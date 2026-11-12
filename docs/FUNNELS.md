# Product funnels — one language for every product

**Version 1 · tracked in [#50](https://github.com/taskmasterpeace/lognog/issues/50)**

Every Machine King Labs product with a website reports the same nine steps, using the same field names, on ordinary LogNog log lines. LogNog then answers the same four questions for each product:

| Question | Where it is answered |
|---|---|
| Why don't people sign up? | Funnels → pick a product → **Why they don't sign up** |
| When do people stop using it? | Funnels → pick a product → **When they stop** |
| What comes before someone starts paying? | Funnels → pick a product → **Before they pay** |
| What does the move to paying look like? | Funnels → pick a product → **The move to paying** |

Click path: **LogNog → Funnels → All products** (side by side) **→ a product** (the full picture).

---

## 1. The stages

A product **sends** these. The names never change and no product adds its own.

| Stage | Means | Sent from | Who it is tied to |
|---|---|---|---|
| `visit` | Landed on a public page | Browser | anonymous id |
| `signup_start` | Opened or began the sign-up form | Browser | anonymous id |
| `signup` | An account now exists | Server | anonymous id **and** account id (this is the join) |
| `activate` | *Optional.* The product's own "got real value" moment | Server | account id |
| `use` | One real use of the main feature. Send it every time | Server | account id |
| `paywall` | Shown a price, or hit a free limit | Browser or server | account id (or anonymous id) |
| `checkout` | Started to pay | Server | account id |
| `paid` | Money arrived, confirmed by the payment provider | Server (webhook) only | account id |
| `churn` | Cancelled, or a payment lapsed | Server (webhook) only | account id |

LogNog **works out** these. Products never send them.

| Worked out | Rule |
|---|---|
| First real use | The product's `activate` event if it declares one, otherwise the first `use` |
| Came back | A `use` on a later calendar day (UTC) than the first real use, and at least 12 hours after it |
| Went quiet | Has an account, and no `use` for the product's quiet window (see section 4) |
| Never used | Has an account older than the quiet window and no `use` at all |

## 2. The event

One flat JSON object per step, sent to `POST /api/ingest/http` in the product's own index, like any other log line.

| Field | Required | Example | Notes |
|---|---|---|---|
| `funnel_stage` | yes | `"signup"` | One of the nine names above |
| `funnel_event` | yes | `"signup_completed"` | The product's own name for what happened |
| `funnel_v` | yes | `1` | Version of this language |
| `product` | yes | `"directors-palette"` | Filled in from the index if left out |
| `anon_id` | one of these two | `"a_9f2c…"` | Random first-party id for someone with no account |
| `user_id` | one of these two | `"0b7e…"` | Account id. Family products: the **parent** account only |
| `session_id` | no | `"s_41aa…"` | |
| `event_id` | for `paid`/`churn` | `"cs_live_…"` | The payment provider's id. A retry with the same id counts once |
| `timestamp` | yes | ISO time | When it happened |
| `surface` | no | `"web"`, `"ios"` | Website and app are separate surfaces of one product |
| `utm_source`, `utm_medium`, `utm_campaign` | no | `"tiktok"` | First touch: captured on the first visit and carried to sign-up |
| `referrer_host` | no | `"google.com"` | Host only, never a full address |
| `landing_path` | no | `"/pricing"` | Path only, no query string |
| `cohort` | no | `"invited_tester"` | How they first arrived. Set once. A tester who later pays stays a tester |
| `plan`, `interval` | on `checkout`/`paid`/`churn` | `"pro"`, `"month"` | `interval`: `week`, `month`, `year`, `one_time` |
| `amount_cents`, `currency` | on `paid` | `2499`, `"usd"` | Whole cents |
| `props` | no | `{"feature":"cover_letter"}` | Up to 20 small facts: numbers, true/false, short codes |

Example:

```json
{
  "timestamp": "2026-11-11T18:04:11.000Z",
  "message": "funnel paid points_purchased",
  "funnel_v": 1,
  "funnel_stage": "paid",
  "funnel_event": "points_purchased",
  "product": "directors-palette",
  "surface": "web",
  "user_id": "0b7e6c1a-…",
  "event_id": "cs_live_a1B2…",
  "plan": "starter",
  "interval": "one_time",
  "amount_cents": 999,
  "currency": "usd"
}
```

### Naming rules

| Thing | Rule | Good | Bad |
|---|---|---|---|
| Stage | From the fixed list | `paywall` | `upgrade_modal` |
| Event name | lower_snake_case, thing then what happened | `limit_hit`, `signup_completed` | `User Signed Up!` |
| Renewal payments | Event name contains `renewed` | `family_plan_renewed` | `paid` |
| Ids | Opaque tokens, no spaces, no `@` | `a_9f2c1d` | an email address |
| Money | Whole cents plus currency | `699`, `"usd"` | `"$6.99"` |
| Source | Short code | `tiktok` | a full URL |

### Never in a funnel event

Emails, names, IP addresses, browser strings, phone numbers, payment details, free text, uploaded content, and **anything about a child** (ids, names, answers, photos, recordings). The shared client never puts any of these in a funnel field, and LogNog refuses an email or a sentence as an id and drops personal keys from `props`, for every product. Products that mark a line they already send (see bridge rules) keep that line's other fields as they were, so existing dashboards keep working. For Homework Tree LogNog goes further: it keeps **only** the fields in the table above, checks every value is a short code, a number or a time, rewrites the message, and throws the rest away. That applies whatever the event says its product is: the index it lands in decides.

Only lines that land in a declared product's index are touched. A line in any other index is stored exactly as sent, with one exception that leans the safe way: a line that carries `funnel_stage` and names Homework Tree as its product is cut to the allowlist wherever it lands. A line with no `funnel_stage` is not a funnel line and is never touched.

For Homework Tree the stored line is built from the allowlist field by field, so a field LogNog does not know cannot get through, and a line that cannot be read at all is replaced by a bare stub. This check runs on `POST /api/ingest/http`, the endpoint every product uses; lines sent through LogNog's other ingest endpoints or moved between indexes by a routing rule are not checked. What it also cannot stop is a product deliberately packing words into a code-like value (an id such as `sam-age-7` has no spaces and looks like a code). The product's own code must only ever send hashed ids and fixed codes; Homework Tree's does.

No third-party analytics is needed or used. Ids are first-party and random. Nothing is matched by device fingerprint, and people are never joined across products.

## 3. How a product plugs in

1. Copy [`docs/funnels/funnel-client.ts`](funnels/funnel-client.ts) into the product. It builds the event; the product's existing LogNog sender sends it.
2. Give visitors a random first-party `anon_id`, and remember where they first came from (`utm_*`, referrer host) until they sign up.
3. Send the nine stages from the places listed in section 1. `signup` must carry both ids.
4. Add the product to `FUNNEL_PRODUCTS` in [`api/src/services/funnels/model.ts`](../api/src/services/funnels/model.ts). That is where a product **declares its mapping**:

| Setting | Meaning |
|---|---|
| `slug`, `name`, `indexes` | Which product, and where its events land |
| `quietDays` | Days without a `use` before someone counts as "went quiet" |
| `activation` | `first_use`, or `explicit` if the product sends its own `activate` |
| `activationMeans`, `paidMeans` | One plain line each, shown on the page |
| `notApplicable` | Stages that do not exist for this product. Shown as "does not apply", never as 0% |
| `strictPrivacy` | Keep only the allowlisted fields (kids and family products) |
| `legacyRules` | Old log lines to read as funnel steps until the product sends real ones |

### Products declared today

| Product | Index | First real use | Paid means | Quiet after | Does not apply |
|---|---|---|---|---|---|
| Directors Palette | `directors-palette` | First finished image or video | Bought a points pack (one-time) | 30 days | Cancelled (no subscription) |
| Hey You're Hired | `hey-youre-hired` | Profile half done + first Smart Jobs run (its own `activate`) | Subscription payment | 14 days | — |
| Homework Tree | `homework-tree` | First homework session on the family account | Family plan payment | 14 days | — |

### Bridge rules (old lines that already count)

So the page shows real numbers before each product ships its part, LogNog reads these existing lines as funnel steps as they arrive. A line the product has already marked with `funnel_stage` is never re-read.

| Product | Existing line | Read as |
|---|---|---|
| Directors Palette | `User signup completed` | `signup` |
| Directors Palette | `generation_completed` | `use` |
| Directors Palette | `credit_event` with `status=insufficient` and `action=deduct` | `paywall` |
| Directors Palette | `checkout_session_created` | `checkout` |
| Directors Palette | `payment_completed` | `paid` |
| Hey You're Hired | `User signup` | `signup` |
| Hey You're Hired | `User activated` | `activate` |
| Hey You're Hired | `Feature completed: …` | `use` |
| Hey You're Hired | `Checkout started` | `checkout` |
| Hey You're Hired | `Payment conversion tracked` | `paid` |
| Hey You're Hired | `Subscription synced` with `status=canceled` | `churn` |

A bridged payment line that carries no amount (Hey You're Hired's old `Payment conversion tracked` line) counts as a payment and shows money as "not reported", never as $0.

Bridge rules only apply to lines that arrive after this ships; they do not rewrite history. A bridged line is stored exactly as the product sent it, with the funnel fields added: nothing is removed, so anything that already reads those lines keeps working. That also means a bridged line still carries whatever personal fields the product put on it; the clean-up above starts when the product marks the line itself.

## 4. How the numbers are worked out

**Who is one person.** One `user_id` is one person. Before sign-up they are an `anon_id`. The first event carrying both ids ties them together for good, so a visit and the account it became are counted once. Events with neither id are counted as "events without an id" and never as a person.

**The two ladders.** Each product is read against the same two ladders.

| Getting in | Paying |
|---|---|
| Visited → Started sign-up → Signed up → First real use → Came back | Signed up → Saw the price → Started checkout → Paid |

- The ladders count people **first seen in the chosen date range**, and how far each has got since.
- A person counts on a rung if they reached that rung **or any later one**. A step a product does not report yet can therefore never make a later number bigger than an earlier one.
- **Drop-off** between two rungs = people on the upper rung minus people on the lower one. The percentage shown is "of the rung above".
- LogNog reads 90 extra days of history before the range, so an old customer who shows up again is not counted as new.
- An account with no sign-up event for it anywhere in view is an **older account coming back** (someone signing in after months away). It is kept off the ladders, so it never reads as "visited, never signed up" or as a new sign-up; it still counts under "Have an account" (still using it if seen within the quiet window, otherwise quiet; never "new" or "never used", and left out of "how long they lasted"). This only applies to products that report sign-ups. The cost: a new person whose sign-up line was lost is also left off the ladders.

**Went quiet.** Signed up, used it at least once, and the last `use` is older than the product's quiet window. New accounts get the full window before they can be called "never used".

**Retention.** People are grouped by the week they signed up. Week 1 is days 7–13 after sign-up, week 2 is days 14–20, and so on. A week shows a blank, not 0%, until everyone in the group has had the chance to finish it.

**Before they pay.** For everyone who has paid: what they did in the 14 days before their first payment, next to how many non-payers ever did the same thing. "2.0×" means payers were twice as likely to have done it.

**The move to paying.** New payers = people whose first payment is in the range and is not a renewal (an event named `..._renewed`). LogNog keeps 90 days of history, so a yearly customer whose only payment in view is a renewal is not mistaken for a new one as long as the product names renewals that way. Money in = every payment in the range, renewals from older customers included. Also: the middle (median) number of days from sign-up to paying, which plan, repeat buyers, and checkouts started more than an hour ago and never finished. Invited testers and free access are never counted as paid; `paid` comes only from the payment provider's confirmation.

**Duplicates.** Two events from the same person with the same stage and `event_id` count once.

**Cancelled.** Their latest cancellation is newer than their latest payment. Someone who cancels and later pays again is not counted as cancelled.

**Limits.** Up to 300,000 funnel events per product are read per request, newest first. Past that, the oldest are left out and the page says the numbers are low. All days are UTC.

## 5. Weekly report and board

| Thing | Where |
|---|---|
| Weekly report page | LogNog → Funnels → Weekly report (`/funnels/weekly`) |
| Weekly email | Every Monday 9:00 AM Eastern, to the addresses in `FUNNEL_WEEKLY_TO`. If that is not set, to whoever already receives LogNog's enabled scheduled reports, as long as that is 3 people or fewer; otherwise nothing is sent. `POST /api/funnels/weekly/send?dryRun=1` (admin) says how many people it would go to without sending |
| Board view for a wall screen | LogNog → Funnels → Board view (`/funnels/board?seconds=20&days=30`, add `&product=<slug>` to hold on one) |

The weekly report puts the last 7 days next to the 7 days before, each measured as it stood when that week ended, and names the single biggest leak in one sentence. Only steps people take within minutes count as a leak there (starting sign-up, finishing it, checkout, paying), so a new account is not blamed for not having come back yet. The email goes at most once a week: if the mail server is reached and then reports a problem, it is not sent again. A product that has sent nothing says "No real data yet". Every section and slide is led by the product's own logo.

## 6. Asking LogNog directly

The Funnels page uses `GET /api/funnels/overview?days=30` and `GET /api/funnels/report?product=<slug>&days=30`. The same fields work in Search and on dashboards:

| What | Search |
|---|---|
| People at each stage | `search index=directors-palette funnel_stage=* \| stats dc(user_id) by funnel_stage` |
| Sign-ups by source | `search index=hey-youre-hired funnel_stage=signup \| stats count by utm_source \| sort desc count` |
| Money in by plan | `search index=homework-tree funnel_stage=paid \| stats sum(amount_cents) by plan` |
| What people hit the paywall on | `search index=directors-palette funnel_stage=paywall \| stats count by funnel_event` |
| Lines LogNog refused to count | `search funnel_error=* \| stats count by index_name, funnel_error` |

The ladders, quiet users, retention and "before they pay" need the per-person maths in `api/src/services/funnels/compute.ts`, which runs the same on ClickHouse and on the SQLite (Lite) build.

## 7. Changing this language

- Adding an optional field: add it here and to `FUNNEL_FIELDS`; no version change.
- Renaming or removing a field or stage: bump `funnel_v` and keep reading the old version.
- Adding a product: one entry in `FUNNEL_PRODUCTS`, plus that product's own change.
