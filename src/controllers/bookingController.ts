import { Request, Response, NextFunction } from "express";
import Booking from "../models/Booking.js";
import Client from "../models/Client.js";
import Notification from "../models/Notification.js";
import { getIo } from "../socket.js";
import { fileCompletedBooking } from "../services/completionRecords.js";
import { getFreshVehiclePosition } from "./liveTrackingController.js";
import { isFinalLeg, isCargoDone, driverStatusFor } from "../lib/tripStatus.js";
import { locationLabel } from "../lib/gapDetection.js";
import { upsertReturnLeg } from "../lib/returnLeg.js";
import { computeLegTotals } from "../lib/legTotals.js";
import { editsBookingDetails } from "../lib/bookingLock.js";
import { fleetSummaryFor } from "../lib/fleetSummary.js";
import Settlement from "../models/Settlement.js";
import Assignment from "../models/Assignment.js";
import Driver from "../models/Driver.js";
import Warehouse from "../models/Warehouse.js";
import Mileage from "../models/Mileage.js";

export const createBooking = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      cargoDetails,
      pickupLocations,
      dropoffLocations,
      pickup,
      dropoff,
      requirement,
      status,
      metadata,
      clientId,
      isSecret,
      withTax,
    } = req.body;

    // Generate sequential Trip ID
    const lastBooking = await Booking.findOne().sort({ createdAt: -1 }).select("tripId");
    let nextNumber = 1;
    if (lastBooking?.tripId) {
      const lastNum = parseInt(lastBooking.tripId.replace("TRIP-", ""), 10);
      if (!isNaN(lastNum)) nextNumber = lastNum + 1;
    }
    const tripId = `TRIP-${String(nextNumber).padStart(3, "0")}`;

    // A client can only book under their own account; admin may book for any client
    const user = (req as any).user;
    const effectiveClientId = user?.role === "client" ? user.id : clientId;

    const bookingData: any = {
      tripId,
      clientId: effectiveClientId,
      cargoDetails,
      requirement,
      status: status || "pending",
      timeline: [
        {
          title: "Booking Created",
          description: "Booking created successfully",
          time: new Date(),
          status: "completed",
        },
      ],
      metadata,
      isSecret: isSecret ?? false,
      withTax: withTax ?? true,
    };

    // Stamp who this was booked for, here rather than in the forms. The admin
    // drawer sent the client name and the client-side form did not, so half the
    // bookings had no name to fall back on once the account behind them was
    // deleted. Doing it server-side means every booking carries it, whichever
    // form made it. Whatever the caller sent wins — it may name a person the
    // account record does not.
    if (effectiveClientId) {
      const bookedFor = await Client.findById(effectiveClientId)
        .select("name company")
        .populate("company", "companyName")
        .lean();
      if (bookedFor) {
        bookingData.metadata = {
          ...(bookingData.metadata || {}),
          client: (bookingData.metadata?.client) || (bookedFor as any).name || "",
          company: (bookingData.metadata?.company) || (bookedFor as any).company?.companyName || "",
        };
      }
    }

    if (Array.isArray(pickupLocations) && pickupLocations.length > 0) {
      bookingData.pickupLocations = pickupLocations;
    } else if (pickup) {
      bookingData.pickupLocations = [
        {
          sequence: 1,
          contactPerson: pickup.contactPerson,
          contactNumber: pickup.contactNumber,
          address: pickup.address,
          gpsEnabled: pickup.gpsEnabled ?? false,
        },
      ];
    }

    if (Array.isArray(dropoffLocations) && dropoffLocations.length > 0) {
      bookingData.dropoffLocations = dropoffLocations;
    } else if (dropoff) {
      bookingData.dropoffLocations = [
        {
          sequence: 1,
          contactPerson: dropoff.contactPerson,
          contactNumber: dropoff.contactNumber,
          address: dropoff.address,
          gpsEnabled: dropoff.gpsEnabled ?? false,
        },
      ];
    }

    if (!Array.isArray(bookingData.pickupLocations) || bookingData.pickupLocations.length === 0) {
      res.status(400).json({
        message: "At least one pickup location is required",
      });
      return;
    }

    if (!Array.isArray(bookingData.dropoffLocations) || bookingData.dropoffLocations.length === 0) {
      res.status(400).json({
        message: "At least one dropoff location is required",
      });
      return;
    }

    const newBooking = new Booking(bookingData);

    const savedBooking = await newBooking.save();

    // Create notification once in DB, then broadcast via socket
    try {
      const pickup = savedBooking.pickupLocations?.[0]?.address?.city || "N/A";
      const dropoff = savedBooking.dropoffLocations?.[0]?.address?.city || "N/A";
      const goods = Array.isArray(savedBooking.cargoDetails?.goodsType)
        ? savedBooking.cargoDetails.goodsType.join(", ")
        : savedBooking.cargoDetails?.goodsType || "N/A";
      const notif = await Notification.create({
        icon: "📦",
        title: `New Job: ${savedBooking.tripId}`,
        body: `${goods} · ${pickup} → ${dropoff}`,
        link: "/admin/requests",
        unread: true,
      });
      getIo().emit("new_job", {
        _id: String(notif._id),
        tripId: savedBooking.tripId,
        pickup,
        dropoff,
        goods,
        createdAt: savedBooking.createdAt,
      });
    } catch {
      // Socket/DB not critical — ignore if not initialized
    }

    res.status(201).json({
      message: "Booking posted successfully",
      booking: savedBooking,
    });
  } catch (error: any) {
    next(error);
  }
};

export const getBookings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = (req as any).user;
    const isAdmin = user?.role === "admin";

    let filter: any = {};
    if (isAdmin) {
      // Admin: optionally filter by a client, otherwise all bookings
      const clientId = req.query.clientId as string;
      filter = clientId ? { clientId } : {};
    } else if (user?.company) {
      // Client: only their company's bookings (covers both Personal & Company views)
      const companyClients = await Client.find({ company: user.company }).select("_id");
      filter = { clientId: { $in: companyClients.map((c: any) => c._id) } };
    } else {
      // Client without a company → only their own bookings
      filter = { clientId: user?.id };
    }

    const bookings = await Booking.find(filter)
      .populate({
        path: "clientId",
        select: "name email contact company",
        populate: {
          path: "company",
          select: "companyName tpinNumber"
        }
      })
      .sort({ createdAt: -1 });

    res.status(200).json(await withFleet(bookings));
  } catch (error: any) {
    next(error);
  }
};

/**
 * Fill in a driver or truck whose id no longer resolves.
 *
 * An assignment stores the driver's name and the truck's plate as well as their
 * ids. That redundancy is what saves it here: clearing the drivers and trucks
 * collections and re-importing from Trakzee mints fresh ids, so every past
 * assignment is left pointing at records that no longer exist. The trip still
 * knows WHO and WHICH TRUCK — it just cannot reach their details.
 *
 * The plate is unique, so a truck resolves exactly. A driver name is not unique
 * on its own — this fleet has two Fenwell Lungus — so it is matched together
 * with the truck, the same pair the drivers collection is keyed on.
 */
async function relinkByName(assignments: any[]): Promise<void> {
  const orphanTruck = assignments.filter((a) => a.truckNumber && !a.truckId);
  const orphanDriver = assignments.filter((a) => a.driverName && !a.driverId);
  if (!orphanTruck.length && !orphanDriver.length) return;

  const Truck = (await import("../models/Truck.js")).default;
  const Driver = (await import("../models/Driver.js")).default;
  const { driverDedupeKey } = await import("../lib/driverKey.js");

  // Plates first: a driver is identified by name AND truck, so the truck has to
  // be known before the driver can be looked up.
  if (orphanTruck.length) {
    const plates = [...new Set(orphanTruck.map((a) => a.truckNumber))];
    const found = await Truck.find({ truckId: { $in: plates } })
      .select("truckId trailerNumber")
      .lean();
    const byPlate = new Map(found.map((t: any) => [t.truckId, t]));
    for (const a of orphanTruck) a.truckId = byPlate.get(a.truckNumber) || null;
  }

  if (orphanDriver.length) {
    const keys = orphanDriver.map((a) =>
      driverDedupeKey(a.driverName, (a.truckId as any)?._id)
    );
    const found = await Driver.find({ dedupeKey: { $in: [...new Set(keys)] } })
      .select("name phone nrc dedupeKey")
      .lean();
    const byKey = new Map(found.map((d: any) => [d.dedupeKey, d]));
    orphanDriver.forEach((a, i) => { a.driverId = byKey.get(keys[i]) || null; });
  }
}

/**
 * Attach the carrier, truck and driver to each booking.
 *
 * The client app cannot reach this itself — /api/assignments is admin-only — so
 * the join happens here. Read live rather than copied onto the booking, so a
 * driver swapped an hour before loading shows the driver who is actually coming.
 *
 * fleetSummaryFor whitelists the four fields; nothing else off the assignment or
 * the driver record travels with it.
 */
async function withFleet(bookings: any[]): Promise<any[]> {
  if (!bookings.length) return [];
  const Assignment = (await import("../models/Assignment.js")).default;

  // One query for the whole page rather than one per row.
  //
  // Completed assignments are included on purpose. A finished trip is exactly
  // when the client most wants to know which truck and driver delivered it —
  // filtering them out left every past job with no fleet at all.
  const assignments = await Assignment.find({
    bookingId: { $in: bookings.map((b: any) => b._id) },
  })
    .select("bookingId truckNumber driverName driverId truckId queueStatus createdAt")
    .populate("driverId", "name phone nrc")
    .populate("truckId", "truckId trailerNumber")
    .sort({ createdAt: -1 })
    .lean();

  // A booking has one assignment, but if it were ever handed over twice the
  // running one is the answer, and the newest otherwise.
  const byBooking = new Map<string, any>();
  for (const a of assignments as any[]) {
    const id = String(a.bookingId);
    const held = byBooking.get(id);
    if (!held || (held.queueStatus === "completed" && a.queueStatus !== "completed")) {
      byBooking.set(id, a);
    }
  }

  await relinkByName([...byBooking.values()]);
  return bookings.map((b: any) => ({
    ...(typeof b.toObject === "function" ? b.toObject() : b),
    fleet: fleetSummaryFor(byBooking.get(String(b._id))),
  }));
}

export const getBookingById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const booking = await Booking.findById(id).populate("clientId", "name email contact");

    if (!booking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }

    const [withFleetAttached] = await withFleet([booking]);
    res.status(200).json(withFleetAttached);
  } catch (error: any) {
    next(error);
  }
};

// Cancel = hard delete. The booking is removed entirely, along with its assignment
// and settlement, so nothing about it remains. Clients may only delete their own
// company's booking, and only before the trip has started.
export const cancelBooking = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    const booking = await Booking.findById(id).select("clientId tripStatus");
    if (!booking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }

    if (user?.role === "client") {
      // Only the client who actually created the booking may cancel it — NOT
      // company-mates. (Admin can cancel any.)
      const sameClient = String(booking.clientId) === String(user.id);
      if (!sameClient) {
        res.status(403).json({ message: "Forbidden — only the client who created this booking can cancel it." });
        return;
      }
      if (booking.tripStatus) {
        res.status(403).json({ message: "Trip has already started — it can no longer be cancelled." });
        return;
      }
    }

    // Remove the booking and everything tied to it
    const Assignment = (await import("../models/Assignment.js")).default;
    const Settlement = (await import("../models/Settlement.js")).default;
    const TripGap = (await import("../models/TripGap.js")).default;
    const Driver = (await import("../models/Driver.js")).default;

    // Read who was driving BEFORE the assignment goes: it is the only record of
    // it. Cancelling used to delete every trace of the job and leave the driver
    // marked on_trip holding nothing — and nothing frees a driver in that state,
    // because the getDrivers sync only walks drivers that still have an active
    // assignment. They stayed ON TRIP on the assignment board forever.
    const cancelledAssignment = await Assignment.findOne({ bookingId: id })
      .select("driverId")
      .lean();
    const strandedDriverId = (cancelledAssignment as any)?.driverId
      ? String((cancelledAssignment as any).driverId)
      : "";

    await Assignment.deleteMany({ bookingId: id });
    await Settlement.deleteMany({ bookingId: id });
    // A gap references two bookings. Deleting one of them would leave a gap that
    // can never be claimed — the claim is atomic and one-shot, so there is no
    // repair path — and would block the surviving trip's approval forever.
    await TripGap.deleteMany({ $or: [{ prevBookingId: id }, { nextBookingId: id }] });
    await Driver.updateMany({ tripQueue: id } as any, { $pull: { tripQueue: id } } as any);

    if (strandedDriverId) {
      // Puts the driver back into whatever their REMAINING work says, and undoes
      // the diversion this job caused if it caused one — a trip retargeted to end
      // at a cancelled job's pickup would otherwise sit at "repositioning"
      // pointing at a booking that no longer exists.
      const { releaseBookingFromDriver } = await import("../services/assignmentTransfer.js");
      await releaseBookingFromDriver(strandedDriverId, String(id));

      // The cancelled job may have had a successor queued behind it. Nothing
      // polls for queued assignments, so without this it would never start.
      const stillQueued = await Assignment.countDocuments({
        driverId: strandedDriverId,
        queueStatus: "queued",
      });
      if (stillQueued > 0) {
        const { promoteNextForDriver } = await import("../services/tripContinuity.js");
        await promoteNextForDriver(strandedDriverId);
      }
    }

    await Booking.findByIdAndDelete(id);

    res.json({ message: "Booking cancelled and removed" });
  } catch (error) { next(error); }
};

export const updateBookingStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, tripStatus, finalAmount, advancePaid, specialRequest, assignment, tripStartCoords, tripEndCoords, deliveryOrders, damages, attachments } = req.body;

    const updateData: any = {};
    if (status) updateData.status = status;
    if (tripStatus) updateData.tripStatus = tripStatus;
    if (deliveryOrders !== undefined) updateData.deliveryOrders = deliveryOrders;
    if (damages !== undefined) updateData.damages = damages;
    if (attachments !== undefined) updateData.attachments = attachments;
    // Capture the truck's position live from Trakzee at the exact moment of
    // start/complete (falls back to whatever the client sent if the live
    // fetch fails). Same source used by the driver app, so both match.
    let liveTruckPos: { lat: number; lng: number; location?: string } | null = null;
    if (tripStatus === "started" || tripStatus === "completed") {
      const Assignment = (await import("../models/Assignment.js")).default;
      const assignment = await Assignment.findOne({ bookingId: id });
      if (assignment?.truckNumber) {
        liveTruckPos = await getFreshVehiclePosition(assignment.truckNumber);
      }
    }

    if (tripStatus === "started") {
      const startCoords = liveTruckPos || tripStartCoords;
      if (startCoords) updateData.tripStartCoords = startCoords;
      updateData.tripStartedAt = new Date();
    }
    if (tripStatus === "completed") {
      updateData.tripEndedAt = new Date();
      const endCoords = liveTruckPos || tripEndCoords;
      if (endCoords) updateData.tripEndCoords = endCoords;
    }
    if (finalAmount !== undefined) updateData.finalAmount = finalAmount;
    if (advancePaid !== undefined) updateData.advancePaid = advancePaid;
    if (specialRequest !== undefined) updateData.specialRequest = specialRequest;
    if (assignment !== undefined) updateData.assignment = assignment;

    // Construct timeline event if status or tripStatus is updated
    const timelineUpdate: any = {};
    const displayStatus = tripStatus || status;
    
    // Skip 'finalized' as it's usually logged separately as 'Trip Approved'
    if (displayStatus && displayStatus.toLowerCase() !== "finalized") {
      // "Trip status updated to returning" says nothing a reader could not see
      // from the status chip. Where the truck is headed is the part worth keeping,
      // and for a return that also explains the empty leg the accountant is about
      // to cost.
      const warehouse = displayStatus.toLowerCase() === "returning"
        ? await (await import("../models/Warehouse.js")).default.findOne().select("city").lean()
        : null;

      const description =
        displayStatus.toLowerCase() === "returning"
          ? `Cargo delivered — running empty back to the yard${warehouse?.city ? ` at ${warehouse.city}` : ""}. The return distance is entered on the settlement.`
          : `Trip status updated to ${displayStatus}`;

      timelineUpdate.$push = {
        timeline: {
          title: displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1),
          description,
          time: new Date(),
          status: "completed"
        }
      };
    }

    const updatedBooking = await Booking.findByIdAndUpdate(
      id,
      { $set: updateData, ...timelineUpdate },
      { new: true }
    ).populate("clientId", "name email contact");

    if (!updatedBooking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }

    // Starting this trip closes the previous one — the truck reaching this
    // pickup is exactly the condition the previous trip was waiting on — and
    // promotes this trip if it was still queued.
    if (tripStatus === "started") {
      try {
        const { onTripStarted } = await import("../services/tripContinuity.js");
        await onTripStarted(String(id));
      } catch (err) {
        console.error("[Booking] Trip-start continuity failed:", err);
        throw err;
      }
    }

    // When driver marks offloading/returning → update their driverStatus so they appear available for queueing
    // repositioning counts here too: the driver is on their final unladen leg,
    // just aimed at the next job's pickup rather than the yard.
    // Suffix-aware: a multi-stop trip reports "offloading_2", and comparing that
    // to "offloading" left the driver marked on_trip — so every screen that asks
    // "can this driver take another job" said no.
    const forDriver = await Booking.findById(id).select("pickupLocations dropoffLocations").lean();
    const nextDriverStatus = driverStatusFor(
      tripStatus,
      (forDriver?.pickupLocations || []).length,
      (forDriver?.dropoffLocations || []).length
    );
    if (nextDriverStatus) {
      try {
        const Assignment = (await import("../models/Assignment.js")).default;
        const Driver = (await import("../models/Driver.js")).default;

        const assignment = await Assignment.findOne({ bookingId: id });
        if (assignment?.driverId) {
          await Driver.findByIdAndUpdate(assignment.driverId, {
            // Stored WITHOUT the stop number: which stop it is belongs to the trip.
            driverStatus: nextDriverStatus
          });
        }
      } catch (err) {
        console.error("Driver status update failed (non-critical):", err);
      }
    }

    // When a trip is fully completed, mark assignment complete and promote next queued trip
    if (tripStatus === "completed") {
      try {
        const Assignment = (await import("../models/Assignment.js")).default;
        const Driver = (await import("../models/Driver.js")).default;

        const assignment = await Assignment.findOne({ bookingId: id });
        if (assignment?.driverId) {
          await Assignment.findByIdAndUpdate(assignment._id, { queueStatus: "completed" });
          const { promoteNextForDriver } = await import("../services/tripContinuity.js");
          await promoteNextForDriver(assignment.driverId.toString());
        }
      } catch (promoteErr) {
        // NOT swallowed. Promotion is now the only mechanism that ever starts a
        // queued trip; a silent failure strands it forever with nothing to retry it.
        console.error("Auto-promote failed:", promoteErr);
        throw promoteErr;
      }

      // File the completed trip: with tax → Invoice (inv-xxx), without → Cash (cash-xxx)
      try {
        await fileCompletedBooking(updatedBooking);
      } catch (fileErr) {
        console.error("Invoice/Cash filing failed (non-critical):", fileErr);
      }
    }

    res.status(200).json({
      message: `Status updated to ${status || tripStatus}`,
      booking: updatedBooking,
    });
  } catch (error: any) {
    next(error);
  }
};

// PATCH /api/bookings/:id/trip-stats — cache the latest Trakzee GPS stats in DB
export const saveTripStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { tripStats } = req.body;
    if (!tripStats) { res.status(400).json({ message: "tripStats required" }); return; }

    const updated = await Booking.findByIdAndUpdate(
      id,
      { tripStats, tripStatsUpdatedAt: new Date() },
      { new: true }
    ).select("tripStats tripStatsUpdatedAt");

    if (!updated) { res.status(404).json({ message: "Booking not found" }); return; }
    res.status(200).json({ message: "Trip stats cached", tripStats: updated.tripStats, tripStatsUpdatedAt: updated.tripStatsUpdatedAt });
  } catch (error: any) { next(error); }
};

export const updateBooking = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Route, load and client are settled once a truck is committed to the job —
    // that truck was chosen for this route and costed against this load. The
    // price, advance and invoice number stay editable, because those are entered
    // while the trip runs; see editsBookingDetails for why the lock is on the
    // fields rather than on the endpoint.
    if (editsBookingDetails(updateData)) {
      const assigned = await Assignment.exists({ bookingId: id });
      if (assigned) {
        res.status(409).json({
          message: "A driver is already assigned to this booking — its route and cargo can no longer be changed.",
        });
        return;
      }
    }

    const updatedBooking = await Booking.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );

    if (!updatedBooking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }

    res.status(200).json({
      message: "Booking updated successfully",
      booking: updatedBooking,
    });
  } catch (error: any) {
    next(error);
  }
};

export const changeDropoffAddress = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { newPickup, newDropoff, reason, financials } = req.body;

    const booking = await Booking.findById(id);
    if (!booking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }

    const currentPickup = booking.pickupLocations?.[0];
    const currentDropoff = booking.dropoffLocations?.[0];

    const setData: any = {};

    // Handle Pickup Change
    if (newPickup && currentPickup) {
      setData["pickupLocations.0.contactPerson"] = newPickup.contactPerson || currentPickup.contactPerson;
      setData["pickupLocations.0.contactNumber"] = newPickup.contactNumber || currentPickup.contactNumber;
      setData["pickupLocations.0.address.plotNo"] = newPickup.address?.plotNo || "";
      setData["pickupLocations.0.address.street"] = newPickup.address?.street || "";
      setData["pickupLocations.0.address.city"] = newPickup.address?.city || "";
      setData["pickupLocations.0.address.lga"] = (newPickup.address as any)?.lga || "";
    }

    // Handle Dropoff Change
    if (newDropoff && currentDropoff) {

      setData["dropoffLocations.0.contactPerson"] = newDropoff.contactPerson || currentDropoff.contactPerson;
      setData["dropoffLocations.0.contactNumber"] = newDropoff.contactNumber || currentDropoff.contactNumber;
      setData["dropoffLocations.0.address.plotNo"] = newDropoff.address?.plotNo || "";
      setData["dropoffLocations.0.address.street"] = newDropoff.address?.street || "";
      setData["dropoffLocations.0.address.city"] = newDropoff.address?.city || "";
      setData["dropoffLocations.0.address.lga"] = (newDropoff.address as any)?.lga || "";
    }

    // Update finalAmount if provided
    if (financials?.newFinalAmount) {
      setData.finalAmount = financials.newFinalAmount;
    }

    const updateQuery: any = { $set: setData };

    const updatedBooking = await Booking.findByIdAndUpdate(
      id,
      updateQuery,
      { new: true }
    );

    // NOTE: this endpoint used to upsert a Settlement carrying pickupKm/dropoffKm.
    // That model assumed every trip has exactly two distances — already wrong for
    // multi-stop trips — it clobbered fuelDetails.totalDistance, and because it
    // upserted it manufactured an "Approved" settlement on a trip nobody had
    // approved. Distances belong to the accountant's leg model now (CR-VL-001).

    res.status(200).json({
      message: "Job addresses updated successfully",
      booking: updatedBooking
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Mark a truck as returning to the yard, WITH the distance it will cover.
 *
 * Ops used to set the status here and the accountant typed the kilometres later,
 * on another screen — and nothing made the second half happen, so a trip could
 * sit in "returning" with its empty run costed at nothing. One call now does
 * both, and refuses without a distance.
 */
export const markReturning = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    // The yard is not a choice: it is whatever Route Master holds, so ops cannot
    // send the truck "home" to a place that is not home. What ops DOES decide is
    // what the run costs on top of what the trip already carries.
    const { km, addAllocation, addCouncilLevy, addToll, addedBy } = req.body;

    const distance = Number(km);
    if (!Number.isFinite(distance) || distance <= 0) {
      res.status(400).json({ message: "Enter the distance of the run back to the yard." });
      return;
    }

    const booking = await Booking.findById(id)
      .select("tripId tripStatus pickupLocations dropoffLocations lastPoint")
      .lean();
    if (!booking) { res.status(404).json({ message: "Booking not found" }); return; }

    // A diverted trip is not going to the yard at all — its empty run belongs to
    // the gap onto the next job's pickup, which the accountant attributes.
    if (booking.lastPoint?.source === "reassignment") {
      res.status(400).json({ message: "This trip was diverted to another job's pickup — it is not returning to the yard." });
      return;
    }

    if (!isCargoDone(booking.tripStatus, (booking.pickupLocations || []).length, (booking.dropoffLocations || []).length)) {
      res.status(400).json({ message: "The cargo is not off yet — finish the drops before marking the return." });
      return;
    }

    const drops = booking.dropoffLocations || [];
    const from = locationLabel(drops[drops.length - 1]);
    const warehouse = await Warehouse.findOne().select("city").lean();
    const to = warehouse?.city || "";
    if (!to) {
      res.status(400).json({ message: "Set the warehouse on Route Master before recording a return." });
      return;
    }

    // Mileage and fuel rate come from the same places the accountant screen reads,
    // so a leg recorded here costs exactly what it would have cost typed there.
    const mileage = await Mileage.findOne().lean();
    const settlement = await Settlement.findOne({ bookingId: id }).lean();
    const unloaded = Number(mileage?.unloadedMileage) || 1;
    const fuelRate = Number(settlement?.fuelDetails?.fuelRate) || 0;

    const extraLegs = upsertReturnLeg(settlement?.extraLegs as any, {
      from, to, km: distance, mileage: unloaded, fuelRate, addedBy,
    });

    const legs = settlement?.fuelDetails?.legs || [];
    const { totalDistance, totalLiters } = computeLegTotals(legs as any, extraLegs as any);

    // The run home costs money the trip has not been given yet, so what ops enters
    // is ADDED to what the trip already carries rather than replacing it — the
    // allowance for the outbound leg is still owed either way.
    const money = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : 0;
    };
    const prior = settlement?.financials || ({} as any);
    const financials = {
      ...prior,
      cashAllocation: money(prior.cashAllocation) + money(addAllocation),
      councilLevy: money(prior.councilLevy) + money(addCouncilLevy),
      tollAmount: money(prior.tollAmount) + money(addToll),
      // Fuel follows the legs, so adding one has to move it.
      fuelTotal:
        (legs as any[]).reduce((n, l) => n + money(l?.amount), 0) +
        extraLegs.reduce((n, l) => n + money(l?.amount), 0),
    };

    // upsert: a trip can reach its drop before anyone has opened its settlement,
    // and the distance must not be lost because of that. NOT an approval — recording
    // a return says nothing about whether the figures have been signed off.
    await Settlement.findOneAndUpdate(
      { bookingId: id },
      {
        $set: {
          extraLegs,
          financials,
          tollAmount: financials.tollAmount,
          "fuelDetails.legs": legs,
          "fuelDetails.fuelRate": fuelRate,
          "fuelDetails.totalDistance": totalDistance,
          "fuelDetails.totalLiters": totalLiters,
        },
        $setOnInsert: { status: "Pending" },
      },
      { upsert: true }
    );

    const updated = await Booking.findByIdAndUpdate(
      id,
      {
        $set: { tripStatus: "returning" },
        $push: {
          timeline: {
            title: "Returning",
            description:
              `Cargo delivered — running empty ${from || "from the drop"} to ${to} (${distance} km).` +
              (money(addAllocation) || money(addCouncilLevy) || money(addToll)
                ? ` Added for the return: allowance K${money(addAllocation).toLocaleString()}, levy K${money(addCouncilLevy).toLocaleString()}, toll K${money(addToll).toLocaleString()}.`
                : ""),
            time: new Date(),
            status: "completed",
          },
        },
      },
      { new: true }
    );

    const assignment = await Assignment.findOne({ bookingId: id }).select("driverId").lean();
    if (assignment?.driverId) {
      await Driver.findByIdAndUpdate(assignment.driverId, { driverStatus: "returning" });
    }

    res.status(200).json({ message: "Return recorded.", booking: updated, extraLegs, financials });
  } catch (error: any) { next(error); }
};
