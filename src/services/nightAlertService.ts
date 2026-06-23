import cron from "node-cron";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import Driver from "../models/Driver.js";
import Assignment from "../models/Assignment.js";

const TRAKZEE_BASE = process.env.TRAKZEE_BASE_URL || "http://13.127.228.11/webservice";
// Recipients — comma-separated list in ADMIN_ALERT_EMAIL (e.g. "a@x.com,b@y.com").
const ADMIN_EMAILS = (process.env.ADMIN_ALERT_EMAIL || process.env.AWS_SES_SENDER_EMAIL || "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

const getSES = () => new SESClient({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Re-use token from liveTrackingController's module-level cache via a simple local cache
let _token: string | null = null;
let _tokenExpiry = 0;

async function getToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiry) return _token;
  const res  = await fetch(`${TRAKZEE_BASE}?token=generateAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: process.env.TRAKZEE_USERNAME || "",
      password: process.env.TRAKZEE_PASSWORD || "",
    }),
  });
  const data = await res.json();
  const token =
    (Array.isArray(data) ? data[0]?.token : undefined) ??
    data?.data?.[0]?.token ?? data?.data?.token ?? data?.token ?? null;
  if (!token) throw new Error("Could not get Trakzee token");
  _token = token;
  _tokenExpiry = Date.now() + 22 * 60 * 60 * 1000;
  return token;
}

async function getRunningTrucks(): Promise<any[]> {
  const token = await getToken();
  const res = await fetch(`${TRAKZEE_BASE}?token=getTokenBaseLiveData&ProjectId=37`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "auth-code": token },
    body: JSON.stringify({ format: "json" }),
  });
  const data = await res.json();
  const vehicles: any[] = data?.root?.VehicleData ?? data?.VehicleData ?? [];
  return vehicles.filter(v => v.Status === "RUNNING");
}

async function sendNightAlert(runningTrucks: any[], driverMap: Record<string, any>, assignmentMap: Record<string, any>) {
  const rows = runningTrucks.map(v => {
    const truckNo  = v.Vehicle_No || v.Vehicle_Name || "—";
    const driver   = driverMap[truckNo];
    const asgn     = assignmentMap[truckNo];
    const route    = asgn
      ? `${asgn.bookingId?.pickupLocations?.[0]?.address?.city || "—"} → ${asgn.bookingId?.dropoffLocations?.[0]?.address?.city || "—"}`
      : "—";
    const tripId   = asgn?.bookingId?.tripId || "—";
    const speed    = v.Speed ? `${v.Speed} km/h` : "—";
    const location = v.Location && v.Location !== "--" ? v.Location : "—";

    return `
      <tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:10px 14px;font-weight:700;color:#0f172a;">${truckNo}</td>
        <td style="padding:10px 14px;color:#334155;">${driver?.name || "—"}</td>
        <td style="padding:10px 14px;color:#334155;">${tripId}</td>
        <td style="padding:10px 14px;color:#334155;">${route}</td>
        <td style="padding:10px 14px;color:#334155;">${speed}</td>
        <td style="padding:10px 14px;color:#64748b;font-size:12px;">${location}</td>
      </tr>`;
  }).join("");

  const html = `
<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
  <tr><td align="center">
    <table width="700" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
      <tr><td style="background:#0f172a;padding:28px 40px;">
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">Speedogistic</h1>
        <p style="margin:4px 0 0;color:#f59e0b;font-size:11px;text-transform:uppercase;letter-spacing:2px;">⚠ Night Alert — Truck Running After Hours (7:30 PM–6:00 AM)</p>
      </td></tr>
      <tr><td style="padding:32px 40px;">
        <p style="margin:0 0 8px;color:#0f172a;font-size:15px;font-weight:600;">
          ${runningTrucks.length} truck${runningTrucks.length > 1 ? "s are" : " is"} running during night hours (7:30 PM–6:00 AM CAT).
        </p>
        <p style="margin:0 0 24px;color:#64748b;font-size:13px;">Please review and take appropriate action.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:1px;">Truck No.</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:1px;">Driver</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:1px;">Trip ID</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:1px;">Route</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:1px;">Speed</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:1px;">Location</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </td></tr>
      <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
        <p style="margin:0;color:#94a3b8;font-size:12px;">© ${new Date().getFullYear()} Maitrii Infotech · Speedogistic Automated Alert</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  await getSES().send(new SendEmailCommand({
    Source: process.env.AWS_SES_SENDER_EMAIL!,
    Destination: { ToAddresses: ADMIN_EMAILS },
    Message: {
      Subject: { Data: `⚠ Speedogistic Night Alert — ${runningTrucks.length} Truck(s) Running After Hours`, Charset: "UTF-8" },
      Body: { Html: { Data: html, Charset: "UTF-8" } },
    },
  }));

  console.log(`[NightAlert] Email sent to ${ADMIN_EMAILS.join(", ")} for ${runningTrucks.length} running trucks`);
}

// Night window: 7:30 PM → 6:00 AM CAT (Africa/Lusaka, UTC+2, no DST).
const WINDOW_START_MIN = 19 * 60 + 30; // 19:30 CAT
const WINDOW_END_MIN   = 6 * 60;        // 06:00 CAT

// Current minutes-since-midnight in CAT (UTC+2).
function catMinutesNow(): number {
  const now = new Date();
  return ((now.getUTCHours() * 60 + now.getUTCMinutes()) + 120) % 1440;
}

// Window wraps past midnight: [19:30, 24:00) ∪ [00:00, 06:00).
function inNightWindow(min: number): boolean {
  return min >= WINDOW_START_MIN || min < WINDOW_END_MIN;
}

// Trucks already alerted in the current night — avoids re-emailing the same
// truck every 30 min. Reset once we leave the window. In-memory (resets on
// server restart, which is acceptable).
const alertedTonight = new Set<string>();

export function startNightAlertCron() {
  // Check every 30 min; act only inside the 7:30 PM–6:00 AM CAT window.
  cron.schedule("*/30 * * * *", async () => {
    if (!inNightWindow(catMinutesNow())) {
      alertedTonight.clear(); // outside the window → reset for the next night
      return;
    }
    console.log("[NightAlert] In-window check (7:30 PM–6:00 AM CAT)...");
    try {
      const runningTrucks = await getRunningTrucks();
      // Only trucks not already alerted earlier tonight (dedup per night)
      const fresh = runningTrucks.filter((v: any) => {
        const id = v.Vehicle_No || v.Vehicle_Name || "";
        return id && !alertedTonight.has(id);
      });
      if (fresh.length === 0) {
        console.log("[NightAlert] No new running trucks — no alert sent.");
        return;
      }

      // Build truckNo → driver map from Driver collection
      const drivers = await Driver.find().populate("assignedTruck");
      const driverMap: Record<string, any> = {};
      drivers.forEach((d: any) => {
        const tid = d.assignedTruck?.truckId;
        if (tid) driverMap[tid] = d;
      });

      // Build truckNo → active assignment (with booking populated) map
      const assignments = await Assignment.find({ queueStatus: "active" }).populate({
        path: "bookingId",
        select: "tripId pickupLocations dropoffLocations"
      });
      const assignmentMap: Record<string, any> = {};
      assignments.forEach((a: any) => {
        if (a.truckNumber) assignmentMap[a.truckNumber] = a;
      });

      await sendNightAlert(fresh, driverMap, assignmentMap);
      fresh.forEach((v: any) => alertedTonight.add(v.Vehicle_No || v.Vehicle_Name));
    } catch (err: any) {
      console.error("[NightAlert] Error:", err.message);
    }
  }, { timezone: "UTC" });

  console.log("[NightAlert] Cron scheduled — every 30 min during 7:30 PM–6:00 AM CAT");
}
