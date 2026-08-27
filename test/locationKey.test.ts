import { test } from "node:test";
import assert from "node:assert/strict";
import { locationKey, normalizeLocationName, LOCATION_KINDS } from "../src/lib/locationKey.js";

test("the same place typed three ways is one key", () => {
  const a = locationKey({ kind: "city", name: "Ndola", country: "Zambia", state: "Copperbelt Province" });
  const b = locationKey({ kind: "city", name: "ndola", country: "zambia", state: "copperbelt province" });
  const c = locationKey({ kind: "city", name: "  Ndola  ", country: " Zambia ", state: "Copperbelt Province " });
  assert.equal(a, b);
  assert.equal(a, c);
});

test("inner spacing is collapsed, not just trimmed", () => {
  // "Kapiri  Mposhi" pasted from a sheet must not become a second town.
  assert.equal(
    locationKey({ kind: "city", name: "Kapiri  Mposhi", country: "Zambia" }),
    locationKey({ kind: "city", name: "Kapiri Mposhi", country: "Zambia" })
  );
});

test("the same city name in two provinces stays two places", () => {
  const cb = locationKey({ kind: "city", name: "Mwense", country: "Zambia", state: "Luapula Province" });
  const np = locationKey({ kind: "city", name: "Mwense", country: "Zambia", state: "Northern Province" });
  assert.notEqual(cb, np);
});

test("the same city name in two countries stays two places", () => {
  assert.notEqual(
    locationKey({ kind: "city", name: "Livingstone", country: "Zambia" }),
    locationKey({ kind: "city", name: "Livingstone", country: "Malawi" })
  );
});

test("kind separates a province from a city that share a name", () => {
  // Masvingo is both a province and its capital.
  assert.notEqual(
    locationKey({ kind: "state", name: "Masvingo", country: "Zimbabwe" }),
    locationKey({ kind: "city", name: "Masvingo", country: "Zimbabwe" })
  );
});

test("a country has no parent, so its key is kind plus name", () => {
  assert.equal(locationKey({ kind: "country", name: "Rwanda" }), "country|||rwanda");
});

test("a city with no province is distinct from one that has it", () => {
  assert.notEqual(
    locationKey({ kind: "city", name: "Kasumbalesa", country: "Zambia" }),
    locationKey({ kind: "city", name: "Kasumbalesa", country: "Zambia", state: "Copperbelt Province" })
  );
});

test("display name keeps its casing but loses stray whitespace", () => {
  assert.equal(normalizeLocationName("  Kapiri   Mposhi "), "Kapiri Mposhi");
  assert.equal(normalizeLocationName(undefined), "");
});

test("the three kinds are the ones the cascade uses", () => {
  assert.deepEqual([...LOCATION_KINDS], ["country", "state", "city"]);
});
