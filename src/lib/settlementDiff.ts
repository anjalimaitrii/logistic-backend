/**
 * What changed on a settlement, in words the timeline can carry.
 *
 * The journey timeline is the only place anyone can see WHY a trip's figures
 * moved. Before this, a settlement write logged one line — "approved with N cash
 * allocation" — on every save, so a toll corrected from K0 to K1,200 left no
 * trace at all and a re-save of unchanged figures left a duplicate.
 *
 * Money is Kwacha by default: this fleet runs in Zambia, and the old line said
 * naira. A cross-border trip also pays out in dollars, so each field has a
 * parallel ...Usd sibling. The two are reported side by side and NEVER added —
 * no exchange rate is stored anywhere, and one that moved would rewrite figures
 * that were already settled and signed off.
 */
export type Currency = "ZMW" | "USD";
export type MoneyChange = { label: string; before: number; after: number; currency: Currency };

// Paired so the timeline reads "allowance K5,000 → K4,200, allowance $100 → $150"
// rather than listing every Kwacha field and then every dollar one.
const MONEY_FIELDS: Array<{ key: string; label: string; currency: Currency }> = [
  { key: "cashAllocation", label: "Driver's allowance", currency: "ZMW" },
  { key: "cashAllocationUsd", label: "Driver's allowance", currency: "USD" },
  { key: "councilLevy", label: "Council levy", currency: "ZMW" },
  { key: "councilLevyUsd", label: "Council levy", currency: "USD" },
  { key: "tollAmount", label: "Toll amount", currency: "ZMW" },
  { key: "tollAmountUsd", label: "Toll amount", currency: "USD" },
  { key: "fuelTotal", label: "Fuel total", currency: "ZMW" },
  { key: "fuelTotalUsd", label: "Fuel total", currency: "USD" },
];

const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const money = (n: number, currency: Currency) =>
  `${currency === "USD" ? "$" : "K"}${num(n).toLocaleString()}`;

/** Kwacha-only shorthand, kept for the many places that never see dollars. */
export const kwacha = (n: number) => money(n, "ZMW");

/** Money fields whose value actually moved. Unchanged fields are left out. */
export function diffFinancials(before: any, after: any): MoneyChange[] {
  if (!after) return [];
  const changes: MoneyChange[] = [];
  for (const { key, label, currency } of MONEY_FIELDS) {
    // A field the client did not send is not a change to zero — it is silence.
    // This is also what keeps every Kwacha-only settlement from suddenly logging
    // "$0 → $0" the moment the dollar fields exist.
    if (after[key] === undefined) continue;
    const b = num(before?.[key]);
    const a = num(after[key]);
    if (b !== a) changes.push({ label, before: b, after: a, currency });
  }
  return changes;
}

/**
 * The empty legs, summarised for the timeline. Costing an empty run is the whole
 * point of CR-VL-001, so a leg gaining its distance has to be visible next to the
 * status changes it explains.
 */
export function diffEmptyLegs(before: any[] | undefined, after: any[] | undefined): string[] {
  if (!after) return [];
  const key = (l: any) => `${l?.kind}|${(l?.from || "").trim().toLowerCase()}|${(l?.to || "").trim().toLowerCase()}`;
  const was = new Map((before || []).map((l) => [key(l), num(l?.km)]));
  const lines: string[] = [];

  for (const leg of after) {
    const route = `${leg?.from || "?"} → ${leg?.to || "?"}`;
    const km = num(leg?.km);
    const prior = was.get(key(leg));
    if (prior === undefined) {
      lines.push(`added ${route} (${km} km)`);
    } else if (prior !== km) {
      lines.push(`${route} ${prior} km → ${km} km`);
    }
  }

  const seen = new Set((after || []).map(key));
  for (const leg of before || []) {
    if (!seen.has(key(leg))) lines.push(`removed ${leg?.from || "?"} → ${leg?.to || "?"}`);
  }
  return lines;
}

/** One timeline sentence, or null when a save changed nothing worth recording. */
export function describeSettlementChange(
  changes: MoneyChange[],
  legLines: string[],
  isFirstApproval: boolean
): { title: string; description: string } | null {
  const moneyText = changes
    .map((c) => `${c.label} ${money(c.before, c.currency)} → ${money(c.after, c.currency)}`)
    .join(", ");

  if (isFirstApproval) {
    const figures = changes.length ? moneyText : "no figures entered";
    return {
      title: "Trip Approved",
      description: legLines.length
        ? `Accountant approved the trip — ${figures}. Empty legs: ${legLines.join("; ")}`
        : `Accountant approved the trip — ${figures}`,
    };
  }

  if (!changes.length && !legLines.length) return null;

  const parts = [moneyText, legLines.length ? `Empty legs: ${legLines.join("; ")}` : ""].filter(Boolean);
  return { title: "Settlement Updated", description: parts.join(". ") };
}
