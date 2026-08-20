/**
 * A truck has many tyres, and they do not wear evenly — one can be down to the
 * canvas while the rest are fine. The inspection carried a single tyre number and
 * a single condition, so recording that meant either logging the worst tyre and
 * losing the others, or logging "Fair" and losing which tyre was the problem.
 *
 * Records written before this still hold the flat pair, so both are kept: `tyres`
 * is the truth, and the flat fields are derived from it for anything still
 * reading them.
 */
export type Tyre = { position: string; number: string; condition: string };

/** Worst first — a truck is only as roadworthy as its worst tyre. */
export const TYRE_CONDITIONS = ["Poor — Replace", "Fair", "Good", "Excellent"] as const;

const DEFAULT_CONDITION = "Good";

const rank = (c?: string) => {
  const i = (TYRE_CONDITIONS as readonly string[]).indexOf((c || "").trim());
  // An unrecognised condition must not silently outrank a real "Poor".
  return i === -1 ? TYRE_CONDITIONS.length : i;
};

/**
 * Accepts what the client sent — the new array, or a legacy pair — and returns a
 * clean list. Rows with no number AND no meaningful condition are dropped: an
 * operator who opened a blank row and never filled it did not inspect a tyre.
 */
export function normalizeTyres(input: {
  tyres?: any;
  tyreNumber?: string;
  tyreCondition?: string;
}): Tyre[] {
  const raw: any[] = Array.isArray(input?.tyres)
    ? input.tyres
    : input?.tyreNumber || input?.tyreCondition
      ? [{ number: input.tyreNumber, condition: input.tyreCondition }]
      : [];

  const seen = new Set<string>();
  const out: Tyre[] = [];

  for (const t of raw) {
    const position = String(t?.position ?? "").trim();
    const number = String(t?.number ?? "").trim();
    const condition = String(t?.condition ?? "").trim() || DEFAULT_CONDITION;
    // A row with neither a place on the truck nor a serial is a row the operator
    // opened and never filled.
    if (!position && !number) continue;

    // Identity is the position when there is one: a tyre can be swapped for a
    // different serial in the same place, and the position is what the inspector
    // actually walked round and looked at. Serial-only rows fall back to it.
    const key = (position || number).toLowerCase();
    const at = out.findIndex((x) => (x.position || x.number).toLowerCase() === key);
    if (seen.has(key)) {
      // The same tyre twice is a slip, not two tyres; the later row wins so a
      // correction typed further down the list is the one that sticks.
      out[at] = { position, number, condition };
      continue;
    }
    seen.add(key);
    out.push({ position, number, condition });
  }

  return out;
}

/** The flat `tyreCondition` an older reader expects: the worst one on the truck. */
export function worstTyreCondition(tyres: Tyre[], fallback = DEFAULT_CONDITION): string {
  if (!tyres.length) return fallback;
  return tyres.reduce((worst, t) => (rank(t.condition) < rank(worst.condition) ? t : worst)).condition;
}

/** The flat `tyreNumber` an older reader expects. Positions with no serial on
 *  record would join as empty strings, so they are left out. */
export function joinTyreNumbers(tyres: Tyre[]): string {
  return tyres.map((t) => t.number).filter(Boolean).join(", ");
}
