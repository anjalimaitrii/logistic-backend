import { Request, Response, NextFunction } from "express";

const REPORT_BASE = "http://43.204.86.252/ReportServices";
const USER_API_CONFIG_ID = "429";
const CREDENTIALS = {
  username: process.env.TRAKZEE_USERNAME || "speedogisticzm@tntzm.gps",
  password: process.env.TRAKZEE_PASSWORD || "Krishna@1985",
};

// auth_token expires in ~30 min — cache for 25 min
let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const res = await fetch(`${REPORT_BASE}/config/usertoken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(CREDENTIALS),
  });

  if (!res.ok) throw new Error(`Token request failed: ${res.status}`);

  const data = await res.json();

  // Response shape: { result: 1, auth_token: "Bearer eyJ...", refresh_token: "..." }
  const token = data?.auth_token ?? null;

  if (!token) {
    console.error("[TravelSummary] Unexpected token response:", JSON.stringify(data));
    throw new Error("auth_token not found in response");
  }

  cachedToken = token;
  tokenExpiry = Date.now() + 25 * 60 * 1000;
  console.log("[TravelSummary] Token refreshed");
  return token;
}

async function fetchReport(token: string, body: object): Promise<any> {
  const res = await fetch(
    `${REPORT_BASE}/customapi/travelsummaryreport?user_api_config_id=${USER_API_CONFIG_ID}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token, // already contains "Bearer " prefix
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error(`Report request failed: ${res.status}`);
  return res.json();
}

export const getTravelSummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { start_date_time, end_date_time, imei_nos } = req.body;

  if (!start_date_time || !end_date_time || !imei_nos) {
    res.status(400).json({ success: false, error: "start_date_time, end_date_time, and imei_nos are required" });
    return;
  }

  try {
    const token = await getToken();
    const payload = { start_date_time, end_date_time, imei_nos };

    let data: any;
    try {
      data = await fetchReport(token, payload);
    } catch {
      // Token may have silently expired — refresh once and retry
      console.log("[TravelSummary] Retrying with fresh token...");
      const freshToken = await getToken(true);
      data = await fetchReport(freshToken, payload);
    }

    if (data?.status === "fail") {
      res.status(429).json({ success: false, error: data.message || "Trakzee API returned fail" });
      return;
    }

    const records: any[] = data?.data ?? [];
    res.status(200).json({ success: true, data: records, count: records.length });
  } catch (error: any) {
    console.error("[TravelSummary]", error.message);
    next(error);
  }
};
