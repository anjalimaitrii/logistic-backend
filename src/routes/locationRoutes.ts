import { Router } from "express";
import { getAll, create, remove } from "../controllers/locationController.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

// Clients book too, and a client whose pickup town is missing has to be able to
// name it — so reading and adding are open to any logged-in user.
router.get("/", getAll);
router.post("/", create);
// Removing one takes it off everybody's form, including entries somebody else
// added. That is an ops decision, not a customer's.
router.delete("/:id", requireRole("admin"), remove);

export default router;
