# CLAUDE.md

This file documents the current state of the **ebay-listing-assistant** codebase as of an initial audit (2026-07-11), performed before any migration/refactor work. The project was originally built via AI Studio / vibe-coding and is being brought under normal engineering maintenance. Nothing was changed as part of this audit — this is a snapshot of what exists today, warts included.

## 1. Architecture & Stack

This is really **two unconnected projects living in one repo**:

### Backend (repo root) — Node.js / TypeScript automation script
- **Runtime**: Node.js (v24 locally), TypeScript ~6.0, executed directly via `tsx`/`ts-node` (no build step configured — `tsconfig.json` has no `outDir`/`rootDir` set up for a real build, and `package.json` has no `build` or `start` script at all).
- **Module system**: `package.json` declares `"type": "commonjs"`, but `tsconfig.json` uses `"module": "nodenext"` and all source uses ESM `import` syntax. Works today only because `tsx`/`ts-node` paper over it — there is no compiled/production run path.
- **Entry points** (three separate, non-integrated implementations of the same idea):
  - [index.ts](index.ts) — a single self-contained script: connects to Gmail via IMAP, pulls the latest unread email from one hardcoded sender, extracts image attachments, sends them to Gemini (`@google/genai`, model `gemini-2.5-flash`) with a JSON schema for structured output, writes a local `CLERIC-<timestamp>-manifest.json` file, then calls an inline `stageEbayDraft()` function to create an eBay inventory item + draft offer via `ebay-api`. Runs immediately on load (`runClericAutomationPipeline()` at the bottom of the file).
  - [worker.ts](worker.ts) + [ebay.ts](ebay.ts) — a second, differently-structured attempt at the *same* pipeline: `worker.ts` exports `startWorker()` (IMAP polling loop, Gemini via the older `@google/generative-ai` SDK, model `gemini-1.5-flash`), delegating eBay calls to `eBayService.stageListing()` in `ebay.ts`. **`startWorker()` is exported but never called from anywhere in the repo** — this entire module is dead code with no entry point.
  - [test-ai.js](test-ai.js) — a standalone plain-JS smoke test that just calls Gemini (`@google/generative-ai`, model `gemini-flash-latest`) with "Hello! Are you online?" to verify the API key works. Not part of the real pipeline.
- **External services touched**: Gmail (IMAP via `imapflow` + `mailparser`), Google Gemini (two different SDKs — see §4), eBay Sell API (via the third-party `ebay-api` package — see §3 for a load-bearing bug here).

### Frontend (`client/`) — React + Vite, fully disconnected
- **Stack**: React 19, Vite 8 (using the new Rolldown-based `rolldown-vite` bundler under the hood judging by `node_modules`), TypeScript (no `tsconfig.json` present in `client/` at all), `oxlint` for linting.
- **Files**: [client/src/App.tsx](client/src/App.tsx) renders a single `Dashboard` component — a static mock-up with hardcoded `logs` and `items` state (`useState`) and no data fetching whatsoever. [client/src/utils/printManifest.ts](client/src/utils/printManifest.ts) opens a new window and `document.write()`s a printable HTML manifest slip for a card SKU.
- **Not wired to the backend at all**: no `fetch`/`axios` calls anywhere in `client/src`, no API base URL, nothing. It's a visual mock, not a working dashboard. The backend has no HTTP server either (see §3) — there is nothing for it to call even if it tried.
- Root `.env` has `PORT=3001` defined but **no code anywhere reads `process.env.PORT`** — vestigial.

### How the pieces connect (today)
They don't, really. `index.ts` is the only path that could plausibly run end-to-end, and even that has an unverified/likely-broken eBay integration (§3). The `client/` app is a standalone visual prototype not called by, or calling, anything else in the repo.

## 2. What It Does (intended functionality, per the working code path)

Reading `index.ts` as the "real" pipeline:

1. Connects to `imap.gmail.com` as `corey@clerictrading.com` (via an app password), opens the `Personal` mailbox.
2. Searches for **unread** messages from one hardcoded supplier address (`ccleric7@gmail.com`).
3. Takes the single most recent matching unread message, parses it, and pulls out any image attachments.
4. If there are no images, it stops (no listing without photos).
5. Sends the images + a short system prompt ("You are the Cleric Trading Outpost eBay Listing Assistant... Priorities: Accuracy, Honesty, SEO...") to Gemini 2.5 Flash, requesting strict JSON matching a schema for a trading-card listing: pricing analysis (market value, suggested price, min offer, auction recommendation), SEO title, eBay category ID, item specifics (card name/set/number), condition summary, description body, shipping recommendation, search keywords, and a photo-by-photo defect log.
6. Writes that structured result to a local file `CLERIC-<epoch-ms>-manifest.json` in the repo root as a backup.
7. Attempts to stage the listing as a **draft** (not published/live) on eBay: creates/replaces an inventory item by SKU, then creates a fixed-price offer referencing the account's shipping/return/payment business policies.
8. Marking the source email as read is present in the code but **commented out** — so today the same email would be reprocessed every run.

In short: **a "photograph a card, email it in, get an AI-drafted eBay listing" pipeline for a trading card resale business**, intended to save the manual work of writing titles/descriptions/pricing for each card.

The `client/` dashboard *suggests* the intended UX is a web UI showing a log of worker activity and a table of drafted listings with a "print manifest" (packing-slip-style label) button and a link out to the eBay seller hub — but none of that is actually connected to real data yet.

## 3. Code Health Flags

Ordered roughly by severity:

- **Real secrets sitting in plaintext, and duplicated across two files.** [.env](.env) contains a live-looking Gemini API key and a real Gmail app password (`BOT_EMAIL_SECRET`) in plaintext. [.env_gemini_chat](.env_gemini_chat) — despite reading like a documentation/template file (with helpful comments about where to get each value) — **also contains that exact same real Gemini key and real Gmail app password**, not placeholders. Only the eBay fields in that file are genuine placeholders. Both files are correctly gitignored and neither is in git history (verified via `git log --all -- .env` and `git ls-files`), so nothing has leaked to the remote — but:
  - These credentials were just read in full during this audit (now present in this chat/session context) — **worth rotating the Gmail app password and Gemini key out of an abundance of caution**, and treating any AI tool session that reads `.env` as having seen live secrets going forward.
  - `.env_gemini_chat` should not exist as a second copy of real secrets — if it's meant to be a template, it should use placeholder values like the eBay lines do.
- **`ebay-api` is used but not an actual dependency of this project.** It's imported in both [index.ts](index.ts) and [ebay.ts](ebay.ts), but it is **not listed in `package.json`**, not in `package-lock.json`, and not present in this project's own `node_modules`. It currently only resolves at runtime because Node's module resolution walks up the directory tree and happens to find a stray copy at `/home/corey/node_modules/ebay-api` (v9.5.2) — unrelated to this repo. On any other machine, in CI, or the moment that stray folder is cleaned up, `import eBayApi from 'ebay-api'` will throw `Cannot find module 'ebay-api'`. This needs to be added to `package.json` as a real dependency before anything else is done with this code.
- **The eBay integration code itself is broken and internally inconsistent** — two different, incompatible calling conventions for the same library, neither fully verified:
  - [ebay.ts](ebay.ts) calls `ebay.setToken(...)` and `ebay.inventory.createOrReplaceInventoryItem(sku, {...})` (2-arg form). Confirmed by direct test during this audit: **`ebay.setToken` does not exist** on the `ebay-api@9.5.2` shape that happens to be resolving — this throws immediately if `startWorker()`/`ebay.ts` is ever exercised.
  - [index.ts](index.ts)'s `stageEbayDraft()` instead uses `ebay.OAuth2.setCredentials({...})` and `ebay.sell.inventory.createOrReplaceInventoryItem({ sku, body: {...} })` (single-object form, `sell.inventory` namespace). This looks like it matches a newer/different version or API surface than what `ebay.ts` assumes.
  - Neither path appears to have been run end-to-end successfully against a real eBay account (no evidence of a working, tested `stageEbayDraft` call in history/logs) — this is the single riskiest part of the codebase to trust as-is.
- **Dead code / dead files:**
  - `worker.ts` + `ebay.ts` — the entire second pipeline implementation. `startWorker()` is exported but never imported or called anywhere in the repo. Either finish wiring it up or delete it; right now it's pure maintenance burden and a source of confusion about which implementation is canonical.
  - `worker.ts` also writes to `./storage/<sku>.json`, but **no `storage/` directory exists in the repo and nothing creates it** — if this code ever ran, it would throw `ENOENT` on the very first successful listing.
  - `client/src/App.tsx` defines an `ItemRow` component that is never rendered — `Dashboard` builds its own inline `<tr>` markup instead. Unused component.
  - `client/src/App.css` still contains the original Vite template's `.hero`/`.base`/`.framework`/`.vite` boilerplate styles, and `client/src/assets/hero.png`, `react.svg`, `vite.svg` are unused template leftovers never referenced from `App.tsx`.
  - `CLERIC-1783492318220-manifest.json` in the repo root is a **generated output artifact that's actually committed to git** (confirmed via `git ls-files`) — evidence `index.ts` was run at least once. The `.gitignore` only excludes one specific old filename (`CLERIC-1783489922145-manifest.json`), not a glob pattern, so every future run will generate a new, ignorable-in-name-only file that git will happily track unless the pattern is fixed to `CLERIC-*-manifest.json`.
- **Verified bug: the client app cannot load at all.** [client/index.html](client/index.html) references `<script type="module" src="/src/main.jsx">`, but the actual file is [client/src/main.tsx](client/src/main.tsx) — `main.jsx` does not exist anywhere in the project. Running `vite dev` today will 404 on the entry script and render a blank page.
- **No `tsconfig.json` in `client/`** at all, despite the folder being authored in TypeScript (`.tsx`/`.ts` files throughout). There's nothing enforcing type safety on the frontend, and no typecheck script either (only `oxlint` is wired up as `npm run lint`).
- **Root `.oxlintrc.json` enables React-specific lint rules** (`react/rules-of-hooks`, `react/only-export-components`) for a plain Node.js backend project with no React anywhere in it — looks like it was copied from `client/.oxlintrc.json` without adjusting for context.
- **Hardcoded values that will bite later**: the sender filter (`ccleric7@gmail.com`), mailbox name (`'Personal'` in `index.ts` vs `'INBOX'` in `worker.ts` — another inconsistency between the two pipelines), and a hardcoded `'Features': ['Holofoil', 'Unlimited']` aspect value in both eBay staging paths that would be wrong for any non-holo, non-unlimited-edition card — this only works for one narrow product type despite the schema being general-purpose.
- **Weak error handling throughout**: both `index.ts` and `worker.ts` wrap the whole pipeline in one broad `try/catch` and `console.error` — a Gemini schema-validation failure, a malformed email, or an eBay auth failure all look the same from the logs, and none of it is surfaced anywhere except stdout (no alerting, no retry, no dead-letter handling for a message that fails processing).
- **Non-null assertions (`!`) used liberally** on every `process.env.X!` reference with no startup validation that required env vars are actually present — if any are missing, the failure happens deep inside an SDK call with a confusing error rather than a clear "missing config" message at startup.

## 4. Dependencies

Root [package.json](package.json):

| Package | Declared | Status |
|---|---|---|
| `@google/genai` | `^2.10.0` | **Current, correct SDK.** This is Google's actively maintained, unified GenAI SDK (latest on npm is ~2.11.0 as of this audit). Used only in `index.ts`. |
| `@google/generative-ai` | `^0.24.1` | **Deprecated / end-of-life.** This is the old `google-gemini/deprecated-generative-ai-js` SDK — Google's own repo is now archived/renamed to flag it as legacy, superseded by `@google/genai`. Used in `worker.ts` (dead code) and `test-ai.js`. Should be dropped entirely in favor of standardizing on `@google/genai`. |
| `imapflow` | `^1.4.6` | Fine, actively maintained. |
| `mailparser` | `^3.9.14` | Fine, actively maintained. |
| `dotenv` | `^17.4.2` | Fine. |
| `ebay-api` (used, **not declared**) | — | Imported in `index.ts` and `ebay.ts` but missing from `package.json`/`package-lock.json` entirely — see §3. Must be added as an explicit dependency (and its actual current API surface verified) before this code can be trusted anywhere but this one machine. |

**Gemini model IDs in use — verified against Google's current deprecation schedule:**
- `gemini-2.5-flash` (in `index.ts`, the live path) — currently valid, but Google has announced a shutdown date of **2026-10-16** for 2.5 Flash (replacement: `gemini-3.5-flash`). Not urgent, but worth planning a model-version bump before then.
- `gemini-1.5-flash` (in `worker.ts`, dead code) — **already fully shut down**; all Gemini 1.0 and 1.5 models now return `404` on any request. This code path could not work even if wired up.
- `gemini-flash-latest` (in `test-ai.js`) — a "latest" alias rather than a pinned version; fine for a throwaway smoke test but not something to rely on in the real pipeline since it can silently move underneath you.

`client/package.json`: React 19.2, Vite 8 (rolldown-vite variant), `@vitejs/plugin-react` 6, `oxlint` 1.71 — all current, nothing stale here. The frontend's problem is missing wiring/config (§3), not outdated packages.

No lockfile drift issues found beyond the `ebay-api` gap noted above.

## 5. Test Coverage

**None.** `package.json`'s `test` script is the default npm placeholder (`echo "Error: no test specified" && exit 1`), there is no test runner (Jest/Vitest/node:test/etc.) installed in either `package.json`, and there are no test files anywhere in the repo. `test-ai.js` is a manual smoke-test script for checking the Gemini API key works, not an automated test.

This is a real gap given the pipeline touches three external services (Gmail, Gemini, eBay) with no automated way to verify integration behavior or catch regressions — flagging per your instructions, not writing tests yet.

## 6. Reconciliation Notes: `ai-studio-handoff.md` vs. actual code

`ai-studio-handoff.md` is the handoff summary from the original AI Studio build session. It reads like a description of a considerably more mature system than what's actually committed here. Cross-checked every specific claim in it against the code (grepped for the relevant function calls, config keys, files, and directories it names) — the code is treated as ground truth throughout. `cto-context-claude.md` (business/brand context) is used where relevant as a secondary reference, since some of the handoff's claims tie directly into brand-voice requirements documented there.

### (1) Clean matches
- **Core dependency choice**: the handoff's claim that the system "leverages the `@google/genai` SDK with multimodal inputs (images)" matches `index.ts` exactly — it does use `@google/genai` and does send image parts alongside a text prompt.
- **IMAP source/target**: connecting to `imap.gmail.com`, watching for unread mail from `ccleric7@gmail.com`, and treating attached images as the trigger for appraisal — all accurately described and all present in `index.ts`.
- **eBay Sell API family**: the handoff's claim of using "the modern eBay Sell Inventory REST API (SKU-based inventory locations, items, offers) rather than legacy trading APIs" is directionally correct — both `index.ts` and `ebay.ts` do target `sell.inventory`/`inventory` endpoints (createOrReplaceInventoryItem + createOffer), not the old Trading API.
- **Manual setup env vars**: `GEMINI_API_KEY`, `BOT_EMAIL_USER`, `BOT_EMAIL_SECRET`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_USER_REFRESH_TOKEN`, `EBAY_FULFILLMENT_POLICY_ID`, `EBAY_RETURN_POLICY_ID`, `EBAY_PAYMENT_POLICY_ID` — all listed in the handoff's setup section actually are read via `process.env` in the code and all actually exist in `.env`. This part of the handoff is reliable as setup documentation.
- **Synchronous image I/O as tech debt**: the handoff's §5 concern about `fs.writeFileSync` blocking the event loop under batch load is accurate — both `index.ts` and `worker.ts` do write attachment/manifest data synchronously. This is real, still-current tech debt, correctly identified.
- **Brand vocabulary**: the handoff's mention of filtering out "specimen" and "sovereign" matches `cto-context-claude.md`'s explicit brand voice guidance (avoid "Sovereign, Specimen") — the two documents agree with each other on what the brand voice should be, even though (per §2 below) the code doesn't actually implement that filtering anywhere.

### (2) Conflicts — code vs. handoff

In every case below, **the code is the more trustworthy signal** — these read like features that were designed/discussed (or built in a different session/branch) but never made it into what's actually committed to this repo. I did not find any case where the handoff undersold something the code actually does.

- **"Live search grounding" for pricing (TCGPlayer/eBay Solds) — not in code.** The handoff claims the Gemini call "dynamically retrieves baseline pricing statistics directly from TCGPlayer and eBay Solds" via live search grounding. `index.ts`'s Gemini call config is just `{ responseMimeType, responseSchema, temperature }` — no `tools`/grounding config of any kind (grepped for `googleSearch`/`grounding`/`tools:` — zero hits). The `market_value`/`sold_range` fields in the schema are pure LLM guesses with no retrieval step behind them. **This is the single biggest gap between what the handoff describes and what exists** — the pricing numbers are not ground-truthed against real market data today, contrary to what the handoff implies.
- **"Deterministic Ground-Truth Valuation Math" (condition multipliers, 70/30 eBay/TCGPlayer weighting) — not in code.** No such blending algorithm exists anywhere in the repo. There is no code path that applies `NM=100%/LP=85%/MP=70%/HP=50%/DMG=30%` multipliers or any weighted average. The schema just asks the LLM to fill in a `pricing_analysis` object directly. Combined with the point above, the entire "ground-truth valuation engine" described in the handoff's architecture section appears to be aspirational/planned rather than implemented.
- **"Fully Implemented & Working Features" (handoff §2) — most of this list has no corresponding code at all:**
  - *Dynamic Background Cron Crawler (`setInterval`-based, admin-dashboard controlled)* — no `setInterval` anywhere in the repo (grepped, zero hits). `index.ts` runs its pipeline exactly once per process invocation and exits; there is no persistent poller, admin-triggered or otherwise, and no admin dashboard control surface (the `client/` app has zero API calls to control anything — see §1/§3 above).
  - *On-the-Fly Prompt Tuner with brand-term filtering* — no interface, no filtering logic, anywhere. The prompt in `index.ts` is a hardcoded string with no brand-voice content at all (no "Vault," "Guarded," "Sourced in the Rockies," medieval/mountain-outpost flavor — grepped for these terms, zero hits in the prompts). This also means the live code doesn't currently honor the brand voice documented in `cto-context-claude.md`, independent of the handoff issue.
  - *Robust Cost/Token Tracker* and *Central DB Usage Logger (Firestore/Supabase/Mongo/HTTP)* — no token-tracking code, no DB client libraries installed (`package.json` has none of Firestore/Supabase/Mongo SDKs), no custom HTTP logging calls.
  - *Admin Audit Logging & Workspace Stats* — nothing resembling this exists.
  - Net effect: of the six bullet points in the handoff's "fully implemented" list, only the first (multimodal defect inspection, and only its non-brand-voice half) is actually present in the code.
- **"Asynchronous Dual-Track Processing" — the opposite is true.** The handoff describes IMAP extraction and the slow appraisal/eBay pipeline as split into two phases so the mailbox lock isn't held during the slow work. In `index.ts`, the entire pipeline — search, fetch, parse, the Gemini call, and both eBay REST calls — runs **inside a single `getMailboxLock('Personal')` … `lock.release()` block**. Not only is there no dual-track split, the current code holds the IMAP lock for the full duration of the slowest steps, which is worse than "no optimization" — it's a design that would actively stall other mailbox access while an appraisal is in flight.
- **"Marks crawled emails read (\Seen) to prevent loops" — true only in the dead code path.** In `index.ts` (the path that actually runs), that line is present but **commented out** (`// await client.messageFlagsAdd(...)`), so the live pipeline would reprocess the same email indefinitely. The uncommented, working version of this exists only in `worker.ts`, which is never invoked. The handoff's claim is true of code that exists in the repo, just not the code path that's actually wired up.
- **eBay category-mapping "recently resolved" bug fixes (handoff §3) — none of the described workarounds exist in code:**
  - *Leaf-category mapping table* — there's no lookup/mapping logic; `index.ts` just passes through whatever `ebay_category_id` the LLM returns, guided only by a prompt instruction ("Map categories exactly to eBay standard leaf IDs"). The specific leaf IDs the handoff cites (183447, 183454, 183456, 261328) appear nowhere in the code as constants — the one committed sample manifest ([CLERIC-1783492318220-manifest.json](CLERIC-1783492318220-manifest.json)) happens to contain `183454`, but that's the LLM outputting a plausible-looking number, not a code-enforced mapping.
  - *Sealed vs. singles conditionId branching (1000 vs. 3000 + condition descriptor maps)* — the code doesn't use `conditionId` at all (grepped, zero hits); it hardcodes the string `condition: 'USED'` unconditionally, with no branching for sealed product.
  - *Offer-state-lock handling (detect active offer → DELETE → update → recreate)* — no such check exists; `createOffer` is called once, blind, every run.
  - *Explicit `Content-Language`/`Accept-Language` headers* — grepped, zero hits anywhere in the repo. If the underlying `ebay-api` library sets these internally that's outside this repo's code, but nothing here sets them explicitly as claimed.
  - Given none of these fixes exist in code, and the eBay integration is already independently confirmed broken (§3 above — `ebay.setToken` doesn't even exist on the resolving library version), **the handoff's framing of the eBay integration as battle-tested with "recently resolved" edge cases should not be trusted** — the current code hasn't been shown to successfully complete a single real eBay draft creation.
- **Internal inconsistency inside the handoff itself, worth flagging on its own terms:** §2 lists the `setInterval` cron crawler as a *fully implemented, working feature*; §5 separately lists that same `setInterval` approach as *tech debt to revisit* because it's unreliable in serverless/multi-node setups. Since no `setInterval` exists anywhere in the actual repo, the two sections of the handoff can't both be describing this codebase — at least one (likely both) is describing a different session's state or a planned-but-since-reverted feature.

### (3) In the handoff but no corresponding code — still worth knowing

- **Card photos are never attached to the eBay listing, in either implementation.** `ebay.ts` has an explicit `imageUrls: [] // In production, upload buffers to eBay EPS first` — a TODO that was never done. `index.ts`'s listing payload has no image field at all. The handoff's setup section lists `APP_URL="https://your-domain.com" # Server Ingress Url (For public image resolution on eBay listings)` — this is the missing piece: something was clearly intended to host the extracted card images at a public URL and pass that to eBay (or upload to eBay's EPS image service) so listings would actually show photos, but that step doesn't exist anywhere in this repo, `APP_URL` isn't read by any code, and it isn't even present in the current `.env`. **This means every eBay draft this pipeline could currently produce would have zero photos attached** — worth flagging as a functional gap independent of the eBay-integration bugs already noted, since a card listing with no photos is close to useless for this business regardless of how good the AI-generated copy is.
- **`.env.example`**: the handoff tells the reader to "refer to `.env.example` in the root directory" — no such file exists in this repo (only `.env` and `.env_gemini_chat`, both gitignored). `.gitignore` does carve out an exception for `.env.example` (`!.env.example`), suggesting one was planned/expected but never actually added. Worth creating one (with placeholders only) if onboarding anyone else to this repo.
- **Flat-file "database" at `/data/db.json`**: the handoff's tech-debt section describes app state (appraisals, config, logs) persisting to `/data/db.json`. No `data/` directory and no `db.json` exist anywhere in this repo, and nothing in the code reads/writes that path. The specific claim doesn't correspond to anything here — but the general worry (state scattered across local flat files instead of a real datastore) is still directionally true of what *does* exist: the loose `CLERIC-<sku>-manifest.json` files written to the repo root, and the never-created `storage/` directory `worker.ts` expects. Worth keeping the underlying concern even though the specific file path is fictional.
- **GPT-5.4-mini fallback validator**: not from the handoff, but `cto-context-claude.md`'s stack pointers describe the intended AI pipeline as "Gemini 2.5/3 Flash (primary) + GPT-5.4-mini (fallback validator)." No OpenAI SDK is installed and no fallback/validation logic of any kind exists in the code — this pipeline is Gemini-only today, with no fallback path if a Gemini call fails or returns a low-confidence result. Worth knowing as a planned-but-unbuilt piece of the intended architecture, distinct from anything AI Studio claimed to have finished.
- **Condition-multiplier valuation math, leaf-category tables, and admin/cost-tracking tooling** (all covered in §2 above) should all be treated as **design intent / planned work**, not completed features to preserve during migration — there's no implementation to carry forward, only the idea of them.
