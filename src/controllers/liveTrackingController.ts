import { Request, Response } from "express";

const TRAKZEE_BASE = "http://13.127.228.11/webservice";
const CREDENTIALS = {
  username: "speedogisticzm@tntzm.gps",
  password: "Krishna@1985",
};

let cachedToken: string | null = null;
let tokenExpiry = 0;

// Official vehicle list cached from viewVehicle API
let officialVehicleNames: Set<string> | null = null;
let officialListExpiry = 0;

async function getToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const res = await fetch(`${TRAKZEE_BASE}?token=generateAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(CREDENTIALS),
  });

  if (!res.ok) throw new Error(`Token request failed: ${res.status}`);

  const data = await res.json();

  const token =
    (Array.isArray(data) ? data[0]?.token : undefined) ??
    data?.data?.[0]?.token ??
    data?.data?.token ??
    data?.token ??
    null;

  if (!token) {
    console.error("[LiveTrack] Unexpected token response:", JSON.stringify(data));
    throw new Error("Token not found in response");
  }

  cachedToken = token;
  tokenExpiry = Date.now() + 22 * 60 * 60 * 1000;
  console.log("[LiveTrack] Token refreshed, valid for 22h");
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

  if (!dataRes.ok) {
    cachedToken = null;
    tokenExpiry = 0;
    throw new Error(`Live data request failed: ${dataRes.status}`);
  }

  const data = await dataRes.json();
  return data?.root?.VehicleData ?? data?.VehicleData ?? [];
}

export const getLiveVehicles = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = await getToken();

    // Fetch official vehicle list and live data in parallel
    const [officialNames, allVehicles] = await Promise.all([
      getOfficialVehicleNames(token),
      fetchVehicleData(token),
    ]);

    let vehicles = allVehicles;

    // Filter to only official vehicles if list was fetched successfully
    if (officialNames.size > 0) {
      vehicles = allVehicles.filter((v) => officialNames.has(v.Vehicle_Name));
    }

    // If empty after filter (token may have silently expired), refresh and retry
    if (vehicles.length === 0) {
      console.log("[LiveTrack] Got 0 vehicles — refreshing token and retrying...");
      officialVehicleNames = null; // also reset official list
      const freshToken = await getToken(true);
      const [freshNames, freshAll] = await Promise.all([
        getOfficialVehicleNames(freshToken),
        fetchVehicleData(freshToken),
      ]);
      vehicles = freshNames.size > 0
        ? freshAll.filter((v) => freshNames.has(v.Vehicle_Name))
        : freshAll;
    }

    res.status(200).json({ success: true, vehicles, count: vehicles.length });
  } catch (error: any) {
    console.error("[LiveTrack]", error.message);
    res.status(500).json({ success: false, error: error.message, vehicles: [] });
  }
};
