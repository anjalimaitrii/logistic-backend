# Project Context

* **Project purpose:** Fleet/logistics management platform (Zambia-based trucking) — bookings, dispatch/assignment, driver app tracking, fuel/toll/settlement accounting, client ledger & invoicing, admin ops.
* **Stack:**
  * Backend (`logistic-backend`): Node.js + TypeScript, Express 5, Mongoose 9 (MongoDB), JWT (`jsonwebtoken`) + `bcryptjs` auth, Socket.io (realtime), `node-cron`, AWS SDK (S3 + SES), `xlsx` (Excel export). Test runner: native `node --test` via `tsx`.
  * Frontend (`logistic`, package name `frontend-logistic`): Next.js 16.2.2 (webpack mode), React 19.2.4, Tailwind CSS 4, `socket.io-client`, PWA via `@serwist/next`.
* **Repository structure:** Two **separate, unrelated git repos** in one parent folder (parent folder itself is NOT a git repo):
  * `logistic/` — frontend, remote `origin` = `anjalimaitrii/...` (frontend repo), live branch `master`.
  * `logistic-backend/` — backend, remote `origin` = `github.com/anjalimaitrii/logistic-backend`, live branch `main`.
  * Both repos currently checked out on branch **`dev2`** (feature/dev branch), each exactly **1 commit ahead** of their live baseline (`master`/`main` respectively), commit message `"update"` on both, same day (2026-09-08). No drift — clean merge candidate.
* **Production/deployment architecture:** PM2-managed processes (`ecosystem.config.cjs` in each repo).
  * Backend: PM2 app `fleet-backend`, runs `dist/server.js`, `PORT=6006`, `NODE_ENV=production`.
  * Frontend: PM2 app `fleet-frontend`, runs `next start`, `PORT=6007`, `NODE_ENV=production`.
  * Build: backend `npm run build` (tsc → `dist/`), frontend `next build --webpack`.
* **Database:** MongoDB via Mongoose. No `.env` file present in either repo (not committed) — connection string/secrets: `UNKNOWN` (not inspected, out of scope — do not need for doc work).
* **Authentication/authorization:** Cookie-based role gate at the edge — `logistic/middleware.ts` reads a `role` cookie (`admin` | `client`) and redirects `/admin/*` and `/dashboard*`/`/bookings*` routes if role doesn't match. Actual JWT issuance/verification logic: `UNKNOWN` — not inspected this session (backend has `jsonwebtoken`+`bcryptjs` deps, implies JWT-based API auth, but controller/middleware files not read).
* **Important environment/configuration details:** No secrets encountered or handled this session. PM2 ports 6006 (backend) / 6007 (frontend) are the only concrete prod config seen.

---

# Conversation / Work History

This session performed **one task**: a read-only delta/gap analysis for a change request internally referred to as **CR-CUR-002** (multi-currency ZMW/USD support). No code was written or modified. An earlier chat turn (not fully visible in this session's context) reportedly audited USD-related functionality on the dev branch — that prior audit's raw content is `UNKNOWN` to this session; this session re-derived everything directly from the repos rather than trusting that reference.

### [CR-CUR-002 — MAIN vs Dev Branch vs Client Requirement delta analysis]

* **Requirement:** Client wants: `International Trip = Yes/No` field; ZMW and USD support; a single international trip may contain both ZMW and USD transactions; revenue/driver-allowance/fuel/toll/expenses may each be ZMW or USD; no automatic FX conversion; ZMW and USD must never be blindly combined; existing ZMW data must keep working; admin controls where relevant; must be compatible with a separate pending CR (`CR-BD-001`, mid-trip truck breakdown). Explicit instruction: **do not implement anything**, produce a report only.
* **What was investigated:**
  * `git diff main..dev2` (backend) and `master..dev2` (frontend), full file-by-file review of every changed file.
  * Grepped both live branches (`main`, `master`) for `currency|USD|ZMW|international` across `src`/`app`/`components`/`test`/`docs` to confirm nothing currency-related exists on live.
  * Read `logistic-backend/docs/CR-BD-001-mid-trip-truck-breakdown.md` in full (proposal doc, not implemented) to check schema-conflict risk between the two CRs.
  * Ran backend test suite for the two currency-relevant lib files: `test/paymentAllocation.test.ts`, `test/settlementDiff.test.ts`.
  * Grepped frontend accountant/route-master/reports pages to confirm which UI surfaces do/don't have currency awareness.
* **What was changed:** Nothing — read-only analysis, per explicit instruction.
* **Files changed:** None (this task). (This handoff doc itself is the only file written, in the follow-up task below.)
* **Key implementation details:** See "Changes Already Implemented" table below for the full per-file breakdown of what exists on `dev2` vs `main`/`master`.
* **Testing performed:** `node --import tsx --test test/paymentAllocation.test.ts test/settlementDiff.test.ts` on `logistic-backend` @ `dev2` → **28/28 pass**.
* **Result:** Delivered a structured report (sections A–H: MAIN baseline, dev branch additions, client requirement restated, gap table, no-double-count callouts, breakdown-CR interaction, timeline, open business questions) directly in chat. Not published as a separate doc/artifact at that point.
* **Current status:** Analysis complete and delivered. No CR has been drafted for the client yet. No implementation started.

---

# Current System State

* **Main user flows:** Client books a job → admin finalizes deal (sets `finalAmount`/`advancePaid` via `FinalizeDealDrawer`) → trip assigned/dispatched → driver runs trip (driver app, not in these two repos — location `UNKNOWN`) → accountant enters settlement figures (fuel, toll, driver allowance/`cashAllocation`, expenses) via `admin/accountant` pages → client views ledger/invoice, makes payments (FIFO-allocated across oldest unpaid bookings).
* **Admin flows:** Booking requests (`admin/requests`), dispatch/assignment (`OperationAssignmentDrawer`), completed jobs + invoicing (`admin/completed-jobs`), accountant settlement approval (`admin/accountant`), route master (`admin/routes`), toll matching (`tollController.ts`, auto-matches eToll entries by truck+time window), reports/Excel export (`ReportView.tsx`), secret/off-books jobs (`admin/secret/*`, excluded from client-facing ledgers).
* **Permissions/roles:** Two roles observed at the edge: `admin`, `client` (cookie-gated, see middleware above). Finer-grained permission logic inside API routes: `UNKNOWN` (not inspected).
* **Important business logic:**
  * Payment FIFO allocation: oldest unpaid booking settled first (`ledgerController.ts` → `lib/paymentAllocation.ts::planAllocation`).
  * Settlement change auditing: `lib/settlementDiff.ts` produces human-readable timeline entries for what changed on each settlement save.
  * "Secret" bookings are excluded from client ledgers (`secretFilter`/`EXCLUDE_SECRET` in `ledgerController.ts`).
* **Frontend ↔ backend flow:** Next.js app calls Express API via `services/*.ts` (e.g. `ledgerService.ts`, `bookingService.ts`) → Express controllers in `logistic-backend/src/controllers/*` → Mongoose models.
* **Database flow:** Mongoose ODM, models in `logistic-backend/src/models/*` (`Booking`, `Payment`, `Settlement`, `Route`, `Assignment`, `Driver`, `Truck`, etc.).
* **Production behavior:** `UNKNOWN` beyond what PM2 configs state — no live prod system was queried this session.
* **Relevant validations/restrictions:** None specific to currency exist yet on live. Mid-trip driver/truck reassignment has locking rules documented in `CR-BD-001` doc (`isAssignmentLocked`) — relevant context if that CR proceeds, not yet built.

---

# Changes Already Implemented

All rows below are on branch **`dev2`** in each repo, **NOT YET on `main`/`master`** (live). Nothing in this table has been merged to live.

| Area | File(s) | Change | Status |
|---|---|---|---|
| Booking currency | `logistic-backend/src/models/Booking.ts` | Added `currency?: "ZMW"\|"USD"`, default `"ZMW"` | Implemented, tested indirectly, not merged |
| Payment currency | `logistic-backend/src/models/Payment.ts` | Added `currency` enum, default `"ZMW"` | Implemented, not merged |
| Route USD fields | `logistic-backend/src/models/Route.ts` | Added `tollAmountUsd`, `allocationMoneyUsd`, `councilLevyUsd` | Schema only — **no UI wired**, dead field |
| Settlement USD fields | `logistic-backend/src/models/Settlement.ts` | Parallel `...Usd` sibling on every money field (fuel legs, `extraLegs`, `expenses`, all of `financials.*`, `tollAmount`) | Schema only — **no accountant UI**, most fields not even read from `req.body` on save |
| Booking status update | `logistic-backend/src/controllers/bookingController.ts` | `updateBookingStatus` accepts/saves `currency` | Implemented |
| Settlement save | `logistic-backend/src/controllers/settlementController.ts` | Persists `fuelRateUsd` on save | Implemented, narrow (only this one USD field wired) |
| Ledger FIFO currency-matching | `logistic-backend/src/controllers/ledgerController.ts` | Payments only allocate to invoices of the same currency; reversal is currency-filtered | Implemented, unit-tested |
| Payment allocation logic | `logistic-backend/src/lib/paymentAllocation.ts` (new file) | Pure `planAllocation()` — currency-matched FIFO | Implemented, 12 unit tests pass |
| Settlement audit trail | `logistic-backend/src/lib/settlementDiff.ts` | Currency-tagged diff/timeline output | Implemented, 16 unit tests pass |
| Test coverage | `logistic-backend/test/paymentAllocation.test.ts`, `test/settlementDiff.test.ts` | New/extended | 28/28 passing (verified this session) |
| Breakdown CR doc | `logistic-backend/docs/CR-BD-001-mid-trip-truck-breakdown.md` | Proposal/analysis doc for a separate CR | Documentation only, no code |
| Currency formatter | `logistic/lib/currency.ts` (new file) | `CurrencyCode`, `CURRENCIES`, `currencySymbol()`, `formatMoney()`, `totalsByCurrency()`, `formatTotals()` | Implemented, no frontend test suite exists to verify |
| Deal finalization UI | `logistic/components/admin/FinalizeDealDrawer.tsx` | Currency toggle (ZMW/USD) | Implemented |
| Ledger UI | `logistic/components/admin/LedgerDrawer.tsx` | Per-currency summary banner + payment currency toggle | Implemented |
| Invoice UI | `logistic/components/admin/InvoiceDrawer.tsx` | Currency-correct header label | Implemented |
| Receive-payment UI | `logistic/components/admin/ReceivePaymentDrawer.tsx` | Shows currency symbol from booking (single-booking direct payment, no FIFO risk) | Implemented |
| Client ledger page | `logistic/app/(client)/dashboard/ledger/page.tsx` | Per-currency KPI tiles | Implemented |
| Ledger service types | `logistic/services/ledgerService.ts` | Payload types add optional `currency` | Implemented |
| Currency symbol display | 6 pages: `admin/completed-jobs`, `admin/requests`, `admin/dashboard`, `admin/secret`, `admin/secret/jobs`, `(client)/dashboard/jobs` | Swap hardcoded `"K"` for `currencySymbol()`/`formatMoney()` | Implemented |
| **Gap (confirmed not built anywhere, dev2 or main)** | `admin/accountant/page.tsx`, `admin/accountant/[id]/page.tsx` | Fuel/toll/allowance/expenses entry UI — **zero currency awareness** | Not started |
| **Gap** | `admin/routes/page.tsx` | Route master UI — doesn't expose `Route.ts`'s new USD fields | Not started |
| **Gap** | `components/admin/ReportView.tsx` | Reports/Excel export — no currency split logic | Not started |
| **Gap** | `app/(admin)/admin/finance/page.tsx` | "Total Revenue" tile is hardcoded mock string `"K 12.4M"` (pre-existing, unrelated to this CR) | Not started / out of scope |
| **Gap** | — | `International Trip = Yes/No` field | Not started, doesn't exist on either branch |

---

# Important Code Map

* `logistic-backend/src/models/Booking.ts` — booking document: `finalAmount`, `advancePaid`, `currency` (dev2 only).
* `logistic-backend/src/models/Payment.ts` — payment document: `amount`, `currency` (dev2 only), `allocations[]`.
* `logistic-backend/src/models/Settlement.ts` — per-trip accounting: `fuelDetails.legs[]`, `extraLegs[]`, `expenses[]`, `financials.{cashAllocation, fuelTotal, councilLevy, tollAmount, assume*}`.
* `logistic-backend/src/models/Route.ts` — route master: base toll/allocation/council-levy figures, quote source for settlement `assume*` fields.
* `logistic-backend/src/lib/paymentAllocation.ts::planAllocation()` — pure FIFO allocation function, currency-matched (dev2 only).
* `logistic-backend/src/lib/settlementDiff.ts::diffFinancials()` / `describeSettlementChange()` — settlement audit-trail text generation.
* `logistic-backend/src/controllers/ledgerController.ts::getCompanyLedger/getClientLedger/addCompanyPayment/addClientPayment/deletePayment` — ledger read + payment write/reverse endpoints.
* `logistic-backend/src/controllers/bookingController.ts::updateBookingStatus` — deal finalization endpoint (sets `finalAmount`, `advancePaid`, `currency` on dev2).
* `logistic-backend/src/controllers/settlementController.ts::createOrUpdateSettlement` — settlement save endpoint.
* `logistic-backend/src/controllers/tollController.ts::runTollMatching` — auto-matches eToll entries to trips by truck number + time window.
* `logistic-backend/src/controllers/assignmentController.ts::updateAssignment` — truck/driver reassignment; relevant to `CR-BD-001` (mid-trip lock logic).
* `logistic/lib/currency.ts` — shared currency formatting utility (dev2 only).
* `logistic/components/admin/FinalizeDealDrawer.tsx` — deal finalization modal (currency toggle on dev2).
* `logistic/components/admin/LedgerDrawer.tsx` — admin-side client/company ledger drawer.
* `logistic/components/admin/InvoiceDrawer.tsx` — invoice render/print.
* `logistic/components/admin/ReportView.tsx` — reports + Excel export (no currency logic yet).
* `logistic/app/(admin)/admin/accountant/[id]/page.tsx` — settlement entry screen (fuel/toll/allowance/expenses); **no currency support**.
* `logistic/app/(admin)/admin/routes/page.tsx` — route master UI; **doesn't expose USD fields**.
* `logistic/middleware.ts` — role-cookie route gate (`admin`/`client`).
* `logistic-backend/docs/CR-BD-001-mid-trip-truck-breakdown.md` — separate pending CR, proposal only.

---

# Testing & Verification

* **Test:** Backend currency-related unit tests (`paymentAllocation.test.ts`, `settlementDiff.test.ts`) on `dev2`.
  **Method:** `node --import tsx --test test/paymentAllocation.test.ts test/settlementDiff.test.ts`
  **Environment:** Local checkout, `logistic-backend` @ `dev2`.
  **Result:** **PASS** — 28/28 tests.
  **Evidence:** Command output captured in-session (not saved to a file).
* **Test:** Live-branch currency-code absence check (`main`/`master`).
  **Method:** `git grep -i` for `currency|USD|ZMW|international` across `src`/`app`/`components`/`test`/`docs`, manual review of hits.
  **Environment:** Local checkout, both repos.
  **Result:** **PASS** (confirms absence, as expected) — only false positive was a substring match (`previousDriverId` contains "usD"), no real currency code on live.
* **Test:** Accountant/route-master/reports UI currency-awareness check.
  **Method:** `git grep` for `currency|USD|Usd` inside `admin/accountant/*`, `admin/routes/page.tsx`, `ReportView.tsx`.
  **Environment:** `dev2` checkout, frontend.
  **Result:** **PASS** (confirms absence) — zero matches, confirming these surfaces are unbuilt gaps.
* **Test:** Frontend build/lint/typecheck of dev2 currency changes.
  **Method:** Not run.
  **Result:** **NOT TESTED.**
* **Test:** End-to-end mixed-currency trip scenario (UI click-through).
  **Method:** Not run — no dev server started this session.
  **Result:** **NOT TESTED.**
* **Test:** Production deployment / staging verification.
  **Result:** **NOT TESTED / NOT APPLICABLE** — no code deployed, dev2 not merged.

---

# Production / Deployment State

* **What is deployed:** `UNKNOWN` — this session did not query the running production system. Assume `main`/`master` (no currency support) is what's live unless told otherwise.
* **Branch:** Live = `main` (backend) / `master` (frontend). Dev = `dev2` (both repos), 1 commit ahead each, not merged.
* **Commit(s):** Backend `dev2` tip vs `main`: 1 commit, message `"update"`, 2026-09-08. Frontend `dev2` tip vs `master`: 1 commit, message `"update"`.
* **Server/environment:** PM2, ports 6006 (backend, `fleet-backend`) / 6007 (frontend, `fleet-frontend`). Host/infra details: `UNKNOWN`.
* **Deployment method:** `UNKNOWN` exact pipeline (no CI config inspected this session) — PM2 `ecosystem.config.cjs` present in both repos, implies manual or scripted PM2 deploy.
* **Services:** Express API (backend), Next.js SSR app (frontend), MongoDB, presumably S3/SES for storage/email (deps present, usage not audited).
* **Current production status:** `UNKNOWN` — not checked.
* **Known production limitations:** No currency support of any kind on live today — every money figure is implicitly Kwacha.
* **Anything that MUST NOT be changed casually:** `main`/`master` branches (live baseline) — do not merge `dev2` without addressing the gaps in this doc (accountant UI, reports, International Trip field). Settlement schema design (parallel `...Usd` fields vs `{amount, currency}` tag) — a decision is pending (see below); changing schema shape after data exists would need a migration.

---

# Known Issues / Pending Work

* **Issue:** No `International Trip` field exists.
  **Current behavior:** No such concept anywhere.
  **Expected behavior:** Per client requirement, a Yes/No flag on the booking.
  **Relevant files:** `logistic-backend/src/models/Booking.ts`, `logistic/components/admin/FinalizeDealDrawer.tsx` (or wherever a booking is created).
  **Likely cause:** Not yet requested/built.
  **Next action:** Design + implement once client confirms scope (see Business Questions below).

* **Issue:** Settlement-level USD fields (`Settlement.ts`) are schema-only — no accountant UI, no full backend save path.
  **Current behavior:** Only `fuelRateUsd` is actually persisted on settlement save; all other `...Usd` fields are dead.
  **Expected behavior:** Accountant should be able to enter fuel/toll/allowance/expense figures in either currency per trip.
  **Relevant files:** `logistic-backend/src/models/Settlement.ts`, `src/controllers/settlementController.ts`, `logistic/app/(admin)/admin/accountant/[id]/page.tsx`.
  **Likely cause:** Dev branch work stopped at schema-level for this layer.
  **Next action:** Decide schema shape (tag vs parallel-field, see Decisions below) before building the UI.

* **Issue:** Reports/Excel export (`ReportView.tsx`) has no currency logic.
  **Current behavior:** Would sum ZMW+USD figures blindly if fed mixed-currency data — violates the "never blindly combine" requirement.
  **Expected behavior:** Per-currency totals, never combined.
  **Relevant files:** `logistic/components/admin/ReportView.tsx`.
  **Likely cause:** Not yet started.
  **Next action:** Rework after settlement schema decision is locked, since reports read settlement/booking data.

* **Issue:** Route master UI doesn't expose `Route.ts`'s new USD fields.
  **Current behavior:** Fields exist in schema, unreachable from any form.
  **Relevant files:** `logistic/app/(admin)/admin/routes/page.tsx`, `logistic-backend/src/models/Route.ts`.
  **Next action:** Wire once schema decision is locked.

* **Issue:** Finance dashboard "Total Revenue" tile is hardcoded mock data.
  **Current behavior:** Static string `"K 12.4M"`, not computed.
  **Relevant files:** `logistic/app/(admin)/admin/finance/page.tsx`.
  **Likely cause:** Pre-existing placeholder, unrelated to currency CR.
  **Next action:** Out of scope unless client explicitly asks for it as part of this CR — flag, don't fix silently.

* **Issue:** `CR-BD-001` (mid-trip truck breakdown) is an unimplemented proposal with 13 open client questions in its own doc, touching the same `Settlement` array fields (`fuelDetails.legs[]`, `extraLegs[]`) this CR would touch.
  **Relevant files:** `logistic-backend/docs/CR-BD-001-mid-trip-truck-breakdown.md`.
  **Next action:** Get client answers before bundling; recommend designing the shared array-item schema (currency + future `truckNumber`) together regardless of bundling decision.

---

# Decisions & Constraints

* **No automatic FX conversion** — confirmed by design intent in dev2 code comments (`paymentAllocation.ts`, `settlementDiff.ts`): no exchange rate is stored anywhere, and this is deliberate, not an oversight. Must not introduce one without explicit client sign-off.
* **ZMW and USD must never be combined into one sum** — dev2 already follows this at booking/payment/ledger layer (separate totals per currency, `totalsByCurrency()`). Must extend the same rule to settlement and reports layers, not silently sum.
* **Existing ZMW data must keep working** — all dev2 schema additions are optional fields defaulting to `"ZMW"`/`0`, backward-compatible by construction. Preserve this pattern for any new field.
* **Open decision (not yet made):** Settlement array items (`fuelDetails.legs[]`, `extraLegs[]`, `expenses[]`) currently use dev2's parallel-sibling-field pattern (`amount` + `amountUsd`). Recommended (not decided) to switch to single `{amount, currency}` tag per item to match `Booking`/`Payment` pattern and to sit cleanly next to `CR-BD-001`'s planned `truckNumber` per item. **No code changed either way — pure recommendation pending client/dev lead decision.**
* **Do not implement CR-CUR-002 code yet** — explicit instruction from the requester this session; this doc and the prior analysis are report-only deliverables.

---

# Important Warnings

* Merging `dev2` → `main`/`master` as-is would ship **partial** currency support: booking/payment/ledger/invoice would work, but settlement entry (fuel/toll/allowance/expenses) and reports would remain silently ZMW-only or, worse, could blindly sum ZMW+USD once the `...Usd` fields start getting populated by some other path — check this before merging.
* `Settlement.ts` schema shape is not finalized — do not build the accountant UI against the current parallel-field shape without confirming the tag-vs-parallel-field decision, or it will need a rebuild.
* Two unrelated git repos live under one parent folder that is itself not a git repo — always confirm which repo (`logistic` vs `logistic-backend`) and which branch before any git operation.
* `CR-BD-001` doc explicitly warns: never move `driver.assignedTruck` to effect a truck swap (breaks a unique dedupe key) — irrelevant to currency work directly, but noted here since both CRs touch adjacent code and a future session may conflate them.
* No `.env` or secrets were located/read this session — if a future session needs DB/API credentials, they must be sourced from the deployment environment, not the repo.

---

# Next Recommended Action

1. Get client/business answers to the open questions below (especially: trip-level vs line-item revenue currency, settlement schema shape).
2. Lock the `Settlement` schema decision (tag vs parallel-field) — do this once, before touching accountant UI or `CR-BD-001`.
3. Build accountant/settlement-entry UI + full backend save path for fuel/toll/allowance/expenses currency (largest remaining gap).
4. Add `International Trip` field (schema + UI).
5. Rework `ReportView.tsx` for per-currency totals.
6. Wire route-master UI to `Route.ts` USD fields.
7. Merge `dev2` → live only after 3–6 are done and end-to-end tested with a mixed-currency trip.

---

# AI HANDOFF SUMMARY

* **Objective:** Add multi-currency (ZMW/USD) support + `International Trip` flag to a Zambia-based logistics platform (CR-CUR-002), without breaking existing ZMW data, without auto-FX, without ever blindly combining currencies, and compatible with a separate pending CR (`CR-BD-001`, truck breakdown).
* **Completed:** Read-only delta analysis (this session) comparing live baseline (`main`/`master`) vs feature branch (`dev2`) vs client requirement, across both repos. Report delivered in chat. No code implementation has occurred yet for CR-CUR-002.
* **In progress:** Nothing actively in progress — analysis phase closed, implementation phase not started.
* **Blocked:** Implementation blocked on: (a) client answers to open business questions, (b) Settlement schema shape decision.
* **Next action:** Lock Settlement schema decision, then build accountant-UI currency support (biggest gap), then International Trip field, then reports rework, then route-master UI, then merge `dev2`.
* **Critical files:** `logistic-backend/src/models/{Booking,Payment,Settlement,Route}.ts`, `logistic-backend/src/lib/{paymentAllocation,settlementDiff}.ts`, `logistic-backend/src/controllers/{ledgerController,settlementController,bookingController}.ts`, `logistic/lib/currency.ts`, `logistic/app/(admin)/admin/accountant/[id]/page.tsx` (unbuilt), `logistic/components/admin/ReportView.tsx` (unbuilt), `logistic-backend/docs/CR-BD-001-mid-trip-truck-breakdown.md`.
* **Critical constraints:** No auto-FX, ever. Never sum ZMW+USD. ZMW-only historical data must keep rendering correctly (all new fields optional/defaulted). Do not merge `dev2` until settlement/reports gaps are closed.
