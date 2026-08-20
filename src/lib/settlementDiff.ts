/**
 * What changed on a settlement, in words the timeline can carry.
 *
 * The journey timeline is the only place anyone can see WHY a trip's figures
 * moved. Before this, a settlement write logged one line — "approved with N cash
 * allocation" — on every save, so a toll corrected from K0 to K1,200 left no
 * trace at all and a re-save of unchanged figures left a duplicate.
 *
 * Money is Kwacha: this fleet runs in Zambia, and the old line said naira.
 */
export type MoneyChange = { label: string; before: number; after: number };

const MONEY_FIELDS: Array<{ key: string; label: string }> = [
  { key: "cashAllocation", label: "Driver's allowance" },
  { key: "councilLevy", label: "Council levy" },
  { key: "tollAmount", label: "Toll amount" },
  { key: "fuelTotal", label: "Fuel total" },
];

const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const kwacha = (n: number) => `K${num(n).toLocaleString()}`;

/** Money fields whose value actually moved. Unchanged fields are left out. */
export function diffFinancials(before: any, after: any): MoneyChange[] {
  if (!after) return [];
  const changes: MoneyChange[] = [];
  for (const { key, label } of MONEY_FIELDS) {
    // A field the client did not send is not a change to zero — it is silence.
    if (after[key] === undefined) continue;
    const b = num(before?.[key]);
    const a = num(after[key]);
    if (b !== a) changes.push({ label, before: b, after: a });
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
  money: MoneyChange[],
  legLines: string[],
  isFirstApproval: boolean
): { title: string; description: string } | null {
  const moneyText = money
    .map((c) => `${c.label} ${kwacha(c.before)} → ${kwacha(c.after)}`)
    .join(", ");

  if (isFirstApproval) {
    const figures = money.length ? moneyText : "no figures entered";
    return {
      title: "Trip Approved",
      description: legLines.length
        ? `Accountant approved the trip — ${figures}. Empty legs: ${legLines.join("; ")}`
        : `Accountant approved the trip — ${figures}`,
    };
  }

  if (!money.length && !legLines.length) return null;

  const parts = [moneyText, legLines.length ? `Empty legs: ${legLines.join("; ")}` : ""].filter(Boolean);
  return { title: "Settlement Updated", description: parts.join(". ") };
}
