import { Request, Response } from "express";
import Assignment from "../models/Assignment.js";
import Booking from "../models/Booking.js";

export const createAssignment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookingId, driverName, truckNumber, truckHealth, collectionArea } = req.body;

    // Check if assignment already exists
    const existing = await Assignment.findOne({ bookingId });
    if (existing) {
      res.status(400).json({ message: "Job already assigned" });
      return;
    }

    const newAssignment = new Assignment({
      bookingId,
      driverName,
      truckNumber,
      truckHealth,
      collectionArea
    });

    const savedAssignment = await newAssignment.save();

    res.status(201).json({
      message: "Job assigned successfully",
      assignment: savedAssignment
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error assigning job", error: error.message });
  }
};

export const getAssignments = async (req: Request, res: Response): Promise<void> => {
  try {
    const assignments = await Assignment.find().populate("bookingId");
    res.status(200).json(assignments);
  } catch (error: any) {
    res.status(500).json({ message: "Error fetching assignments", error: error.message });
  }
};

export const getAssignmentByBookingId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const assignment = await Assignment.findOne({ bookingId: bookingId });
    if (!assignment) {
      res.status(404).json({ message: "Assignment not found" });
      return;
    }
    res.status(200).json(assignment);
  } catch (error: any) {
    res.status(500).json({ message: "Error fetching assignment", error: error.message });
  }
};

export const updateAssignment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const { driverName, truckNumber, truckHealth, collectionArea } = req.body;

    const assignment = await Assignment.findOneAndUpdate(
      { bookingId },
      { driverName, truckNumber, truckHealth, collectionArea },
      { new: true }
    );

    if (!assignment) {
      res.status(404).json({ message: "Assignment not found" });
      return;
    }

    res.status(200).json({
      message: "Assignment updated successfully",
      assignment
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error updating assignment", error: error.message });
  }
};
