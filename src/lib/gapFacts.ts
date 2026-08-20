/**
 * An empty leg has two separate things about it:
 *
 *   the FACTS  — where it started, where it ended, how far it was;
 *   the CLAIM  — which of the two adjacent trips pays for it.
 *
 * Only the claim is exclusive. The facts describe one truck making one drive, so
 * both trips should show the same ones. Storing them only inside a settlement
 * meant the other trip's screen asked the accountant for figures they had just
 * typed next door, and nothing ever reconciled the two answers.
 *
 * So whichever screen the accountant fills in, the figures are written back onto
 * the gap and both screens read them from there.
 */
export type GapFacts = { from?: string; to?: string; km?: number; originConfirmed?: boolean };

const clean = (v: unknown) => String(v ?? "").trim();

/**
 * What to write onto a TripGap after a settlement carrying that gap was saved.
 * Returns null when the leg says nothing new — a blank field is the accountant
 * not having answered yet, never an instruction to erase what is on record.
 */
export function factsFromLeg(leg: { from?: string; to?: string; km?: number } | undefined): GapFacts | null {
  if (!leg) return null;

  const facts: GapFacts = {};
  const from = clean(leg.from);
  const to = clean(leg.to);
  const km = Number(leg.km);

  if (from) {
    facts.from = from;
    // A human named the origin, so the "we do not know where the truck is"
    // caveat no longer applies and the other screen may prefill it.
    facts.originConfirmed = true;
  }
  if (to) facts.to = to;
  if (Number.isFinite(km) && km > 0) facts.km = km;

  return Object.keys(facts).length ? facts : null;
}

/** Mongo $set for the facts, using the field names the TripGap schema uses. */
export function factsToUpdate(facts: GapFacts): Record<string, unknown> {
  const $set: Record<string, unknown> = {};
  if (facts.from !== undefined) $set.fromLabel = facts.from;
  if (facts.to !== undefined) $set.toLabel = facts.to;
  if (facts.km !== undefined) $set.km = facts.km;
  if (facts.originConfirmed !== undefined) $set.originConfirmed = facts.originConfirmed;
  return $set;
}
