import { Request, Response } from "express";
import Location from "../models/Location.js";
import { locationKey, normalizeLocationName, LOCATION_KINDS } from "../lib/locationKey.js";
import type { LocationKind } from "../lib/locationKey.js";

const isKind = (v: any): v is LocationKind =>
  (LOCATION_KINDS as readonly string[]).includes(v);

export const getAll = async (_req: Request, res: Response) => {
  try {
    const locations = await Location.find().sort({ kind: 1, name: 1 });
    res.json(locations);
  } catch {
    res.status(500).json({ error: "Failed to fetch locations" });
  }
};

export const create = async (req: Request, res: Response) => {
  try {
    const { kind, name, country, state } = req.body;
    if (!isKind(kind)) {
      res.status(400).json({ error: "kind must be country, state or city" });
      return;
    }

    const cleanName = normalizeLocationName(name);
    if (!cleanName) {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    // A province or town with no country above it cannot be offered anywhere,
    // because the dropdowns are a cascade — it would be saved and never seen.
    const cleanCountry = normalizeLocationName(country);
    if (kind !== "country" && !cleanCountry) {
      res.status(400).json({ error: "country is required for a state or city" });
      return;
    }
    const cleanState = kind === "city" ? normalizeLocationName(state) : "";

    const doc = {
      kind,
      name: cleanName,
      country: kind === "country" ? "" : cleanCountry,
      state: cleanState,
      key: locationKey({ kind, name: cleanName, country: cleanCountry, state: cleanState }),
    };

    // Upsert rather than insert-then-check: two operators adding the same town at
    // the same moment would both pass a findOne and one would then 500.
    const saved = await Location.findOneAndUpdate(
      { key: doc.key },
      { $setOnInsert: doc },
      { upsert: true, new: true }
    );
    res.status(201).json(saved);
  } catch {
    res.status(500).json({ error: "Failed to create location" });
  }
};

export const remove = async (req: Request, res: Response) => {
  try {
    await Location.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete location" });
  }
};
