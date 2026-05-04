import { Request, Response } from "express";
import Client from "../models/Client.js";
import Company from "../models/Company.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const createClient = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, contact, designation, password, status, company } = req.body;

    // Check if client already exists
    const existingClient = await Client.findOne({ $or: [{ email }, { contact }] });
    if (existingClient) {
      res.status(400).json({ message: "Client with this email or contact already exists" });
      return;
    }

    const newClient = new Client({
      name,
      email,
      contact,
      designation,
      password,
      status,
      company: company || undefined, // Set company if provided
    });

    const savedClient = await newClient.save();

    // Bi-directional Link: Update Company if companyId is provided
    if (company) {
      await Company.findByIdAndUpdate(company, {
        $addToSet: { clients: savedClient._id }
      });
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
