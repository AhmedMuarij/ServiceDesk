# Module 2 — Frozen Scope (AI)

**Status:** frozen as of 2026-08-29. Module 1 is complete and verified; this
builds on it. Anything not listed under *In scope* is out.

**Goal:** the dispatcher does less typing and makes better calls, without ever
being lied to. The model reads what the customer said and proposes a service type
and priority; it turns a technician's rough notes into something you'd send a
customer; it says who should take the job and why; it drafts the invoice lines;
and it writes an honest weekly read of the numbers. Every one of those is a
**suggestion a human confirms**.

---

## Locked decisions

| # | Decision | Chosen | Why |
|---|---|---|---|
| 1 | What AI is allowed to do | **Propose only.** Every output is an `AiSuggestion` a human accepts or rejects. Nothing is written to a job, invoice or assignment by the model | A wrong service type on an invoice costs real money. A wrong *suggestion* costs one click |
| 2 | Provider & model | **Google Gemini, free tier** (`gemini-2.0-flash` by default, override with `GEMINI_MODEL`) | Budget is a real constraint on this project and Gemini has a genuine free tier — no card. The provider sits behind `ask()` in one file, so this is reversible |
| 3 | Evals | **In.** Fixture set with measured accuracy for classification and recommendation | Without a number, "the AI is good" is a feeling. This is the difference between the feature and a demo of the feature |
| 4 | Smart scheduling | **Out.** Deferred | "Optimise tomorrow" is a routing and constraints problem, not a prompt. It deserves its own module, not a bullet in this one |
| 5 | Failure behaviour | **Degrade silently.** No key, disabled, over budget, or API down → the feature disappears; the app behaves exactly as Module 1 | Same principle as the notification outbox: an optional subsystem must never be able to block the core workflow |
| 6 | Cost control | **Per-org monthly spend cap**, enforced before the call, with usage logged per feature | An unbounded LLM bill on a small business's account is the failure mode that ends the trial |
| 7 | Prompt caching | **Deferred, not claimed.** The per-tenant block is assembled separately from the volatile part so caching *can* be switched on later | Providers only cache prefixes above a minimum size (roughly 1-4k tokens). A five-service catalog is nowhere near it, so enabling caching here would be theatre — it would cache nothing |

---

## In scope

### Foundation
- Provider SDK, a single client wrapper, model configuration
- `AiSuggestion` — the propose/accept/reject record every feature writes through
- `AiUsageLog` — tokens, cost, latency and outcome for every call
- Per-org AI settings: master switch, per-feature toggles, monthly spend cap
- Guardrails: spend cap checked before the call, per-org rate limit, graceful degradation

### Features
1. **Job classification** — the customer's description → suggested service type and priority, on the job form
2. **Job summary** — the technician's notes → a customer-facing summary, on completion
3. **Technician recommendation** — who should take this job, with the reasoning shown
4. **Invoice draft** — job notes and service type → suggested line items
5. **Weekly insight** — a written read of the real dashboard numbers

### Quality
- Prompt structure that keeps the per-tenant block separable, so caching is available when the context grows
- Eval fixtures with measured accuracy for classification and recommendation
- AI settings screen: toggles, spend cap, and what's been spent
- Usage and cost visibility per feature
- Tests, verification scripts, docs

---

## Explicitly out of scope

| Out | Why / when |
|---|---|
| Smart scheduling, route optimisation | Its own module — a constraints problem, not a prompt |
| AI writing anything without confirmation | Decision 1. Not a "later" — a deliberate permanent boundary for this module |
| Chat interface / "ask your data" | Later. Different product surface |
| Customer-facing AI (auto-reply to customers) | Later, and only with Module 4's customer portal |
| Voice / call transcription | Later |
| Fine-tuning or embeddings / RAG over job history | Later. The context fits in a prompt at this scale |
| Photo understanding (diagnose from a picture) | Module 3 — there are no photos until the PWA |
| Multi-language output | Later — worth doing properly for Urdu, not as an afterthought |
| Streaming responses in the UI | Later. Every call here is short and happens behind a button |

---

## Build order

Each step ends with something you can click, same rule as Module 1.

1. SDK, client wrapper, model config, env
2. Schema: `AiSuggestion`, `AiUsageLog`, AI settings + migration
3. The suggestion pattern — create, accept, reject, all tenant-scoped
4. Guardrails — spend cap, rate limit, degradation when unavailable
5. Job classification + its accept/reject UI on the job form
6. Job summary from technician notes
7. Technician recommendation
8. Invoice line-item draft
9. Weekly business insight on the dashboard
10. Measure whether context caching is reachable at this size; wire it only if it is
11. Eval fixtures + measured accuracy
12. AI settings screen
13. Usage and cost visibility
14. Tests, verification, docs, build log

---

## Definition of done

- [x] With no `GEMINI_API_KEY`, the entire app behaves exactly as Module 1 — no errors, no broken screens, AI affordances simply absent
- [x] No AI output ever reaches a job, invoice or assignment without a human accepting it — provable by a test that rejects a suggestion and asserts the target is unchanged
- [x] An org over its monthly spend cap makes **no** API call, and says so — verified by forcing an org over its cap and asserting zero new usage rows
- [x] Every call is logged with tokens, cost and latency, and the total reconciles with the per-feature figures shown in settings
- [x] Classification accuracy is **measured** on a fixture set, not asserted — 100% on service type, 20/20
- [x] A tenant cannot read or act on another tenant's suggestions — same 404 proof as Module 1
- [x] Exactly one file imports a provider SDK, so switching providers is a one-file change
- [x] An API outage during classification leaves the job creation flow fully working
