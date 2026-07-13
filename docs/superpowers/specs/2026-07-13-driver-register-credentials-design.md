# Driver Registration (Login Credentials) — Design

## Problem

Drivers exist as `Driver` records (name, phone, license, etc.) but have no way for the
admin to set up app-login credentials for them from the frontend. The Flutter driver
app already supports phone + password login (with a hardcoded fallback password of
`"123456"` when `Driver.password` is unset), but there is no admin UI or backend
endpoint to properly set a driver's login credentials.

This feature adds a "Register Driver" flow: admin picks an existing (unregistered)
driver from a dropdown, sets an email + password for them, and those become the
driver's stored login credentials.

**Explicitly out of scope for this iteration** (confirmed with user): the driver app's
actual login mechanism (phone + password, with the `"123456"` fallback) is **not**
changed here. Switching driver-app login to email-based auth is a separate, later
change spanning `driverAppController.ts` and the Flutter app's login screen. This spec
only covers *creating* the credentials on the backend + admin UI.

No welcome email is sent to the driver (confirmed with user — unlike `Client`, which
does send one via `sendClientWelcomeEmail`).

## Backend

### 1. `Driver` model — add `email` field

File: `src/models/Driver.ts`

- Add `email?: string` to `IDriver` interface and schema: `{ type: String, unique: true, sparse: true }`.
- Optional (existing driver docs have none) — `sparse: true` so the unique index doesn't
  choke on multiple `null`/missing values.
- No change to the existing `password` field or the pre-save bcrypt hook — both already
  work correctly for this use case (hook hashes on `.save()` when `password` is modified).

### 2. New endpoint — `PATCH /api/drivers/:id/credentials`

Files: `src/controllers/driverController.ts`, `src/routes/driverRoutes.ts`

New controller function `registerDriverCredentials`, modeled on
`clientController.updateClientPassword` (uses `.findById` + mutate + `.save()`, **not**
`findByIdAndUpdate`, so the bcrypt pre-save hook actually fires):

```
PATCH /api/drivers/:id/credentials
Body: { email: string, password: string }
```

Behavior:
1. Validate `email` and `password` are present, `email` matches a basic
   `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` shape, and `password.length >= 6` → 400 with a
   specific message if any check fails.
2. `Driver.findById(id)` → 404 "Driver not found" if missing.
3. If `driver.email` is already set → 400 "Driver already registered" (defensive
   check — the frontend dropdown only lists unregistered drivers, but this guards
   against a stale-list race).
4. Check no *other* driver already has this email
   (`Driver.findOne({ email, _id: { $ne: id } })`) → 409 "Email already in use" if found.
5. Set `driver.email = email`, `driver.password = password`, `await driver.save()` —
   pre-save hook hashes the password.
6. Respond 200 with the updated driver, password field stripped
   (`driver.toObject()` + `delete`, same pattern as `createClient`/`loginClient`).

Route registration in `driverRoutes.ts`:
```
router.patch("/:id/credentials", registerDriverCredentials);
```
No extra auth middleware needed — the whole `driverRoutes` router is already mounted
under `admin` (requireAuth + requireRole("admin")) in `src/routes/index.ts:49`.

### 3. Aligned fix — `updateDriver` must not accept raw password/email

File: `src/controllers/driverController.ts`

`updateDriver` currently does `Driver.findByIdAndUpdate(req.params.id, req.body, { new: true })`
directly against the raw request body. This bypasses the pre-save hook — if `password`
(or now `email`) were ever included in a PATCH `/api/drivers/:id` call, the password
would be stored **in plaintext**. This was always a latent bug, but it becomes a real
risk once `email`/`password` are meaningful login credentials.

Fix: destructure `password` and `email` out of `req.body` before passing it to
`findByIdAndUpdate`, so credential changes can only happen via the new dedicated
`/:id/credentials` endpoint. This is a small in-place change to the existing function,
not a new abstraction.

## Frontend

Repo: `frontend-logistic`

### 1. `driverService.ts` — new method

```ts
registerCredentials: (id: string, payload: { email: string; password: string }) =>
  fetchApi(`/api/drivers/${id}/credentials`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }),
```

### 2. `RegisterDriverModal.tsx` (new component, `components/admin/`)

Structure follows the existing clients-page "Security Credentials" drawer pattern
(`app/(admin)/admin/clients/page.tsx:436-562`), adapted to a simpler single-step form
since it only sets two new fields on an *existing* record (no separate profile step):

- Driver dropdown — populated from the drivers already loaded on the page, filtered to
  `!driver.email` (only unregistered drivers are selectable).
- Email input (manual entry).
- Password input with show/hide toggle (manual entry — no auto-generate button, since
  the admin types both values in herself).
- Submit → `driverService.registerCredentials(selectedDriverId, { email, password })`.
- On success: close modal, refresh driver list (so the dropdown drops the now-registered
  driver next time it's opened).
- On error: show the backend's message inline (400 already-registered / 409 email-taken
  / network error), same lightweight pattern as `handleSubmitDriver`'s `alert(...)`.

### 3. `app/(admin)/admin/drivers/page.tsx`

- Add a new "Register Driver" button next to the existing (currently commented-out)
  "Add New Driver" button — separate button, separate modal, since this flow is
  distinct from creating/editing a driver's profile.
- New state: `isRegisterModalOpen`.
- On successful registration, call `loadDrivers()` to refresh the table/dropdown data.

## Error handling summary

| Case | Response |
|---|---|
| Missing email/password in request | 400 |
| Driver id not found | 404 |
| Driver already has an email set | 400 |
| Email already used by another driver | 409 |
| Success | 200, driver object minus password |

## Testing

No existing automated test suite covers `driverController.ts`/`clientController.ts` in
this repo (pattern is manual verification). Verify manually:
1. Register credentials for a driver with a fresh email → 200, driver now has `email`
   set, dropdown no longer offers them.
2. Retry registering the same driver again → 400 "already registered".
3. Register a second driver using an email already in use → 409.
4. Confirm password is stored hashed (not plaintext) by checking it's a bcrypt hash
   shape in the DB, or by later exercising phone-login unaffected.
