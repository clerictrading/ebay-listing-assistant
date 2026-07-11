# Migration Plan — ebay-listing-assistant

Source: `CLAUDE.md` audit (2026-07-11) + reconciliation against `ai-studio-handoff.md`. This plan sequences the fixes found there. Work through phases in order — do not skip ahead to Phase 2/3 items while Phase 1 is incomplete, since later phases assume the foundation is stable.

**Rule for every phase below: one commit per numbered item, not one commit per phase.** Small, reviewable diffs — test/run the app after each item before moving to the next.

---

## Phase 1 — Unblock (make the one real pipeline actually reliable)

- [ ] **1.1** Add `ebay-api` to `package.json` as a real declared dependency (pin to the version actually in use, `9.5.2`, until 1.3 below is resolved). It currently only resolves by accident via a stray folder elsewhere on the machine.
- [ ] **1.2** Delete `worker.ts` and `ebay.ts` entirely (not comment out — remove). `index.ts` is the canonical pipeline; the second implementation is dead, unwired, and actively confusing to keep around.
- [ ] **1.3** Un-comment the mark-as-read (`messageFlagsAdd` / `\Seen`) line in `index.ts`. Currently the same email would be reprocessed indefinitely.
- [ ] **1.4** Fix `.gitignore` to a glob pattern (`CLERIC-*-manifest.json`) instead of one hardcoded filename, and remove the already-committed sample manifest from git tracking.

**Exit condition for Phase 1:** `index.ts` runs cleanly on a fresh clone with no reliance on machine-specific state, doesn't reprocess old email, and doesn't leave stray tracked files behind.

---

## Phase 2 — Close the functional gap that actually matters for the business

- [ ] **2.1** Build the missing image-attachment step: upload extracted card photos to eBay's EPS (image hosting) service, or host them at a public URL, and pass that into the listing payload. **This is the highest-priority item in the whole plan** — every draft this pipeline can currently produce ships with zero photos, which makes it non-functional for actual use regardless of how good the generated copy is.
- [ ] **2.2** Verify the eBay Sell API calls end-to-end against a real account (sandbox first if eBay offers one for this app). Neither existing implementation has ever been confirmed to complete a real listing — `ebay.ts` calls a method that doesn't exist on the resolving library version; `index.ts`'s path is unverified.
- [ ] **2.3** Fix the hardcoded `condition: 'USED'` and `Features: ['Holofoil', 'Unlimited']` values — these are correct for exactly one product type and wrong for everything else (sealed product, non-holo cards, limited editions).

**Exit condition for Phase 2:** a real card, photographed and emailed in, produces a real eBay draft listing with photos attached, correct condition, and correct item specifics — confirmed by actually looking at the resulting draft in the eBay Seller Hub.

---

## Phase 3 — Hygiene, once the pipeline is proven end-to-end

- [ ] **3.1** Add startup validation for required env vars (fail fast with a clear message, not a deep SDK error) instead of relying on non-null assertions (`process.env.X!`) throughout.
- [ ] **3.2** Split the pipeline so the IMAP mailbox lock isn't held for the entire duration of the slow Gemini/eBay calls — release it once the email/images are extracted.
- [ ] **3.3** Decide the fate of `client/` — it's currently a disconnected mock (can't even load: references `main.jsx`, actual file is `main.tsx`) with no API calls anywhere. Either wire it to a real backend once one exists, or shelve it until there's a working pipeline worth building a dashboard for.
- [ ] **3.4** Remove unused template leftovers in `client/src` (`ItemRow` component, Vite boilerplate CSS, unused assets) if/when `client/` is revived.
- [ ] **3.5** Create a real `.env.example` with placeholder values (already carved out in `.gitignore`, never actually created).
- [ ] **3.6** Add a minimal test suite — at least one integration-style test per external service touchpoint (Gmail parse, Gemini schema response, eBay draft creation) so future changes have a regression check. Do this last, once the pipeline shape has stabilized, so tests aren't written against code that's about to change.

---

## Not in scope for this migration — explicitly deferred

These were claimed in `ai-studio-handoff.md` but have no code behind them, and are **not** being rebuilt as part of this cleanup — they're future feature ideas, not regressions to restore:
- Live search grounding for pricing (TCGPlayer/eBay Solds lookups)
- Deterministic condition-multiplier valuation math
- Background cron crawler / admin-triggered polling
- On-the-fly prompt tuner with brand-vocabulary filtering
- Cost/token usage tracking and logging to a database
- GPT-5.4-mini fallback validator (mentioned in `cto-context-claude.md` as intended architecture, not yet built)

Revisit this list once Phase 2 is done and the core pipeline is trustworthy — worth prioritizing against the rest of the roadmap at that point, not before.

---

## Calendar note, not a code task

Gemini 2.5 Flash shuts down **October 16, 2026** (replacement: `gemini-3.5-flash`). Not urgent today — flagging so it doesn't get missed later.