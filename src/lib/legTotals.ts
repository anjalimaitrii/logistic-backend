type LegLike = { km?: unknown; liters?: unknown };

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Cargo legs and empty legs are stored in two arrays but describe one journey.
// Every total must span both, or the truck's real distance is under-reported
// everywhere it is shown (ops trip view, Excel export, period reports).
export function computeLegTotals(
  legs: LegLike[] | undefined,
  extraLegs: LegLike[] | undefined
): { totalDistance: number; totalLiters: number } {
  const all = [...(legs || []), ...(extraLegs || [])];
  const distance = all.reduce((s, l) => s + num(l.km), 0);
  const liters = all.reduce((s, l) => s + num(l.liters), 0);
  return {
    totalDistance: Math.round(distance),
    totalLiters: Math.round(liters * 10) / 10,
  };
}
