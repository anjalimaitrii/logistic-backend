import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

// Created lazily so env vars are read after dotenv.config() has run
const getSES = () => new SESClient({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const getSender = () => process.env.AWS_SES_SENDER_EMAIL || "support@maitriiinfotech.com";

export const sendOTPEmail = async (opts: {
  toEmail: string;
  clientName: string;
  otp: string;
}): Promise<void> => {
  const { toEmail, clientName, otp } = opts;

  const html = `
<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
      <tr><td style="background:#0f172a;padding:28px 40px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">FleetTrack</h1>
        <p style="margin:4px 0 0;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:2px;">Password Reset</p>
      </td></tr>
      <tr><td style="padding:36px 40px;">
        <p style="margin:0 0 6px;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Hello, ${clientName}</p>
        <h2 style="margin:0 0 20px;color:#0f172a;font-size:22px;font-weight:700;">Your OTP Code</h2>
        <p style="margin:0 0 28px;color:#475569;font-size:14px;line-height:1.7;">Use the code below to reset your password. It expires in <strong>10 minutes</strong>.</p>
        <div style="text-align:center;margin-bottom:28px;">
          <span style="display:inline-block;background:#f1f5f9;border:2px dashed #cbd5e1;border-radius:14px;padding:18px 40px;font-family:monospace;font-size:38px;font-weight:800;color:#0f172a;letter-spacing:10px;">${otp}</span>
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;">
          <tr><td style="padding:12px 16px;">
            <p style="margin:0;color:#9a3412;font-size:13px;">Do not share this OTP with anyone. If you did not request this, ignore this email.</p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
        <p style="margin:0;color:#94a3b8;font-size:12px;">© ${new Date().getFullYear()} Maitrii Infotech · support@maitriiinfotech.com</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`.trim();

  const text = `Hello ${clientName},\n\nYour OTP for password reset: ${otp}\n\nExpires in 10 minutes. Do not share this with anyone.\n\n© ${new Date().getFullYear()} Maitrii Infotech`;

  await getSES().send(new SendEmailCommand({
    Source: getSender(),
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: { Data: "FleetTrack – Your Password Reset OTP", Charset: "UTF-8" },
      Body: {
        Html: { Data: html, Charset: "UTF-8" },
        Text: { Data: text, Charset: "UTF-8" },
      },
    },
  }));
};

export const sendClientWelcomeEmail = async (opts: {
  toEmail: string;
  clientName: string;
  password: string;
}): Promise<void> => {
  const { toEmail, clientName, password } = opts;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="background:#0f172a;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:1px;">FleetTrack</h1>
              <p style="margin:6px 0 0;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:2px;">Logistics & Fleet Management</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="margin:0 0 8px;color:#64748b;font-size:13px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Welcome aboard</p>
              <h2 style="margin:0 0 24px;color:#0f172a;font-size:24px;font-weight:700;">Hello, ${clientName}!</h2>
              <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.7;">
                Your account has been created on <strong>FleetTrack</strong>. You can now log in and track your shipments, bookings, and deliveries in real time.
              </p>

              <!-- Credentials Card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:28px;">
                <tr>
                  <td style="padding:24px 28px;">
                    <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;">Your Login Credentials</p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
                      <tr>
                        <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;">
                          <span style="color:#64748b;font-size:13px;font-weight:600;">Email</span>
                          <span style="float:right;color:#0f172a;font-size:13px;font-weight:700;">${toEmail}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0;">
                          <span style="color:#64748b;font-size:13px;font-weight:600;">Password</span>
                          <span style="float:right;color:#0f172a;font-size:13px;font-weight:700;letter-spacing:1px;font-family:monospace;">${password}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Security Note -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;margin-bottom:28px;">
                <tr>
                  <td style="padding:14px 18px;">
                    <p style="margin:0;color:#9a3412;font-size:13px;line-height:1.5;">
                      <strong>Security Tip:</strong> Please change your password after your first login to keep your account safe.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#475569;font-size:14px;line-height:1.7;">
                If you have any questions or need help getting started, reply to this email and our support team will assist you.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 40px;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:12px;">
                © ${new Date().getFullYear()} Maitrii Infotech · <a href="mailto:support@maitriiinfotech.com" style="color:#64748b;text-decoration:none;">support@maitriiinfotech.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const textBody = `
Welcome to FleetTrack, ${clientName}!

Your account has been created. Here are your login credentials:

Email:    ${toEmail}
Password: ${password}

Please change your password after your first login.

For support, contact us at support@maitriiinfotech.com
© ${new Date().getFullYear()} Maitrii Infotech
  `.trim();

  await getSES().send(new SendEmailCommand({
    Source: getSender(),
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: { Data: "Welcome to FleetTrack – Your Login Credentials", Charset: "UTF-8" },
      Body: {
        Html: { Data: htmlBody, Charset: "UTF-8" },
        Text: { Data: textBody, Charset: "UTF-8" },
      },
    },
  }));
};
