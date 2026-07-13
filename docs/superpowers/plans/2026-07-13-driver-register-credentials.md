# Driver Registration (Login Credentials) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin pick an existing unregistered driver from a dropdown and set an email + password for them, creating login credentials for that driver, without touching the existing phone-based driver-app login flow.

**Architecture:** Add an optional `email` field to the `Driver` model. Add a dedicated `PATCH /api/drivers/:id/credentials` endpoint (mirrors `Client`'s `updateClientPassword` — loads the doc and calls `.save()` so the existing bcrypt pre-save hook fires, rather than `findByIdAndUpdate`). Fix the existing `updateDriver` handler so it can never write a raw plaintext password/email. On the frontend, add a `RegisterDriverModal` reachable from a new button on the admin drivers page, dropdown filtered to drivers without an email yet.

**Tech Stack:** Backend: Express 5 + Mongoose 9 + TypeScript (`tsx watch`), bcryptjs. Frontend: Next.js (admin app), plain `fetch` wrapper (`services/api.ts`), Tailwind, framer-motion.

**Note on testing approach:** Neither repo has an automated test suite (no `test` script, no `*.test.ts` files) — the established pattern in this codebase is manual verification via `tsc --noEmit` (type safety) plus manual `curl`/browser exercising of the endpoint. This plan follows that existing pattern rather than introducing a new test framework.

## Global Constraints

- Driver app's phone + password login (`driverAppController.ts`, Flutter `login_screen.dart`) is NOT modified by this plan — confirmed out of scope.
- No welcome/notification email is sent to the driver — confirmed out of scope.
- Password minimum length: 6 characters. Email must match `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- New endpoint requires no new auth middleware — `driverRoutes` is already mounted under `admin` (requireAuth + requireRole("admin")) in `src/routes/index.ts:49`.
- Credential writes must go through `Driver.prototype.save()` (never `findByIdAndUpdate`) so the pre-save bcrypt hook runs.

---

### Task 1: `Driver` model — add `email` field

**Files:**
- Modify: `src/models/Driver.ts`

**Interfaces:**
- Produces: `IDriver.email?: string` — consumed by Task 2 (controller) and implicitly by every later `Driver` read.

- [ ] **Step 1: Add `email` to the interface and schema**

In `src/models/Driver.ts`, update the interface (after `phone: string;`):

```ts
export interface IDriver {
  name: string;
  phone: string;
  email?: string;
  licenseType: string;
  licenseNo: string;
  experience: number;
  assignedTruck?: mongoose.Types.ObjectId;
  status: string; // Active, On Leave, Suspended
  driverStatus: string; // available, on_trip, offloading, returning, under_inspection
  tripQueue: mongoose.Types.ObjectId[];
  needsTruckInspection: boolean;
  password?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

And the schema (after the `phone` field):

```ts
const DriverSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, unique: true, sparse: true },
    licenseType: { type: String, required: true },
    licenseNo: { type: String, required: true, unique: true },
    experience: { type: Number, default: 0 },
    assignedTruck: { type: Schema.Types.ObjectId, ref: "Truck" },
    status: { type: String, default: "Active" },
    driverStatus: { type: String, default: "available" }, // available, on_trip, offloading, returning, under_inspection
    tripQueue: [{ type: Schema.Types.ObjectId, ref: "Booking" }],
    needsTruckInspection: { type: Boolean, default: false },
    password: { type: String },
  },
  { timestamps: true }
);
```

(`sparse: true` is required alongside `unique: true` — otherwise Mongo would try to enforce
uniqueness across every existing driver's missing `email`, i.e. treat all the `null`s as
duplicates of each other, and refuse to build the index.)

- [ ] **Step 2: Type-check**

Run: `cd logistic-backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/models/Driver.ts
git commit -m "feat(driver): add optional email field to Driver model"
```

---

### Task 2: Backend — `registerDriverCredentials` endpoint

**Files:**
- Modify: `src/controllers/driverController.ts`
- Modify: `src/routes/driverRoutes.ts`

**Interfaces:**
- Consumes: `IDriver.email?: string` (Task 1).
- Produces: `POST-body-shaped` route `PATCH /api/drivers/:id/credentials` — consumed by Task 4 (`driverService.registerCredentials`). Success response shape: `{ message: string, driver: <Driver doc without password> }`. Error responses: `{ message: string }` with status 400/404/409.

- [ ] **Step 1: Add the controller function**

In `src/controllers/driverController.ts`, add after `createDriver`:

```ts
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const registerDriverCredentials = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ message: "Email and password are required" });
      return;
    }
    if (!EMAIL_PATTERN.test(email)) {
      res.status(400).json({ message: "Invalid email format" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ message: "Password must be at least 6 characters" });
      return;
    }

    const driver = await Driver.findById(id);
    if (!driver) {
      res.status(404).json({ message: "Driver not found" });
      return;
    }

    if (driver.email) {
      res.status(400).json({ message: "Driver already registered" });
      return;
    }

    const emailTaken = await Driver.findOne({ email, _id: { $ne: id } });
    if (emailTaken) {
      res.status(409).json({ message: "Email already in use" });
      return;
    }

    driver.email = email;
    driver.password = password;
    await driver.save();

    const driverResponse = driver.toObject();
    delete (driverResponse as any).password;

    res.status(200).json({ message: "Driver registered successfully", driver: driverResponse });
  } catch (error: any) {
    next(error);
  }
};
```

- [ ] **Step 2: Register the route**

In `src/routes/driverRoutes.ts`, add the import and route:

```ts
import express from "express";
import {
  createDriver,
  getDrivers,
  getDriverById,
  updateDriver,
  deleteDriver,
  registerDriverCredentials,
} from "../controllers/driverController.js";

const router = express.Router();

router.post("/", createDriver);
router.get("/", getDrivers);
router.get("/:id", getDriverById);
router.patch("/:id", updateDriver);
router.patch("/:id/credentials", registerDriverCredentials);
router.delete("/:id", deleteDriver);

export default router;
```

- [ ] **Step 3: Type-check**

Run: `cd logistic-backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manually verify against a running server**

Terminal A: `cd logistic-backend && npm run dev`

Terminal B — log in as admin (use your local `.env` `ADMIN_EMAIL`/`ADMIN_PASSWORD` values) and capture the token:

```bash
curl -s -X POST http://localhost:5000/api/clients/admin-login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"<ADMIN_EMAIL>","password":"<ADMIN_PASSWORD>"}'
```
Expected: `200` with a `token` field. Export it: `TOKEN=<paste token>`

Fetch a driver id to test with:
```bash
curl -s http://localhost:5000/api/drivers -H "Authorization: Bearer $TOKEN"
```
Pick any `_id` from a driver whose `email` is absent/null: `DRIVER_ID=<paste _id>`

Register credentials:
```bash
curl -s -X PATCH http://localhost:5000/api/drivers/$DRIVER_ID/credentials \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"email":"test.driver@example.com","password":"test123"}'
```
Expected: `200`, body has `driver.email === "test.driver@example.com"` and **no** `password` key.

Retry the same call:
Expected: `400 {"message":"Driver already registered"}`.

Register a *different* unregistered driver with the same email:
Expected: `409 {"message":"Email already in use"}`.

- [ ] **Step 5: Commit**

```bash
git add src/controllers/driverController.ts src/routes/driverRoutes.ts
git commit -m "feat(driver): add PATCH /api/drivers/:id/credentials endpoint"
```

---

### Task 3: Backend — stop `updateDriver` from accepting raw password/email

**Files:**
- Modify: `src/controllers/driverController.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new (behavior-only fix — `updateDriver`'s route/signature are unchanged).

- [ ] **Step 1: Strip `password`/`email` out of the update payload**

In `src/controllers/driverController.ts`, replace `updateDriver`:

```ts
export const updateDriver = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { password, email, ...safeUpdates } = req.body;
    const driver = await Driver.findByIdAndUpdate(req.params.id, safeUpdates, { new: true });
    if (!driver) {
      res.status(404).json({ message: "Driver not found" });
      return;
    }
    res.json(driver);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
```

- [ ] **Step 2: Type-check**

Run: `cd logistic-backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually verify**

With the server from Task 2 still running, try to sneak a password through the general update route:

```bash
curl -s -X PATCH http://localhost:5000/api/drivers/$DRIVER_ID \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"password":"sneaky-plaintext","status":"Active"}'
```
Expected: `200`, `status` updated to `"Active"`, and the driver's real password is untouched
(still the bcrypt hash from Task 2's registration, not `"sneaky-plaintext"`) — confirm by
re-running the credentials registration retry from Task 2 Step 4, which should still say
`"Driver already registered"` (proves `email`/password state wasn't disturbed by this call).

- [ ] **Step 4: Commit**

```bash
git add src/controllers/driverController.ts
git commit -m "fix(driver): prevent updateDriver from writing raw plaintext password/email"
```

---

### Task 4: Frontend — `driverService.registerCredentials`

**Files:**
- Modify: `services/driverService.ts`

**Interfaces:**
- Consumes: `PATCH /api/drivers/:id/credentials` (Task 2).
- Produces: `driverService.registerCredentials(id: string, payload: { email: string; password: string }): Promise<any>` — consumed by Task 5.

- [ ] **Step 1: Add the method**

In `services/driverService.ts`, add after the `DriverPayload` interface:

```ts
export interface DriverCredentialsPayload {
  email: string;
  password: string;
}
```

And add to the `driverService` object (after `create`):

```ts
  registerCredentials: async (id: string, payload: DriverCredentialsPayload) => {
    return await fetchApi(`/api/drivers/${id}/credentials`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
```

- [ ] **Step 2: Type-check**

Run: `cd "logistic and fleet management/frontend-logistic" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add services/driverService.ts
git commit -m "feat(driver): add registerCredentials API method"
```

---

### Task 5: Frontend — `RegisterDriverModal` component

**Files:**
- Create: `components/admin/RegisterDriverModal.tsx`

**Interfaces:**
- Consumes: `driverService.registerCredentials` (Task 4). Props: `{ isOpen: boolean; onClose: () => void; drivers: any[]; onRegistered: () => void }`. `drivers` is the full driver list as already loaded by the drivers page — the modal filters it itself so it stays in sync with whatever the page last fetched.
- Produces: default export `RegisterDriverModal` — consumed by Task 6.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState, useEffect } from "react";
import { X, UserCheck, Mail, Lock } from "lucide-react";
import { driverService } from "@/services/driverService";

interface RegisterDriverModalProps {
  isOpen: boolean;
  onClose: () => void;
  drivers: any[];
  onRegistered: () => void;
}

const inputClass =
  "w-full bg-neutral-50 border border-neutral-100 rounded-xl py-2.5 px-4 text-[13px] font-medium text-slate-900 outline-none focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all";

export default function RegisterDriverModal({ isOpen, onClose, drivers, onRegistered }: RegisterDriverModalProps) {
  const [driverId, setDriverId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const unregisteredDrivers = drivers.filter((d) => !d.email);

  useEffect(() => {
    if (isOpen) {
      setDriverId("");
      setEmail("");
      setPassword("");
      setShowPassword(false);
      setError("");
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!driverId || !email || !password) {
      setError("Select a driver and fill in email and password");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      await driverService.registerCredentials(driverId, { email, password });
      onRegistered();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to register driver");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex justify-end bg-slate-900/30 backdrop-blur-[2px]">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md h-screen shadow-2xl flex flex-col" style={{ animation: "slideInRight 0.3s ease-out" }}>
        {/* Header */}
        <div className="px-7 pt-8 pb-5 border-b border-neutral-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-[17px] font-semibold text-slate-900 tracking-tight">Register Driver</h2>
            <p className="text-[11px] text-neutral-400 mt-0.5">Set login credentials for an existing driver.</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-neutral-50 flex items-center justify-center text-neutral-400 hover:text-slate-900 hover:bg-neutral-100 transition-all cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-7 py-6 flex-1 overflow-y-auto custom-scrollbar space-y-4">
          <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <UserCheck className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h4 className="text-[12px] font-bold text-slate-900">Driver Login</h4>
              <p className="text-[10px] text-neutral-500 mt-0.5">Only drivers without existing credentials are listed.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Driver</label>
            <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className={inputClass}>
              <option value="">Select a driver</option>
              {unregisteredDrivers.map((d) => (
                <option key={d._id} value={d._id}>{d.name} — {d.phone}</option>
              ))}
            </select>
            {unregisteredDrivers.length === 0 && (
              <p className="text-[10px] text-neutral-400 mt-1">All drivers already have credentials.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Email</label>
            <div className="relative">
              <input type="email" placeholder="e.g. driver@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass} pl-10`} />
              <Mail className="w-3.5 h-3.5 text-neutral-300 absolute left-3.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Password</label>
            <div className="relative">
              <input type={showPassword ? "text" : "password"} placeholder="Min. 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} pl-10 pr-12`} />
              <Lock className="w-3.5 h-3.5 text-neutral-300 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-slate-900 transition-colors cursor-pointer">
                {showPassword ? (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-7 py-5 border-t border-neutral-100 flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-neutral-100 text-slate-500 text-[11px] font-bold uppercase tracking-widest hover:bg-neutral-200 transition-all cursor-pointer">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !driverId || !email || !password}
            className={`flex-1 py-3 rounded-xl text-white text-[11px] font-bold uppercase tracking-widest transition-all shadow-lg shadow-slate-200 cursor-pointer ${isSubmitting ? "bg-slate-400 cursor-not-allowed" : "bg-slate-900 hover:brightness-110"} disabled:bg-slate-300 disabled:cursor-not-allowed`}
          >
            {isSubmitting ? "Registering..." : "Register Driver"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd "logistic and fleet management/frontend-logistic" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/admin/RegisterDriverModal.tsx
git commit -m "feat(driver): add RegisterDriverModal component"
```

---

### Task 6: Frontend — wire the button + modal into the drivers page

**Files:**
- Modify: `app/(admin)/admin/drivers/page.tsx`

**Interfaces:**
- Consumes: `RegisterDriverModal` (Task 5), `driverService.getAll` (existing).
- Produces: nothing new for other tasks — this is the final integration point.

- [ ] **Step 1: Import the modal and add state**

At the top of `app/(admin)/admin/drivers/page.tsx`, add the import (after the `CreateDriverModal` import):

```tsx
import RegisterDriverModal from "@/components/admin/RegisterDriverModal";
```

Add state after `const [selectedDriver, setSelectedDriver] = useState<any>(null);`:

```tsx
  const [isRegisterModalOpen, setRegisterModalOpen] = useState(false);
```

- [ ] **Step 2: Add the "Register Driver" button**

Replace the commented-out button block (lines 245-256) with an uncommented "Register Driver"
button (leave the "Add New Driver" button commented out — it's unrelated to this feature):

```tsx
          <button
            onClick={() => setRegisterModalOpen(true)}
            className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-semibold text-[10px] uppercase tracking-widest shadow-xl shadow-slate-200 hover:brightness-110 transition-all w-fit flex items-center gap-2"
          >
            <div className="p-0.5 rounded-md bg-white/20">
              <Plus className="w-3 h-3" />
            </div>
            Register Driver
          </button>
```

- [ ] **Step 3: Render the modal**

After the existing `<CreateDriverModal ... />` block (just before the closing `</AdminLayout>`), add:

```tsx
      <RegisterDriverModal
        isOpen={isRegisterModalOpen}
        onClose={() => setRegisterModalOpen(false)}
        drivers={drivers}
        onRegistered={loadDrivers}
      />
```

- [ ] **Step 4: Type-check**

Run: `cd "logistic and fleet management/frontend-logistic" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manually verify in the browser**

Terminal A: backend running (`npm run dev` in `logistic-backend`).
Terminal B: `cd "logistic and fleet management/frontend-logistic" && npm run dev`, open the admin
drivers page, log in as admin.

1. Click "Register Driver" → modal opens, dropdown lists only drivers without an email.
2. Select a driver, enter an email + password (≥6 chars), submit.
3. Expected: modal closes, driver list refreshes, the just-registered driver no longer appears
   in the dropdown next time the modal is opened.
4. Re-open the modal, try to register a *different* driver with the same email → inline error
   "Email already in use" shown, modal stays open.

- [ ] **Step 6: Commit**

```bash
git add "app/(admin)/admin/drivers/page.tsx"
git commit -m "feat(driver): wire Register Driver button + modal into admin drivers page"
```
