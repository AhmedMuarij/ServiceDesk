# Module 2 — Build Log

What was built, what was measured, and the things that turned out differently
from the plan. Scope and locked decisions: [05-module-2-scope.md](./05-module-2-scope.md).

**Status: Module 2 complete.** All 14 steps done, all 8 definition-of-done
criteria met.

| Step | | State |
|---|---|---|
| 1 | Provider SDK, guarded client, model config | done |
| 2 | `AiSuggestion`, `AiUsageLog`, AI settings + migration | done |
| 3 | The suggestion pattern — propose / accept / reject | done |
| 4 | Guardrails — spend cap, rate limit, degradation | done |
| 5 | Job classification | done, measured |
| 6 | Job summary from technician notes | done |
| 7 | Technician recommendation | done |
| 8 | Invoice line-item draft | done |
| 9 | Weekly business insight | done |
| 10 | Context caching — measure first | done, measured, deferred |
| 11 | Eval fixtures + measured accuracy | done |
| 12 | AI settings screen | done |
| 13 | Usage and cost visibility | done |
| 14 | Tests, verification, docs | done |

**Verification:** 19 unit tests, 16 Module 1 invariants, 12 outbox checks,
27 HTTP checks, **17 AI invariants**, 20 scored eval fixtures. All passing.

```bash
npm run check                 # typecheck + unit tests
npm run verify                # Module 1 invariants
npm run verify:outbox         # the notification outbox
npm run verify:http           # tenancy and roles over HTTP
npm run verify:ai             # Module 2 invariants
npm run eval:classification   # 20 scored fixtures, ~2 min, free
npm run ai:models             # what your key can reach
npm run ai:cache-probe        # is context caching reachable at this size
```

---

## The one architectural claim

**No model output reaches a job, an assignment or an invoice without a human
accepting it.** Everything else in this module is in service of that.

`acceptSuggestion` marks a row and hands back a payload. It does not write to
the target. Applying goes through the *existing* Module 1 write paths —
`updateJob`, `assignTechnician`, `setJobSummary`, `createInvoice` — with their
validation, permissions, status transitions and history. The model never gets a
write path of its own.

`npm run verify:ai` enforces this structurally, not by convention:

- `lib/db/ai.ts` contains no write to a job or invoice — checked against the source
- No module in `lib/ai/features/` writes to the database at all — all five are read-only
- Creating a suggestion leaves the target byte-identical; so does rejecting one

If someone later adds a shortcut, those checks fail.

---

## Measured: job classification

20 fixtures — mixed English/Urdu, some very terse ("AC kharab"), two describing
appliances the business does not service.

| | `gemini-3.6-flash` | `gemini-3.5-flash-lite` |
|---|---|---|
| Cases scored | 19/20 (1 throttled) | **20/20** |
| Service type (strict) | 18/19 — 95% | **20/20 — 100%** |
| Priority exact | 14/19 — 74% | 13/20 — 65% |
| Priority within one step | 19/19 — 100% | **20/20 — 100%** |
| Median latency | 4,804 ms | **1,405 ms** |

flash-lite is the default: perfect service-type accuracy, 3.4× faster, and it
does not exhaust the free-tier quota mid-run.

Priority *exact* agreement is lower on flash-lite, but **neither model was ever
more than one step out**. Priority is a judgement call and the fixtures encode
one opinion; the within-one-step figure is the honest measure.

---

## What testing caught

Three real defects, all found by exercising the features rather than reading them.

### Classification reached for "none of these"

`"Remote kaam nahi kar raha, AC theek hai"` came back as *none of these fit*.
Defensible in the abstract; wrong for the business, which books that as AC
repair. One line added — a fault in a unit's controls or accessories is still a
repair of that unit. It classifies correctly now, and the two genuine
out-of-catalog fixtures still return `__none__`, so the escape hatch survived
the fix.

### The summariser ignored a flagged follow-up

A note said the outdoor fan bearing was noisy and the customer had been told it
was *"abhi urgent nahi"*. `followUp` came back null — but that is exactly a
thing to come back to. The instruction now names the case. Re-tested: the
bearing and a "recommended 6 monthly" are both caught, and a job with nothing
outstanding still returns null.

### The invoice drafter double-charged the callout — the serious one

Job #1001 was booked as **AC repair**, and the technician's note mentioned
topping up 200g of gas. The draft billed **AC repair 3,500 + Gas refilling
4,500 = 8,000** — a second full service call for work done during the first
visit. The callout charged twice, on a document that goes to a customer.

The rule now states it plainly: the booked service is the one main line, and
work done during that same visit is materials, not another callout. After the
fix:

| Job | Booked as | Before | After |
|---|---|---|---|
| #1001 | AC repair, gas topped up | 8,000 | **3,500** + gas as a part awaiting a price |
| #1003 | Genuine gas refilling job | — | **4,500**, correctly billed |

The second row is the important one: the fix stopped the double-charge without
making the model timid about legitimate service charges.

This is why decision 1 exists. A human reviews every draft — but a plausible
8,000 gets approved far more often than an obvious mistake does.

---

## Design notes worth keeping

**The schema does the constraining, not the prompt.** The classifier's
service-type enum is built from the tenant's own catalog at call time, so the
model cannot name a service that doesn't exist. Same for the technician
recommender: the candidate ids are an enum, so it cannot invent a person. This
is a stronger guarantee than "please only use these", which a model may ignore.

**Grounding is shown, not asserted.** The summariser must return `groundedIn` —
the exact note fragments each claim rests on — and they appear beside the draft.
Reviewing generated text you cannot check is just a slower way of trusting it.

**Money is the most conservative feature.** The invoice drafter may only price
from the org's catalog or from a figure written in the notes. Anything else is
0 and flagged `needs a price`. A zero is obviously incomplete and gets fixed; an
invented price looks finished and gets sent.

**Arithmetic stays in Postgres.** The weekly insight computes every figure in
SQL and hands them to the model as facts. It is asked what they mean, never to
calculate. Totals are something a database is reliably good at and a language
model is not.

**Drafts are editable before saving.** The summary lands in a textarea, not a
confirm dialog.

---

## Step 10: caching, measured and deferred

The scope originally claimed prompt caching was on. It isn't, and it can't be:

```
per-tenant block:      1715 chars, ~429 tokens
typical cache minimum: 1,024–4,096 tokens
actual input tokens:   431, 431
cache reads:           0, 0
```

A five-service catalog is less than half the smallest threshold. Enabling
caching would have cached nothing while letting the docs claim a feature. The
prompt still keeps the per-tenant block separable so it can be switched on when
the context grows — `npm run ai:cache-probe` re-checks in seconds.

Measure before claiming.

---

## Provider: Google Gemini, free tier

Switched from Claude Opus 5 mid-module, for one reason: budget. Gemini has a
genuine free tier with no card.

The switch touched **one file**. `lib/ai/client.ts` is the only application
module that imports a provider SDK — `verify:ai` asserts exactly that, so it
stays true. Everything else calls `ask()`.

Structured output survived intact: Zod 4's `z.toJSONSchema()` feeds Gemini's
`responseJsonSchema`, and a Zod validation pass runs *after* parsing as well — a
schema the provider honours loosely is not the same as a guarantee.

---

## Provider surprises

### `models.list` lies

It returns models the key cannot call. `gemini-2.5-flash` appears in the listing
and then 404s with *"no longer available to new users"*. The error names the
replacement. `npm run ai:models` prefers newest-first for this reason — don't
treat the listing as an availability check.

### Free-tier quota is per model, and small

20 requests on a short rolling window, **counted separately per model**. While
`gemini-3.6-flash` was throttled, `gemini-3.5-flash-lite` answered immediately.
The 429 carries a `retry in Ns` hint, surfaced as `retryAfterMs` so batch
callers wait properly instead of guessing.

### The rate limiter throttled itself

The first version counted every usage row in the last minute, including
provider-refused ones — so being throttled made the app throttle itself harder
and the window never cleared. A run of 429s became a self-inflicted outage. It
now excludes attempts the provider already refused.

---

## Deploying the crons on a free plan

Vercel Hobby caps cron jobs at once per day. The nightly reminder fits that
exactly and stays in `vercel.json`. The notification dispatcher does not — an
email that waits up to 24 hours to leave is not a notification — so it runs
from GitHub Actions every five minutes instead, in
`.github/workflows/dispatch-notifications.yml`.

That split costs nothing and needs no code change, because the dispatcher was
already an authenticated HTTP endpoint rather than an in-process timer. It also
survives GitHub delaying a scheduled run: the dispatcher claims rows with
`FOR UPDATE SKIP LOCKED`, so a late or overlapping invocation is harmless.

Two repository secrets are required — `APP_URL` and `CRON_SECRET`.

## Cost

Zero, on the free tier. Tokens and latency are still logged per feature and
shown in **Settings → AI**, so usage is visible even when it is free.

The spend cap is wired and tested but inert while rates are zero — enabling paid
billing means editing the rate table in `lib/ai/config.ts` and nothing else. On
a free tier the live guardrail is requests per minute.
