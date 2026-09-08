# CR-BD-001 — Mid-trip truck breakdown & replacement unit

**Status:** Analysis / proposal — nothing implemented yet
**Date:** 2026-09-07
**Raised by:** Client
**Scope:** `logistic-backend` + `frontend-logistic` (admin panel), driver app

---

## 1. The problem, as the client put it

> A truck breaks down in the middle of a trip (mechanical failure, accident, tyre, whatever).
> A different truck has to go out and finish that job. How does the system handle it?

---

## 2. Short answer

**It doesn't.** There is no breakdown concept anywhere in the codebase — no trip status
for it, no truck out-of-service state, no record of a second vehicle on the same trip.

The nearest existing thing is "change the fleet unit on a job"
(`updateAssignment`, `src/controllers/assignmentController.ts:104`). That path was built
for **before the trip starts**, and it is wrong for a mid-trip breakdown in three ways:

1. **It is locked mid-trip.** A driver swap is refused once the settlement is `Approved`
   (`assignmentController.ts:139` → `lib/reassignment.ts:isAssignmentLocked`). Every
   running trip *is* approved — the driver app only shows approved trips
   (`driverAppController.ts:getDriverTrips`) and `promoteNextForDriver` refuses to
   activate an unapproved one. So mid-trip driver replacement returns `409`.
2. **A truck-only change slips through with no controls at all.** The lock and the
   handover logic both sit inside `if (isHandover)`, and `isHandover` is only true when
   the **driver** changes (`assignmentController.ts:130`). Sending just
   `truckId`/`truckNumber` overwrites the assignment as a plain field edit: no approval
   check, no timeline entry, no settlement amendment. *(This is an existing hole,
   independent of this CR.)*
3. **It overwrites, it does not append.** `Assignment` is one document per booking
   (`bookingId` is `unique`) holding exactly one `truckId` + `truckNumber`. After the
   swap the system believes the replacement truck ran the **whole** trip. The first
   truck's half of the job simply stops existing.

---

## 3. What breaks downstream if we just overwrite the truck

Every one of these assumes *one booking = one truck for the whole trip window*:

| Area | Code | What goes wrong |
|---|---|---|
| **Toll matching** | `tollController.ts:142–205` — matches eToll entries by `Assignment.truckNumber` + the trip's `tripStartedAt → tripEndedAt` window | Truck A's toll crossings from the first half can never match again — there is no manual assign endpoint, only the auto-matcher. Those entries sit "unmatched" forever and the trip's `Booking.tollAmount` reads short. **Severity note:** the accountant *types* `financials.tollAmount` on the settlement (seeded from Route Master), so this is a **reconciliation** break, not a direct hit to the P&L. One mitigating detail: the matcher only ever looks at `matchStatus: "unmatched"`, so entries already matched before the swap stay correctly attached. |
| **GPS trip stats** | `app/(admin)/admin/jobs/[id]/page.tsx:302` `fetchGpsStats(booking, assignment.truckNumber)` → Trakzee travel summary | One truck queried for the whole trip window, so the panel shows the replacement truck's figures for the whole job. **Severity note: display only.** Settlement distance comes from typed leg kilometres (`computeLegTotals`), never from `tripStats` — nothing on the accountant screen or in reports reads it. Wrong on screen, not wrong on the invoice. |
| **Truck inspection** | `assignmentController.ts:302` resolves the inspected truck from the assignment | Tyre serials/condition recorded at the end of the trip get stamped onto **truck B's** compliance record even if the inspection describes truck A. |
| **Pending inspections** | `assignmentController.ts:254` queries `Assignment.find({ truckNumber })` | Truck A drops out of the query — its uninspected trip is invisible. |
| **Client-facing fleet** | `lib/fleetSummary.ts:fleetSummaryFor` | Client's trip view and invoice name only the current truck. It reads as if truck B did everything. |
| **Damage reporting** | `components/admin/ReportView.tsx:302–356` — builds a `bookingId → truckNumber` map from assignments | A damage recorded on truck A is printed against truck B in the damages report and its Excel export. |
| **Settlement / fuel** | `models/Settlement.ts` — `fuelDetails.legs[]` and `extraLegs[]` | No `truckNumber` on a leg. Fuel cannot be split between the two units. Mileage is one global loaded/unloaded rate (`models/Mileage.ts`), not per truck. |
| **Driver allowance** | `financials.cashAllocation` — a single number | Two drivers, one allowance figure. No way to say who gets what. |
| **Empty-leg machinery** | `TripGap`, `Booking.lastPoint`, `services/tripContinuity.ts` | Built around *consecutive trips of the same truck*. A relief truck driving empty to a breakdown point is a real, costed empty run with no place to live. |
| **Driver identity** | `models/Driver.ts:71–86` — `dedupeKey = name + assignedTruck`, unique index, rewritten by hooks | If a replacement is done by moving `driver.assignedTruck`, the driver's unique key changes. The Trakzee import runs on page load and keys on `dedupeKey` → risk of a duplicate driver record. **Never move `assignedTruck` for a trip-level swap.** |
| **Truck out-of-service** | `models/Truck.ts:79` `status` | Dead field for this purpose. The trucks page now derives status from GPS (Running/Stopped/Idle) and actively **erases** the old `"Maint."` value (`app/(admin)/admin/trucks/page.tsx:151–160`). There is no workshop state to put a broken truck into, and nothing filters an unavailable truck out of assignment. |
| **Assignment drawer** | `components/admin/OperationAssignmentDrawer.tsx:113` | Truck is *derived* from `driver.assignedTruck`. Ops cannot even pick "same driver, different truck" from the UI — there is no truck picker. |
| **Trip stepper** | `app/(admin)/admin/jobs/[id]/page.tsx` stepper, `lib/tripStatus.ts` | Lifecycle is forward-only (`started → arrived_n → loading_n → departed_n → reached_n → offloading_n → returning → completed`). There is no hold/pause state. A trip standing dead at `departed_1` has no representation. |
| **Night alerts** | `services/nightAlertService.ts` | A disabled truck sitting still, or being towed at night, will trip alerts. Should be suppressed while out of service. |

---

## 4. Design decision: one job, many vehicle legs

Two ways to model it:

**Option A — split into two bookings.** Truncate trip 1 at the breakdown point, raise a
new booking for the rest. Reuses the existing `TripGap` / settlement machinery.
*Rejected:* the client booked **one** job. Two `tripId`s, two invoices, split DOs and
damages, and a partial delivery on record that never happened.

**Option B — one booking, a list of vehicle legs (recommended).** The job, the `tripId`,
the client view and the invoice all stay single. Internally the trip carries an ordered
list of *which unit was carrying the load between which two times*. Costing, tolls and
GPS all read that list instead of a single `truckNumber`.

`Assignment.truckId` / `truckNumber` / `driverId` keep pointing at the **currently
carrying** unit — so live tracking, the driver app, `fleetSummaryFor` and every existing
consumer keep working unchanged with a swapped-in unit. The list is additive history.

---

## 4b. Minimum-change route — "replace unit", not a breakdown lifecycle

The client asked for the smallest change that does not disturb the existing workflow.
This is that version. It is Option B's *idea* (append, never overwrite) with everything
optional stripped out. It does **not** introduce a hold state, a resume, relief/recovery
leg kinds, or an allowance split.

### What is ruled out first

| Approach | Verdict |
|---|---|
| **Do nothing — use "Change fleet unit" as-is** | Not viable at zero cost. Driver change is refused mid-trip (`409`), the drawer has no truck picker, and a truck-only change is a silent overwrite. "Zero dev" here means the records are simply wrong afterwards. |
| **Reuse the queue/retarget path** (`acquireBookingForDriver`) | Wrong semantics. That path is for handing a *new job* to a driver finishing an old one: it writes `lastPoint`, creates a `TripGap`, and flips the running trip to `repositioning`. Pointing it at a rescue would invent an empty leg that never happened and block approval on it. |
| **Split into two bookings** | Two `tripId`s, two invoices, a partial delivery on record. Rejected in §4. |
| **Full CR (§5–§7)** | Correct, but more than the client asked for. Keep as the phase-2/3 target. |

### The minimum build

**Backend — five edits, no new collection, no migration**

1. `models/Assignment.ts` — add `unitHistory[]`, default `[]`:
   `{ truckId, truckNumber, driverId, driverName, from, to, reason, note }`.
   Additive; existing documents read back as `[]`.
2. `controllers/assignmentController.ts` → `updateAssignment`
   - treat a **truck** change as a unit change, not a field edit (today only a driver
     change counts — `:130`);
   - if the trip has started, **require** `reason` in the body; without it, `400`. This
     is what closes the silent-overwrite hole;
   - with `reason`, allow the change past `isAssignmentLocked` (§2.1) but push an
     `amendments[]` row onto the settlement — the array already exists, no schema change —
     and leave the status `Approved` (un-approving would empty the driver's app mid-trip);
   - push the outgoing unit onto `unitHistory` with `to = now`
     (`from` = previous entry's `to`, else `booking.tripStartedAt`);
   - push a `timeline` entry on the booking and an `activityLog` entry on both trucks —
     both arrays already exist;
   - **guard:** if the incoming driver is not `available`, refuse. Otherwise
     `acquireBookingForDriver` will *queue* the rescue behind their running trip and
     retarget it — the exact wrong outcome.
3. `controllers/tollController.ts` → `runTollMatching` — build the plate→window index from
   `unitHistory` entries (each with its own `from`/`to`) as well as the current plate.
   ~15 lines, and it is what stops toll entries being orphaned.
4. `controllers/assignmentController.ts` → `markTruckInspected` — accept an explicit
   `truckId` in the body, falling back to today's behaviour. ~3 lines. Without it, the
   broken truck's tyre serials are written onto the replacement's compliance record.
5. `controllers/assignmentController.ts` → `getPendingInspections` — also match
   `unitHistory.truckNumber`, so the broken truck's trip stays in the queue. ~3 lines.

**Out of service, without a new field:** set `Truck.health = "Out of Service"` and push an
`activityLog` entry. Both fields exist today, and unlike `Truck.status` neither is
overwritten by the GPS sync on the trucks screen.

**Frontend — three edits**

1. Job detail: a **Replace truck** action, shown only while a trip is running. Small modal:
   reason, note, where it happened, and the incoming unit. Calls the existing PATCH.
2. Assignment drawer: a truck selector independent of `driver.assignedTruck`
   (`OperationAssignmentDrawer.tsx:113`), excluding trucks marked out of service.
3. *(Optional)* GPS panel: query per plate from `unitHistory` + current, show as rows.
   Deferrable — this panel is display-only.

**Never do:** change `driver.assignedTruck` to effect the swap. It rewrites the driver's
unique `dedupeKey` and the Trakzee import can then create a duplicate person
(`models/Driver.ts:71–86`). The trip's truck belongs to the assignment.

### What the minimum version deliberately leaves manual

| Not built | Workaround with today's screens |
|---|---|
| Trip hold / resume | The trip stays on its last route step; the breakdown is a timeline entry. Nothing on the board says "on hold". |
| Relief leg (replacement truck's empty run out) | The accountant adds it as an `extraLegs` leg of kind `transit` — that kind already exists and `gapId` is optional, so it can be hand-entered today. |
| Recovery / towing | An `expenses[]` line. |
| Second driver's allowance | An `expenses[]` line. `financials.cashAllocation` stays one figure. |
| Per-truck fuel | Name the plate in the leg's `from`/`to` label. |
| Client sees the change | Nothing — `fleetSummaryFor` keeps showing the current unit only. |

### Rough sizing

Backend ≈ 1.5–2.5 days, frontend ≈ 1.5–2 days, plus testing. Estimate, not a quote.
The four backend edits after the schema field are each under ~20 lines; the cost is in the
modal, the truck picker and regression-testing the assignment paths.

---

## 5. Proposed data model

### 5.1 `Assignment.vehicleLegs[]` (new)

```ts
vehicleLegs: [{
  sequence:      Number,      // 1, 2, 3…
  truckId:       ObjectId,
  truckNumber:   String,      // snapshot, same reason the assignment snapshots it today
  trailerNumber: String,      // a horse swap may keep the same trailer — see §8 Q2
  driverId:      ObjectId,
  driverName:    String,
  from:          Date,        // when this unit picked the load up
  to:            Date | null, // null = currently carrying
  handoverFrom:  String,      // city/label where it took over ("" for the first leg)
  reason:        "initial" | "breakdown" | "accident" | "compliance" | "other",
  startOdometer: String,
  endOdometer:   String,
}]
```

The first leg is written when the assignment is created, so **every** trip has one and
nothing has to special-case "no legs".

### 5.2 `Booking.breakdown` (new, mirrors the existing `lastPoint` pattern)

```ts
breakdown: {
  status:            "open" | "resolved",
  reportedAt:        Date,
  reportedBy:        String,
  reason:            String,          // engine / tyre / accident / electrical …
  notes:             String,
  atLabel:           String,          // nearest town — same "city is the identity" rule as gapDetection
  atCoords:          { lat, lng },    // from getFreshVehiclePosition at report time
  tripStatusAtHold:  String,          // e.g. "departed_2" — the step to resume from
  cargoTransferred:  Boolean,
  resolvedAt:        Date,
  downtimeMinutes:   Number,
  attachments:       [{ name, url }], // photos from the roadside
}
```

`tripStatus` is **not** overwritten with `"breakdown"` — it encodes route progress and
that progress must survive the hold. `tripStatusAtHold` is the same trick
`lastPoint.prevTripStatus` already uses (`models/Booking.ts`), so the resume puts the
trip back exactly where it stood instead of guessing.

### 5.3 `Truck.outOfService` (new)

```ts
outOfService: { since: Date, reason: String, bookingId: ObjectId, expectedBack: Date } | null
```

A separate field, **not** `Truck.status` — `status` is GPS-derived now and the trucks
page overwrites it on every load. Anything that offers a truck for assignment must
exclude trucks with `outOfService` set.

### 5.4 Settlement additions

- `fuelDetails.legs[]` and `extraLegs[]` each gain `truckNumber` — so the accountant can
  see which unit burned what, and so per-truck fuel reconciles.
- `extraLegs.kind` enum gains `"relief"` (replacement truck's empty run **to** the
  breakdown point — a real cost of this trip) and `"recovery"` (the dead truck's run/tow
  back to the yard or workshop).
- `financials.allocations[]` — `{ driverId, driverName, amount }` — so a trip run by two
  drivers can pay two drivers. `cashAllocation` stays as the total.
- Every breakdown/replacement writes an `amendments[]` row, same as `retargetRunningTrip`
  already does.

### 5.5 New driver status

`Driver.driverStatus` gains `"breakdown"` — on a trip, holding cargo, **not** assignable.
Optionally `"stranded"` if the outgoing driver stays with the dead truck (see §8 Q4).

---

## 6. Proposed flow

### Step 1 — Ops reports the breakdown
`POST /api/bookings/:id/breakdown`

Captures reason, notes, photos, odometer. Location is taken live from Trakzee
(`getFreshVehiclePosition`, the same source start/complete already use) with a manual
override, because a truck with a dead battery may have a stale GPS fix.

Effects:
- `Booking.breakdown = { status: "open", tripStatusAtHold: <current tripStatus>, … }`
- current `vehicleLeg.to = now`
- `Driver.driverStatus = "breakdown"`
- `Truck.outOfService = { since: now, reason, bookingId }`
- stepper locked (no forward step until resolved), timeline entry, admin notification
- night/idle alerts suppressed for that truck

### Step 2 — Ops resolves it, one of three ways
`POST /api/bookings/:id/breakdown/resolve`

| Resolution | What happens |
|---|---|
| **`repaired`** — fixed roadside, same truck continues | No new leg. `breakdown.status = "resolved"`, `tripStatus` restored from `tripStatusAtHold`, truck back in service, downtime recorded. |
| **`replaced`** — new unit takes the load | New `vehicleLeg` opened; `Assignment` truck/driver fields repointed to the new unit; outgoing driver released; dead truck stays out of service. |
| **`aborted`** — job cannot continue | Out of scope for this CR; flag it and ask the client (see §8 Q9). |

For `replaced`, the request carries the incoming `truckId` + `driverId`, the handover
label, and the relief-run distance.

Then:
- Outgoing driver → `available` + `needsTruckInspection` (or `stranded`, per §8 Q4).
  Reuses the `releaseBookingFromDriver` logic in `services/assignmentTransfer.ts` —
  including `undoRetarget`, so a trip queued behind this driver does not stay diverted to
  a pickup they will never reach.
- Incoming driver must be `available`. If they are mid-trip, refuse with a clear message
  — stacking a breakdown rescue behind a running trip is a second, separate problem.
- `Booking.breakdown.status = "resolved"`, `tripStatus` restored, timeline entries on
  both the booking and both trucks' `activityLog`.

### Step 3 — Settlement
- Relief run (`relief` extraLeg, unloaded mileage) added automatically from the distance
  ops entered, priced exactly the way `lib/returnLeg.ts:costLeg` prices the return run.
- Recovery/tow recorded — as an `expenses[]` line by default, or a `recovery` extraLeg if
  towed by our own unit.
- Settlement gets an `amendments[]` row and a **re-review flag**. It must **not** be
  flipped back to `Pending`: `getDriverTrips` filters on `status === "Approved"`, so
  un-approving a running trip would empty the driver's app mid-journey. Flag it, keep it
  approved, let the accountant re-approve.

### Step 4 — The dead truck
- Stays `outOfService` until someone clears it. Clearing should require an inspection
  record, so a truck cannot silently come back from a breakdown with nothing written down.
- Downtime (`resolvedAt − reportedAt`) is the number the fleet report actually wants.

---

## 7. Consumers that must be changed (not optional — these are the bugs of §3)

1. **`runTollMatching`** (`tollController.ts:142`) — match on `(vehicleLeg.truckNumber,
   leg.from → leg.to)` instead of `(assignment.truckNumber, trip window)`. Both trucks'
   crossings then land on the one trip.
2. **GPS stats** (`jobs/[id]/page.tsx:302`) — fetch a travel summary per vehicle leg and
   sum. Show a per-truck breakdown in the UI; the total is what feeds distance.
3. **`markTruckInspected`** (`assignmentController.ts:302`) — take the truck from the
   vehicle leg being inspected (or an explicit `truckId`), never from the current
   assignment. Otherwise the dead truck's tyre serials land on the replacement truck.
4. **`getPendingInspections`** (`assignmentController.ts:254`) — query vehicle legs, not
   `Assignment.truckNumber`.
5. **`fleetSummaryFor`** (`lib/fleetSummary.ts`) — return the current unit plus a short
   history, gated on §8 Q6.
6. **`updateAssignment`** (`assignmentController.ts:104`) — close the truck-only hole:
   any truck change on a **started** trip must go through the breakdown endpoint and be
   refused here.
7. **Assignment drawer** (`OperationAssignmentDrawer.tsx`) — needs a truck picker
   independent of `driver.assignedTruck`, filtered to exclude `outOfService` trucks.

---

## 7b. Edge cases

Ordered by how likely they are to be hit.

1. **Incoming driver is not free.** `acquireBookingForDriver` would queue the rescue behind
   their running trip and retarget it, inventing an empty leg. Must be refused outright.
2. **Truck breaks down empty** — on `returning` or `repositioning`, cargo already delivered.
   No replacement is needed at all, only recovery. The flow must not force a unit swap here.
3. **Repaired at the roadside, same truck continues.** The common case, and it has no unit
   swap in it. Needs a way to record the stop and the downtime without changing anything.
4. **Breakdown before the trip starts.** Plain fleet-unit change — the existing path, no
   `reason` required, nothing to append.
5. **Settlement already approved.** Always true mid-trip. Allowed, amended, flagged — but
   left `Approved`, or `getDriverTrips` drops the job out of the driver's app mid-journey.
6. **Toll sheet uploaded before vs after the swap.** The matcher only reads
   `matchStatus: "unmatched"`, so entries matched before the swap stay put. Entries
   uploaded after it are the ones that need the `unitHistory` fix.
7. **The driver already has a queued next trip**, or this trip was already diverted
   (`lastPoint.source === "reassignment"`). Swapping only the truck is safe. Swapping the
   driver runs `releaseBookingFromDriver` → `undoRetarget`, which cancels the diversion —
   correct, but it must be a conscious decision, not a side effect.
8. **Two breakdowns on one trip.** `unitHistory` is an array; nothing special needed.
9. **Replacement truck is already on another job.** Refuse.
10. **Job cancelled after a swap.** `cancelBooking` hard-deletes the assignment, and the
    unit history goes with it. Acceptable, but worth knowing.
11. **Damages recorded after a swap** are printed against the replacement truck in the
    damages report (`ReportView.tsx:302–356`), whatever unit they actually happened on.
12. **Multi-stop trip mid-route** (`offloading_2`, `departed_1`). A unit swap does not touch
    `tripStatus`, so the stepper is unaffected.

---

## 8. Open questions for the client

These change the design, so they are worth asking before any code is written.

1. **Whose truck is the replacement?** Own fleet, or a hired/market vehicle? A hired
   truck has no `Truck` record, no GPS on Trakzee, no eToll account — that is a
   materially different (and bigger) build.
2. **Horse or trailer?** A rig here is two registrations (`Truck.truckId` +
   `Truck.trailerNumber`). If only the **horse** fails, the loaded trailer can be hooked
   to another horse and the cargo is never touched — no transshipment, far simpler and
   far cheaper. If the **trailer** fails, the load must be moved. Which cases do we
   actually see?
3. **Driver:** does the same driver move into the replacement truck, or does a new driver
   come with it?
4. **Does the outgoing driver stay with the dead truck** until recovery, or come back with
   the replacement? (Decides whether we need a `stranded` status and whether that driver
   is assignable.)
5. **Who pays?** Does the client get billed anything extra (delay, transshipment,
   recovery), or does the company absorb it? Does the invoice change at all?
6. **Do we tell the client the truck changed?** Recommended: show the new truck number and
   a neutral timeline line ("Vehicle changed at Kabwe"), never the reason. Needs a yes/no.
7. **Driver allowance split** when two drivers run one trip — by distance, by leg, or a
   flat rule?
8. **Toll:** both trucks' crossings belong to this one trip and this one client invoice —
   confirm. (Assumed yes.)
9. **Can a trip be aborted at breakdown** — cargo returned or delivered short? If yes,
   that is a separate CR (partial delivery, credit note).
10. **Repair / downtime tracking:** does the client want breakdown frequency and downtime
    per truck in the reports module?
11. **Is a timeline entry enough, or must the board show the trip "on hold"?**
    This one question is the whole difference between §4b (minimum) and §5–§7 (full CR).
12. **How often does this actually happen?** Once a quarter and the manual workarounds in
    §4b are fine forever. Weekly and phase 2 pays for itself immediately.
13. **Is the truck usually replaced from the same depot, or does a unit divert from another
    job?** The second case means the rescue truck's own job is disrupted too — a second,
    larger problem this CR does not cover.

---

## 9. Suggested phasing

**Phase 1 — make it possible and correct on the board**
`vehicleLegs`, `Booking.breakdown`, `Truck.outOfService`, report/resolve endpoints,
stepper hold + resume, timeline, notifications, truck picker in the drawer, close the
truck-only hole in `updateAssignment`.
→ After this the situation is at least *representable* and nothing is silently overwritten.

**Phase 2 — make the money right**
Toll matching per leg, GPS stats per leg, `truckNumber` on fuel legs, `relief` /
`recovery` legs, allowance split, settlement amendment + re-review flag.

**Phase 3 — the edges**
Cargo transfer record (quantity, condition, photos, both drivers) — this is where damage
and shortage claims come from. Inspection routed to the right truck, client-facing
messaging, downtime analytics, alert suppression.

Phase 1 is the one that stops data being destroyed. Phase 2 is the one the accountant
will ask for the first time it happens for real.
