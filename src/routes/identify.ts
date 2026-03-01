import { Router } from "express";
import { prisma } from "../prisma";

const router = Router();

router.post("/", async (req, res) => {
  return res.status(200).json({ message: "Identify endpoint working" });
});

export default router;