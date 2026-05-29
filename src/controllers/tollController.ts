import { Request, Response, NextFunction } from "express";
import TollAccount from "../models/TollAccount.js";

const getOrCreateAccount = async () => {
  let account = await TollAccount.findOne();
  if (!account) {
    account = await TollAccount.create({ balance: 0, transactions: [] });
  }
  return account;
};

export const getTollAccount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const account = await getOrCreateAccount();
    res.status(200).json(account);
  } catch (error: any) {
    next(error);
  }
};

export const addRecharge = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { amount, description } = req.body;
    if (!amount || Number(amount) <= 0) {
      res.status(400).json({ message: "Valid amount is required" });
      return;
    }

    const account = await getOrCreateAccount();
    account.balance += Number(amount);
    account.transactions.push({
      type: "recharge",
      amount: Number(amount),
      description: description || `Recharge of ₹${amount}`,
      date: new Date()
    });
    await account.save();

    res.status(200).json({ message: "Recharge added successfully", account });
  } catch (error: any) {
    next(error);
  }
};

export const deductToll = async (
  amount: number,
  bookingId: string,
  tripId: string
): Promise<void> => {
  const account = await getOrCreateAccount();
  account.balance = Math.max(0, account.balance - amount);
  account.transactions.push({
    type: "deduction",
    amount,
    description: `Toll for trip ${tripId}`,
    bookingId: bookingId as any,
    tripId,
    date: new Date()
  });
  await account.save();
};
