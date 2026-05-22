import { Request, Response } from "express";
import Client from "../models/Client.js";
import Company from "../models/Company.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendClientWelcomeEmail, sendOTPEmail } from "../services/emailService.js";

// In-memory OTP store: email → { otp, expiresAt }
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

export const createClient = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, contact, designation, password, status, company } = req.body;

    // Check if client already exists
    const existingClient = await Client.findOne({ $or: [{ email }, { contact }] });
    if (existingClient) {
      res.status(400).json({ message: "Client with this email or contact already exists" });
      return;
    }

    // Capture plain-text password before the pre-save hook hashes it
    const plainPassword = password;

    const newClient = new Client({
      name,
      email,
      contact,
      designation,
      password,
      status,
      company: company || undefined,
    });

    const savedClient = await newClient.save();

    // Bi-directional Link: Update Company if companyId is provided
    if (company) {
      await Company.findByIdAndUpdate(company, {
        $addToSet: { clients: savedClient._id }
      });
    }

    // Send welcome email with credentials
    try {
      await sendClientWelcomeEmail({ toEmail: email, clientName: name, password: plainPassword });
      console.log(`✅ Welcome email sent to ${email}`);
    } catch (emailErr: any) {
      console.error(`❌ Welcome email FAILED for ${email}:`, emailErr?.message || emailErr);
    }

    // Remove password from response
    const clientResponse = savedClient.toObject();
    delete (clientResponse as any).password;

    res.status(201).json({
      message: "Client created successfully",
      client: clientResponse,
    });
  } catch (error: any) {
    res.status(500).json({
      message: "Error creating client",
      error: error.message,
    });
  }
};

export const loginClient = async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      res.status(400).json({ message: "Identifier (email/phone) and password are required" });
      return;
    }

    // Find client by email or contact
    const client = await Client.findOne({
      $or: [{ email: identifier }, { contact: identifier }],
    });

    if (!client) {
      res.status(404).json({ message: "Client not found" });
      return;
    }

    // Check password
    const isMatch = await bcrypt.compare(password, client.password);
    if (!isMatch) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    // Generate Token
    const token = jwt.sign(
      { id: client._id, email: client.email },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "7d" }
    );

    // Remove password
    const clientData = client.toObject();
    delete (clientData as any).password;

    res.status(200).json({
      message: "Login successful",
      token,
      client: clientData,
    });
  } catch (error: any) {
    res.status(500).json({ message: "Login failed", error: error.message });
  }
};

export const getClients = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.query.companyId as string;
    const filter = companyId ? { company: companyId } : {};
    
    const clients = await Client.find(filter)
      .select("-password")
      .populate("company")
      .sort({ createdAt: -1 });
      
    res.status(200).json(clients);
  } catch (error: any) {
    res.status(500).json({
      message: "Error fetching clients",
      error: error.message,
    });
  }
};

export const updateClientPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      res.status(400).json({ message: "New password is required" });
      return;
    }

    const client = await Client.findById(id);
    if (!client) {
      res.status(404).json({ message: "Client not found" });
      return;
    }

    // Update password and flag
    client.password = newPassword;
    client.mustChangePassword = false;
    await client.save();

    res.status(200).json({ message: "Password updated successfully" });
  } catch (error: any) {
    res.status(500).json({ message: "Password update failed", error: error.message });
  }
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email) { res.status(400).json({ message: "Email is required" }); return; }

    const client = await Client.findOne({ email });
    if (!client) { res.status(404).json({ message: "No account found with this email" }); return; }

    const otp = generateOTP();
    otpStore.set(email, { otp, expiresAt: Date.now() + 10 * 60 * 1000 }); // 10 min

    await sendOTPEmail({ toEmail: email, clientName: client.name, otp });
    console.log(`✅ OTP sent to ${email}: ${otp}`);

    res.status(200).json({ message: "OTP sent to your email" });
  } catch (error: any) {
    console.error("forgotPassword error:", error.message);
    res.status(500).json({ message: "Failed to send OTP", error: error.message });
  }
};

export const verifyOTP = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, otp } = req.body;
    const record = otpStore.get(email);

    if (!record)                      { res.status(400).json({ message: "OTP not found. Please request again." }); return; }
    if (Date.now() > record.expiresAt) { otpStore.delete(email); res.status(400).json({ message: "OTP expired. Please request again." }); return; }
    if (record.otp !== otp)           { res.status(400).json({ message: "Invalid OTP" }); return; }

    res.status(200).json({ message: "OTP verified" });
  } catch (error: any) {
    res.status(500).json({ message: "OTP verification failed", error: error.message });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) { res.status(400).json({ message: "Password must be at least 8 characters" }); return; }

    const record = otpStore.get(email);
    if (!record)                       { res.status(400).json({ message: "OTP not found. Please request again." }); return; }
    if (Date.now() > record.expiresAt) { otpStore.delete(email); res.status(400).json({ message: "OTP expired. Please request again." }); return; }
    if (record.otp !== otp)            { res.status(400).json({ message: "Invalid OTP" }); return; }

    const client = await Client.findOne({ email });
    if (!client) { res.status(404).json({ message: "Client not found" }); return; }

    client.password = newPassword;
    client.mustChangePassword = false;
    await client.save();

    otpStore.delete(email); // OTP consumed
    res.status(200).json({ message: "Password reset successfully" });
  } catch (error: any) {
    res.status(500).json({ message: "Password reset failed", error: error.message });
  }
};
