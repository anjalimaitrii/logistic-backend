import type { Tyre } from "./tyreInspection.js";

export type FittedTyre = { position: string; serial: string };

/**
 * The truck's fitted-tyre list, brought in line with what the inspector actually
 * found at the gate.
 *
 * The inspection is the more recent look at the truck: if a serial was corrected
 * there — or a tyre was swapped for a different one in the same place — the
 * compliance record is now stale, and leaving it stale means the two screens
 * disagree about which tyre is on which wheel.
 *
 * Deliberately additive. An inspector who checked four tyres has not testified
 * that the other eighteen are gone, so wheels the inspection never mentioned are
 * left exactly as they were. Removing a tyre stays a job for the compliance
 * drawer, where the whole list is in front of you.
 */
export function mergeFittedTyres(existing: FittedTyre[] | undefined, inspected: Tyre[]): FittedTyre[] {
  const key = (p: string) => p.trim().toLowerCase();
  const out: FittedTyre[] = (existing || []).map((t) => ({
    position: String(t?.position || ""),
    serial: String(t?.serial || ""),
  }));

  for (const t of inspected) {
    // Position is how a tyre is matched to a wheel. A serial with no position
    // cannot be placed, so it stays in the inspection record only.
    if (!t.position?.trim()) continue;

    const at = out.findIndex((f) => key(f.position) === key(t.position));
    if (at === -1) {
      out.push({ position: t.position, serial: t.number });
      continue;
    }
    // A blank serial is "not recorded", not "this wheel is now bare" — it must
    // not wipe a serial the compliance record already holds.
    if (t.number.trim()) out[at] = { position: out[at].position, serial: t.number };
  }

  return out;
}

/** True when the merge actually changed something worth a database write. */
export function fittedTyresChanged(before: FittedTyre[] | undefined, after: FittedTyre[]): boolean {
  const a = before || [];
  if (a.length !== after.length) return true;
  return after.some((t, i) => t.position !== a[i]?.position || t.serial !== (a[i]?.serial || ""));
}
