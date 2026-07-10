import { Request, Response, NextFunction } from "express";
import * as XLSX from "xlsx";
import TollAccount from "../models/TollAccount.js";
import TollEntry from "../models/TollEntry.js";
import Assignment from "../models/Assignment.js";
import Booking from "../models/Booking.js";
import Invoice from "../models/Invoice.js";
import Cash from "../models/Cash.js";
import { sendTollLowBalanceAlert } from "../services/tollAlertService.js";

// Alert admins when the toll wallet drops below this (K).
const LOW_BALANCE_THRESHOLD = 3000;

const getOrCreateAccount = async () => {
  let account = await TollAccount.findOne();
  if (!account) {
    account = await TollAccount.create({ balance: 0, transactions: [] });
  }
  return account;
};

export const getTollAccount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const account = await getOrCreateAccount();
    res.status(200).json(account);
  } catch (error: any) {
    next(error);
  }
};

export const addRecharge = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { amount, description } = req.body;
    if (!amount || Number(amount) <= 0) {
      res.status(400).json({ message: "Valid amount is required" });
      return;
    }

    const account = await getOrCreateAccount();
    account.balance += Number(amount);
    account.transactions.push({
      type: "recharge",
      amount: Number(amount),
      description: description || `Recharge of ₹${amount}`,
      date: new Date()
    });
    await account.save();

    res.status(200).json({ message: "Recharge added successfully", account });
  } catch (error: any) {
    next(error);
  }
};

// Deduct newly-uploaded eToll charges from the wallet. Fires a low-balance
// email only when the balance CROSSES below the threshold (no spam on every
// upload while already low). Returns state for the API response / UI banner.
const deductSheetTotal = async (
  deducted: number,
  newEntries: number
): Promise<{ balance: number; lowBalance: boolean }> => {
  const account = await getOrCreateAccount();
  const prevBalance = account.balance;
  account.balance = Math.max(0, account.balance - deducted);
  account.transactions.push({
    type: "deduction",
    amount: deducted,
    description: `eToll sheet upload — ${newEntries} new toll entr${newEntries === 1 ? "y" : "ies"}`,
    date: new Date()
  });
  await account.save();

  const lowBalance = account.balance < LOW_BALANCE_THRESHOLD;
  if (lowBalance && prevBalance >= LOW_BALANCE_THRESHOLD) {
    sendTollLowBalanceAlert(account.balance, deducted, LOW_BALANCE_THRESHOLD)
      .catch((e) => console.error("[TollAlert] Failed to send low balance email:", e?.message || e));
  }
  return { balance: account.balance, lowBalance };
};

// ─── eToll sheet upload & trip matching ──────────────────────────────────────

// eToll timestamps are Zambia wall-clock time (CAT, UTC+2, no DST)
const TZ_OFFSET_MS = 2 * 3600 * 1000;

// "AJE 8206" / "aje8206" / "AIF 441zm" → "AJE8206" / "AJE8206" / "AIF441ZM"
const normalizeReg = (s: any): string =>
  String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// "AIF441ZM" vs "AIF441": a letter-only suffix (country code) is ignorable;
// a numeric remainder ("AIF4401" vs "AIF440") means a different plate.
const regsMatch = (a: string, b: string): boolean => {
  if (!a || !b) return false;
  if (a === b) return true;
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  return longer.startsWith(shorter) && /^[A-Z]+$/.test(longer.slice(shorter.length));
};

// Sheet dates come as "2026-07-01 06:13:48" strings, but handle Date cells and
// Excel serial numbers too. All are wall-clock CAT → convert to a real instant.
const parseSheetDate = (v: any): Date | null => {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return new Date(Date.UTC(
      v.getFullYear(), v.getMonth(), v.getDate(),
      v.getHours(), v.getMinutes(), v.getSeconds()
    ) - TZ_OFFSET_MS);
  }
  if (typeof v === "number") {
    // Excel serial: days since 1899-12-30
    return new Date(Math.round((v - 25569) * 86400 * 1000) - TZ_OFFSET_MS);
  }
  const m = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - TZ_OFFSET_MS);
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
};

// Match every unmatched TollEntry to a trip: same truck + toll time inside the
// trip's tripStartedAt → tripEndedAt window (open window for trips still running).
// When windows touch (a trip force-completed at assignment time), the newer trip wins.
// Sync each trip's toll total onto its booking — Booking.tollAmount is always
// the sum of that trip's matched eToll entries.
const syncBookingTollTotals = async (): Promise<void> => {
  const totals = await TollEntry.aggregate([
    { $match: { matchStatus: "matched", bookingId: { $ne: null } } },
    { $group: { _id: "$bookingId", total: { $sum: "$charge" } } },
  ]);
  if (totals.length > 0) {
    await Booking.bulkWrite(totals.map((t: any) => ({
      updateOne: {
        filter: { _id: t._id, tollAmount: { $ne: t.total } },
        update: { $set: { tollAmount: t.total } },
      },
    })));
  }
};

const runTollMatching = async (): Promise<{ matched: number; stillUnmatched: number }> => {
  const unmatched = await TollEntry.find({ matchStatus: "unmatched" });
  if (unmatched.length === 0) {
    await syncBookingTollTotals();
    return { matched: 0, stillUnmatched: 0 };
  }

  const assignments = await Assignment.find().select("bookingId truckNumber").lean();
  const bookingIds = assignments.map((a: any) => a.bookingId).filter(Boolean);
  const bookings = await Booking.find({ _id: { $in: bookingIds } })
    .select("tripId tripStartedAt tripEndedAt").lean();
  const bookingById = new Map(bookings.map((b: any) => [String(b._id), b]));

  // truck reg → trip windows
  const windowsByReg: Array<{ reg: string; windows: Array<{ bookingId: any; tripId: string | null; start: Date; end: Date | null }> }> = [];
  const regIndex = new Map<string, number>();
  for (const a of assignments as any[]) {
    const reg = normalizeReg(a.truckNumber);
    const booking = bookingById.get(String(a.bookingId));
    if (!reg || !booking?.tripStartedAt) continue;
    let idx = regIndex.get(reg);
    if (idx === undefined) {
      idx = windowsByReg.length;
      regIndex.set(reg, idx);
      windowsByReg.push({ reg, windows: [] });
    }
    windowsByReg[idx].windows.push({
      bookingId: a.bookingId,
      tripId: booking.tripId || null,
      start: new Date(booking.tripStartedAt),
      end: booking.tripEndedAt ? new Date(booking.tripEndedAt) : null,
    });
  }

  const now = new Date();
  const ops: any[] = [];
  let matched = 0;

  for (const entry of unmatched) {
    let best: { bookingId: any; tripId: string | null; start: Date } | null = null;
    for (const { reg, windows } of windowsByReg) {
      if (!regsMatch(entry.regNo, reg)) continue;
      for (const w of windows) {
        const end = w.end || now;
        if (entry.date >= w.start && entry.date <= end) {
          if (!best || w.start > best.start) best = w;
        }
      }
    }
    if (best) {
      matched++;
      ops.push({
        updateOne: {
          filter: { _id: entry._id },
          update: { $set: { bookingId: best.bookingId, tripId: best.tripId, matchStatus: "matched" } },
        },
      });
    }
  }

  if (ops.length > 0) await TollEntry.bulkWrite(ops);
  await syncBookingTollTotals();

  return { matched, stillUnmatched: unmatched.length - matched };
};

// POST /api/toll/upload — multipart "file" = eToll Zambia .xlsx export
export const uploadTollSheet = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ message: "No file uploaded" });
      return;
    }

    const wb = XLSX.read(file.buffer, { type: "buffer", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) {
      res.status(400).json({ message: "Workbook has no sheets" });
      return;
    }

    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

    // Header row: the one containing "Date" and something like "Reg"
    const headerIdx = rows.findIndex(r =>
      (r || []).some(c => String(c || "").trim().toLowerCase() === "date") &&
      (r || []).some(c => String(c || "").toLowerCase().includes("reg"))
    );
    if (headerIdx === -1) {
      res.status(400).json({ message: "Could not find header row (Date / Reg No. / Charge / Plaza)" });
      return;
    }

    const header = rows[headerIdx].map(c => String(c || "").trim().toLowerCase());
    const col = {
      date: header.findIndex(h => h === "date"),
      reg: header.findIndex(h => h.includes("reg")),
      charge: header.findIndex(h => h.includes("charge") || h.includes("amount")),
      plaza: header.findIndex(h => h.includes("plaza")),
      cls: header.findIndex(h => h.includes("class")),
    };
    if (col.date === -1 || col.reg === -1 || col.charge === -1) {
      res.status(400).json({ message: "Sheet is missing Date / Reg No. / Charge columns" });
      return;
    }

    let totalRows = 0;
    let skipped = 0;
    const ops: any[] = [];
    const opCharges: number[] = []; // charge per op, to total only NEW (upserted) entries
    for (const row of rows.slice(headerIdx + 1)) {
      if (!row || row.every(c => c === null || c === "")) continue;
      totalRows++;
      const date = parseSheetDate(row[col.date]);
      const rawReg = row[col.reg];
      const regNo = normalizeReg(rawReg);
      const charge = Number(row[col.charge]);
      if (!date || !regNo || !isFinite(charge) || charge <= 0) {
        skipped++;
        continue;
      }
      const plaza = String(col.plaza !== -1 ? row[col.plaza] || "" : "").trim();
      const doc = {
        date, regNo,
        rawRegNo: String(rawReg || "").trim(),
        charge, plaza,
        vehicleClass: col.cls !== -1 ? String(row[col.cls] || "").trim() : "",
      };
      // upsert keyed on (regNo, date, plaza) → re-uploading a sheet never double-counts
      ops.push({
        updateOne: {
          filter: { regNo: doc.regNo, date: doc.date, plaza: doc.plaza },
          update: { $setOnInsert: doc },
          upsert: true,
        },
      });
      opCharges.push(charge);
    }

    let inserted = 0;
    let deducted = 0;
    if (ops.length > 0) {
      const result = await TollEntry.bulkWrite(ops, { ordered: false });
      inserted = result.upsertedCount || 0;
      // Only freshly-inserted rows hit the wallet — duplicates were already deducted
      deducted = Object.keys(result.upsertedIds || {})
        .reduce((sum, idx) => sum + (opCharges[Number(idx)] || 0), 0);
    }
    const duplicates = totalRows - skipped - inserted;

    let wallet: { balance: number; lowBalance: boolean } | null = null;
    if (deducted > 0) {
      wallet = await deductSheetTotal(deducted, inserted);
    }

    const matchResult = await runTollMatching();

    res.status(200).json({
      message: `Sheet processed — ${inserted} new toll entries`,
      totalRows,
      inserted,
      duplicates,
      skipped,
      deducted,
      balance: wallet?.balance ?? null,
      lowBalance: wallet?.lowBalance ?? false,
      ...matchResult,
    });
  } catch (error: any) {
    next(error);
  }
};

// GET /api/toll/entries?status=matched|unmatched — re-matches first, then lists
export const getTollEntries = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await runTollMatching();

    const { status } = req.query;
    const filter: any = {};
    if (status === "matched" || status === "unmatched") filter.matchStatus = status;

    const entries = await TollEntry.find(filter).sort({ date: -1 }).limit(1000).lean();

    const [summary] = await TollEntry.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          totalCharge: { $sum: "$charge" },
          matched: { $sum: { $cond: [{ $eq: ["$matchStatus", "matched"] }, 1, 0] } },
          matchedCharge: { $sum: { $cond: [{ $eq: ["$matchStatus", "matched"] }, "$charge", 0] } },
        },
      },
    ]);

    // per-trip totals from matched entries; plazas in toll-crossing order
    const trips = await TollEntry.aggregate([
      { $match: { matchStatus: "matched" } },
      { $sort: { date: 1 } },
      {
        $group: {
          _id: "$bookingId",
          tripId: { $first: "$tripId" },
          regNo: { $first: "$regNo" },
          total: { $sum: "$charge" },
          count: { $sum: 1 },
          firstToll: { $min: "$date" },
          lastToll: { $max: "$date" },
          plazas: { $push: "$plaza" },
        },
      },
      { $sort: { lastToll: -1 } },
    ]);

    // bookingId → completion id (INV-xxx / CASH-xxx) so the UI can show the
    // filed id for completed trips and fall back to TRIP-xxx for running ones.
    const matchedBookingIds = [
      ...new Set([
        ...trips.map((t: any) => t._id).filter(Boolean),
        ...entries.map((e: any) => e.bookingId).filter(Boolean),
      ].map(String)),
    ];
    const completionIds: Record<string, string> = {};
    if (matchedBookingIds.length > 0) {
      const [invs, cashes] = await Promise.all([
        Invoice.find({ bookingId: { $in: matchedBookingIds } }).select("bookingId invoiceId").lean(),
        Cash.find({ bookingId: { $in: matchedBookingIds } }).select("bookingId cashId").lean(),
      ]);
      invs.forEach((r: any) => { completionIds[String(r.bookingId)] = String(r.invoiceId).toUpperCase(); });
      cashes.forEach((r: any) => { completionIds[String(r.bookingId)] = String(r.cashId).toUpperCase(); });
    }

    res.status(200).json({
      entries,
      summary: summary || { total: 0, totalCharge: 0, matched: 0, matchedCharge: 0 },
      trips,
      completionIds,
    });
  } catch (error: any) {
    next(error);
  }
};

// GET /api/toll/booking/:bookingId — toll entries + total for one trip
export const getTollForBooking = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const entries = await TollEntry.find({ bookingId }).sort({ date: 1 }).lean();
    const total = entries.reduce((s, e: any) => s + (e.charge || 0), 0);
    res.status(200).json({ entries, total });
  } catch (error: any) {
    next(error);
  }
};
