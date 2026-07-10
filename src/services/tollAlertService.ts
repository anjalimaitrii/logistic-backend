import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

// Recipients — comma-separated list in ADMIN_ALERT_EMAIL (same as night alerts).
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

export const sendTollLowBalanceAlert = async (
  balance: number,
  deducted: number,
  threshold: number
): Promise<void> => {
  if (ADMIN_EMAILS.length === 0) {
    console.warn("[TollAlert] No ADMIN_ALERT_EMAIL configured — skipping low balance email");
    return;
  }

  const html = `
<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
      <tr><td style="background:#0f172a;padding:28px 40px;">
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">Speedogistic</h1>
        <p style="margin:4px 0 0;color:#f59e0b;font-size:11px;text-transform:uppercase;letter-spacing:2px;">⚠ Toll Account — Low Balance Alert</p>
      </td></tr>
      <tr><td style="padding:32px 40px;">
        <p style="margin:0 0 8px;color:#0f172a;font-size:15px;font-weight:600;">
          Toll account balance has dropped below K${threshold.toLocaleString()}.
        </p>
        <p style="margin:0 0 24px;color:#64748b;font-size:13px;">
          An eToll sheet upload deducted K${deducted.toLocaleString()} from the toll wallet.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
          <tr style="background:#f8fafc;">
            <td style="padding:12px 16px;font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:1px;">Current Balance</td>
            <td style="padding:12px 16px;font-size:16px;font-weight:700;color:#dc2626;text-align:right;">K${balance.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="padding:12px 16px;font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:1px;">Last Deduction</td>
            <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#0f172a;text-align:right;">K${deducted.toLocaleString()}</td>
          </tr>
        </table>
        <p style="margin:24px 0 0;color:#64748b;font-size:13px;">Please recharge the toll account to avoid interruptions.</p>
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
      Subject: { Data: `⚠ Toll Account Low Balance — K${balance.toLocaleString()} left`, Charset: "UTF-8" },
      Body: { Html: { Data: html, Charset: "UTF-8" } },
    },
  }));

  console.log(`[TollAlert] Low balance email sent to ${ADMIN_EMAILS.join(", ")} (balance K${balance})`);
};
