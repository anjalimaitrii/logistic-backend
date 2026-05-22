import dotenv from "dotenv";
dotenv.config();

import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const TO    = "anjijangid8@gmail.com";
const FROM  = process.env.AWS_SES_SENDER_EMAIL || "support@maitriiinfotech.com";
const CSET  = process.env.AWS_SES_CONFIGURATION_SET_NAME;

async function main() {
  console.log("AWS_REGION            :", process.env.AWS_REGION);
  console.log("AWS_ACCESS_KEY_ID     :", process.env.AWS_ACCESS_KEY_ID?.slice(0, 8) + "...");
  console.log("AWS_SES_SENDER_EMAIL  :", FROM);
  console.log("CONFIG_SET            :", CSET || "(none)");
  console.log("Sending test email to :", TO);
  console.log("---");

  const cmd: any = {
    Source: FROM,
    Destination: { ToAddresses: [TO] },
    Message: {
      Subject: { Data: "FleetTrack – Test Email", Charset: "UTF-8" },
      Body: {
        Text: { Data: "hello", Charset: "UTF-8" },
        Html: { Data: "<p>hello</p>", Charset: "UTF-8" },
      },
    },
  };
  // ConfigurationSet skipped — not created in SES yet

  try {
    const result = await ses.send(new SendEmailCommand(cmd));
    console.log("✅ Email sent! MessageId:", result.MessageId);
  } catch (err: any) {
    console.error("❌ SES Error:", err.name);
    console.error("   Message  :", err.message);
  }
}

main();
