/**
 * Identity for a user-added country, province or city.
 *
 * The dropdowns ship with a fixed list, and anything an operator types that is
 * not on it is saved so the next person finds it there. That only works if the
 * store knows when two entries are the same place: "Ndola", "ndola" and
 * " Ndola " are one town, and a list showing all three is worse than no list.
 *
 * So every row carries a key, and the key is what carries the unique index —
 * uniqueness by construction rather than by whoever remembers to check.
 */

export const LOCATION_KINDS = ["country", "state", "city"] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

/**
 * What gets stored and shown. Casing is the operator's, because "Kapiri Mposhi"
 * is how it is written — only stray whitespace is taken out, including the
 * double space a paste from a spreadsheet leaves behind.
 */
export function normalizeLocationName(raw?: string): string {
  return (raw || "").trim().replace(/\s+/g, " ");
}

const fold = (raw?: string) => normalizeLocationName(raw).toLowerCase();

/**
 * A place is its kind plus its full path, so nothing collapses that shouldn't:
 * Masvingo the province and Masvingo the city are different rows, Mwense in
 * Luapula is not Mwense in Northern, and Livingstone in Zambia is not the one
 * in Malawi.
 */
export function locationKey(opts: {
  kind: LocationKind;
  name: string;
  country?: string;
  state?: string;
}): string {
  return [opts.kind, fold(opts.country), fold(opts.state), fold(opts.name)].join("|");
}
