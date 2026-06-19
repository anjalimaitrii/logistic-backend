import { Request, Response, NextFunction } from "express";
import { LiveTrackingCache } from "../models/liveTrackingCache.js";

const TRAKZEE_BASE = process.env.TRAKZEE_BASE_URL || "http://13.127.228.11/webservice";
const CREDENTIALS = {
  username: process.env.TRAKZEE_USERNAME || "",
  password: process.env.TRAKZEE_PASSWORD || "",
};

let cachedToken: string | null = null;
let tokenExpiry = 0;

// Official vehicle list cached from viewVehicle API
let officialVehicleNames: Set<string> | null = null;
let officialListExpiry = 0;

// Live vehicle data cache (10 second TTL)
let cachedLiveData: any = null;
let liveDataExpiry = 0;

async function getToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && Date.now() < tokenExpiry) {
    console.log("[LiveTrack] Using cached token");
    return cachedToken;
  }

  console.log("[LiveTrack] Fetching new token from:", `${TRAKZEE_BASE}?token=generateAccessToken`);
  console.log("[LiveTrack] Username:", CREDENTIALS.username);

  const res = await fetch(`${TRAKZEE_BASE}?token=generateAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(CREDENTIALS),
  });

  console.log("[LiveTrack] Token response status:", res.status);

  if (!res.ok) throw new Error(`Token request failed: ${res.status}`);

  const data = await res.json();

  const token =
    (Array.isArray(data) ? data[0]?.token : undefined) ??
    data?.data?.[0]?.token ??
    data?.data?.token ??
    data?.token ??
    null;

  if (!token) {
    console.error("[LiveTrack] ✗ Token not found in response");
    console.error("[LiveTrack] Response was:", JSON.stringify(data).slice(0, 200));
    throw new Error("Token not found in response");
  }

  cachedToken = token;
  tokenExpiry = Date.now() + 22 * 60 * 60 * 1000;
  console.log("[LiveTrack] ✓ Token obtained, valid for 22h");
  return token;
}

// Fetch official vehicle list from viewVehicle API — cached for 1 hour
async function getOfficialVehicleNames(token: string): Promise<Set<string>> {
  if (officialVehicleNames && Date.now() < officialListExpiry) {
    return officialVehicleNames;
  }

  const res = await fetch(`${TRAKZEE_BASE}?token=viewVehicle`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "auth-code": token,
    },
    body: JSON.stringify({ project_id: 37 }),
  });

  if (!res.ok) {
    console.warn("[LiveTrack] viewVehicle failed, skipping filter");
    return new Set(); // empty = no filter applied
  }

  const data = await res.json();
  const list: any[] = data?.data ?? [];

  if (list.length === 0) {
    console.warn("[LiveTrack] viewVehicle returned empty list, skipping filter");
    return new Set();
  }

  officialVehicleNames = new Set(list.map((v) => v.vehicle_name).filter(Boolean));
  officialListExpiry = Date.now() + 60 * 60 * 1000; // refresh every 1 hour
  console.log(`[LiveTrack] Official vehicle list cached: ${officialVehicleNames.size} vehicles`);
  return officialVehicleNames;
}

async function fetchVehicleData(token: string): Promise<any[]> {
  console.log("[LiveTrack] Fetching vehicle data with token...");
  const dataRes = await fetch(
    `${TRAKZEE_BASE}?token=getTokenBaseLiveData&ProjectId=37`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "auth-code": token,
      },
      body: JSON.stringify({ company_names: "", vehicle_nos: "", imei_nos: "", format: "json" }),
    }
  );

  console.log("[LiveTrack] Vehicle data response status:", dataRes.status);

  if (!dataRes.ok) {
    console.error("[LiveTrack] ✗ Vehicle data request failed:", dataRes.status);
    cachedToken = null;
    tokenExpiry = 0;
    throw new Error(`Live data request failed: ${dataRes.status}`);
  }

  const data = await dataRes.json();
  console.log("[LiveTrack] Vehicle data raw response:", JSON.stringify(data).slice(0, 500));

  const vehicles = data?.root?.VehicleData ?? data?.VehicleData ?? [];
  console.log("[LiveTrack] ✓ Got", vehicles.length, "vehicles from API");
  return vehicles;
}

// Look up a single truck's last-known live position from the freshest available
// cache (in-memory 10s window, else newest MongoDB snapshot). Returns null if
// the truck isn't found or has no valid GPS fix. Server-side equivalent of the
// frontend's captureTruckCoords — used to freeze a returning trip's end point.
export async function getVehiclePosition(
  truckNumber: string
): Promise<{ lat: number; lng: number; location?: string } | null> {
  if (!truckNumber) return null;
  try {
    let vehicles: any[] = [];
    if (cachedLiveData?.vehicles?.length && Date.now() < liveDataExpiry) {
      vehicles = cachedLiveData.vehicles;
    } else {
      const cached = await LiveTrackingCache.findOne().sort({ createdAt: -1 });
      vehicles = cached?.vehicles || [];
    }
    const norm = String(truckNumber).trim().toUpperCase();
    const v = vehicles.find(
      (x: any) =>
        String(x.Vehicle_No || "").trim().toUpperCase() === norm ||
        String(x.Vehicle_Name || "").trim().toUpperCase() === norm
    );
    const lat = parseFloat(v?.Latitude);
    const lng = parseFloat(v?.Longitude);
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
      return { lat, lng, location: v?.Location || undefined };
    }
  } catch (err: any) {
    console.warn("[LiveTrack] getVehiclePosition failed:", err?.message);
  }
  return null;
}

export const getLiveVehicles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  console.log("[LiveTrack] GET /api/livetrack called");
  try {
    // Return in-memory cache if valid (10s TTL)
    if (cachedLiveData && Date.now() < liveDataExpiry) {
      console.log("[LiveTrack] ✓ Returning from memory cache");
      res.set('Cache-Control', 'public, max-age=10');
      res.set('X-Cache', 'HIT-MEMORY');
      res.status(200).json(cachedLiveData);
      return;
    }

    console.log("[LiveTrack] Memory cache miss, fetching fresh data...");

    let vehicles: any[] = [];
    let source: 'trakzee' | 'cache' = 'trakzee';

    try {
      console.log("[LiveTrack] Attempting to fetch from Trakzee API...");
      const token = await getToken();

      // Fetch official vehicle list and live data in parallel
      console.log("[LiveTrack] Fetching official vehicle names...");
      const [officialNames, allVehicles] = await Promise.all([
        getOfficialVehicleNames(token),
        fetchVehicleData(token),
      ]);

      console.log("[LiveTrack] Official vehicles:", officialNames.size);
      console.log("[LiveTrack] All vehicles from API:", allVehicles.length);

      vehicles = allVehicles;

      // Filter to only official vehicles if list was fetched successfully
      if (officialNames.size > 0) {
        vehicles = allVehicles.filter((v) => officialNames.has(v.Vehicle_Name));
        console.log("[LiveTrack] After filtering:", vehicles.length);
      }

      // If empty, refresh token and retry once
      if (vehicles.length === 0 && cachedToken) {
        console.log("[LiveTrack] Got 0 vehicles — token may have expired, refreshing...");
        officialVehicleNames = null;
        const freshToken = await getToken(true);
        const [freshNames, freshAll] = await Promise.all([
          getOfficialVehicleNames(freshToken),
          fetchVehicleData(freshToken),
        ]);
        vehicles = freshNames.size > 0
          ? freshAll.filter((v) => freshNames.has(v.Vehicle_Name))
          : freshAll;
        console.log("[LiveTrack] After retry:", vehicles.length);
      }

      // If still empty after retry, treat as API failure — don't save, fall back to cache
      if (vehicles.length === 0) {
        console.warn("[LiveTrack] ⚠ API returned 0 vehicles — treating as failure, will fall back to cache");
        throw new Error("API returned 0 vehicles (likely a data issue, not fresh data)");
      }

      // Success: save to MongoDB in background
      console.log("[LiveTrack] ✓ Got vehicles from Trakzee. Saving to MongoDB...");
      LiveTrackingCache.create({ vehicles, source: 'trakzee' }).then(() => {
        console.log("[LiveTrack] ✓ Saved to MongoDB");
      }).catch((e) =>
        console.warn("[LiveTrack] Failed to save to cache:", e.message)
      );
    } catch (apiError: any) {
      console.error("[LiveTrack] ✗ Trakzee API failed:", apiError.message);

      // Fallback: get from MongoDB cache
      console.log("[LiveTrack] Attempting to fetch from MongoDB cache...");
      const cached = await LiveTrackingCache.findOne().sort({ createdAt: -1 });
      if (cached && cached.vehicles.length > 0) {
        vehicles = cached.vehicles;
        source = 'cache';
        console.log("[LiveTrack] ✓ Serving from MongoDB cache. Vehicles:", vehicles.length);
      } else {
        console.error("[LiveTrack] ✗ No MongoDB cache available");
        // No cache either, re-throw
        throw new Error(`API failed and no cache available: ${apiError.message}`);
      }
    }

    const response = { success: true, vehicles, count: vehicles.length, source };
    cachedLiveData = response;
    liveDataExpiry = Date.now() + 10 * 1000; // 10 second memory cache

    console.log(`[LiveTrack] ✓ Response ready. Source: ${source}, Vehicles: ${vehicles.length}`);

    res.set('Cache-Control', 'public, max-age=10');
    res.set('X-Cache', source === 'trakzee' ? 'MISS-FRESH' : 'HIT-FALLBACK');
    res.status(200).json(response);
  } catch (error: any) {
    console.error("[LiveTrack] ✗ FATAL ERROR:", error.message);
    console.error("[LiveTrack] Stack:", error.stack);
    next(error);
  }
};
