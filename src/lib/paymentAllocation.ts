/**
 * How a client's payment is spread across their unsettled trips.
 *
 * Oldest invoice first, which is what the ledger has always done — a client
 * paying "some of what I owe" expects it to clear the oldest bill, and the
 * reversal path depends on the distribution being recorded rather than re-derived.
 *
 * The currency match is the part that matters. A payment carries its own
 * currency now: domestic clients pay Kwacha, international ones pay dollars. If
 * allocation ignored that, a dollar payment would settle a Kwacha invoice and
 * both ledgers would be wrong with nothing recording the swap — and no exchange
 * rate exists anywhere in this system to make such a transfer meaningful.
 *
 * A booking saved before the currency field existed has no value and counts as
 * Kwacha, which is what it was.
 *
 * Pure: no database, no writes, so the distribution can be tested on its own.
 * The caller performs the updates and stores `allocations` on the payment.
 */
export type Currency = "ZMW" | "USD";

export interface PayableBooking {
  _id: unknown;
  finalAmount?: number;
  advancePaid?: number;
  currency?: string | null;
}

export interface Allocation {
  bookingId: unknown;
  amount: number;
  /** This allocation clears the invoice, so the caller marks the booking paid. */
  settles: boolean;
}

export interface AllocationPlan {
  allocations: Allocation[];
  /** Money left over: the client has paid ahead, or paid in a currency they owe nothing in. */
  unallocated: number;
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const currencyOf = (b: PayableBooking): Currency => (b.currency === "USD" ? "USD" : "ZMW");

export function planAllocation(
  bookings: PayableBooking[],
  amount: number,
  currency: Currency
): AllocationPlan {
  let remaining = Math.max(0, num(amount));
  const allocations: Allocation[] = [];

  for (const booking of bookings) {
    if (remaining <= 0) break;
    if (currencyOf(booking) !== currency) continue;

    const due = num(booking.finalAmount) - num(booking.advancePaid);
    if (due <= 0) continue; // settled, or never billed

    const applied = Math.min(remaining, due);
    allocations.push({ bookingId: booking._id, amount: applied, settles: applied >= due });
    remaining -= applied;
  }

  return { allocations, unallocated: remaining };
}
