/**
 * The empty run home, recorded at the moment ops marks the truck as returning.
 *
 * It used to be two steps in two places: mark the return on the jobs list, then
 * go to the settlement and type the distance. Nothing enforced the second half,
 * so a truck could sit in "returning" for days with its empty kilometres costed
 * at nothing. Asking for the distance up front is what makes the return a fact
 * rather than a promise.
 */
export type ExtraLeg = {
  kind: string;
  position: string;
  from: string;
  to: string;
  km: number;
  mileage: number;
  liters: number;
  amount: number;
  addedBy?: string;
  addedAt?: Date;
};

/** Fuel for an unladen leg, rounded the same way the accountant screen rounds it. */
export function costLeg(km: number, mileage: number, fuelRate: number) {
  const safeMileage = mileage > 0 ? mileage : 1;
  const liters = Math.round((km / safeMileage) * 10) / 10;
  return { liters, amount: Math.round(liters * fuelRate) };
}

/**
 * Put the return leg into a settlement's empty legs, replacing any earlier one.
 *
 * Replace, not append: a trip returns to the yard once. Marking the return twice
 * — a correction, a double click — must leave one leg, not two, or the same
 * kilometres get billed as many times as the button is pressed.
 */
export function upsertReturnLeg(
  existing: ExtraLeg[] | undefined,
  leg: { from: string; to: string; km: number; mileage: number; fuelRate: number; addedBy?: string }
): ExtraLeg[] {
  const { liters, amount } = costLeg(leg.km, leg.mileage, leg.fuelRate);

  const returnLeg: ExtraLeg = {
    kind: "return",
    position: "append",
    from: leg.from,
    to: leg.to,
    km: leg.km,
    mileage: leg.mileage,
    liters,
    amount,
    addedBy: leg.addedBy || "ops",
    addedAt: new Date(),
  };

  const rest = (existing || []).filter((e) => e?.kind !== "return" && e?.kind !== "trimmedReturn");
  return [...rest, returnLeg];
}
