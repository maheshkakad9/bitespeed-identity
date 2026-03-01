import { Router } from "express";
import { prisma } from "../prisma";

const router = Router();

router.post("/", async (req, res) => {
  const { email, phoneNumber } = req.body;

  if (!email && !phoneNumber) {
    return res.status(400).json({ error: "Email or phoneNumber required" });
  }

  // Step 1: Find matching contacts
  const existingContacts = await prisma.contact.findMany({
    where: {
      OR: [
        { email: email || undefined },
        { phoneNumber: phoneNumber || undefined },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  // Step 2: If no contacts found -> create primary
  if (existingContacts.length === 0) {
    const newContact = await prisma.contact.create({
      data: {
        email,
        phoneNumber,
        linkPrecedence: "primary",
      },
    });

    return res.status(200).json({
      contact: {
        primaryContatctId: newContact.id,
        emails: email ? [email] : [],
        phoneNumbers: phoneNumber ? [phoneNumber] : [],
        secondaryContactIds: [],
      },
    });
  }

  // Step 3: Find all related contacts
  const contactIds = new Set<number>();

  existingContacts.forEach((c) => {
    contactIds.add(c.id);
    if (c.linkedId) contactIds.add(c.linkedId);
  });

  const allRelated = await prisma.contact.findMany({
    where: {
      OR: [
        { id: { in: Array.from(contactIds) } },
        { linkedId: { in: Array.from(contactIds) } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  // Step 4: Determine primary (oldest)
  let primary = allRelated.find((c) => c.linkPrecedence === "primary");

  if (!primary) {
    primary = allRelated[0];
  }

  // Step 5: If multiple primaries -> merge them
  const primaries = allRelated.filter(
    (c) => c.linkPrecedence === "primary"
  );

  if (primaries.length > 1) {
    const oldestPrimary = primaries.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    )[0];

    for (const p of primaries) {
      if (p.id !== oldestPrimary.id) {
        await prisma.contact.update({
          where: { id: p.id },
          data: {
            linkedId: oldestPrimary.id,
            linkPrecedence: "secondary",
          },
        });
      }
    }

    primary = oldestPrimary;
  }

  // Step 6: Check if new combination exists
  const combinationExists = allRelated.some(
    (c) => c.email === email && c.phoneNumber === phoneNumber
  );

  if (!combinationExists) {
    await prisma.contact.create({
      data: {
        email,
        phoneNumber,
        linkedId: primary.id,
        linkPrecedence: "secondary",
      },
    });
  }
  // Step 7: Fetch final updated list
  const finalContacts = await prisma.contact.findMany({
    where: {
      OR: [
        { id: primary.id },
        { linkedId: primary.id },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  const emails = Array.from(
    new Set(finalContacts.map((c) => c.email).filter(Boolean))
  ) as string[];

  const phoneNumbers = Array.from(
    new Set(finalContacts.map((c) => c.phoneNumber).filter(Boolean))
  ) as string[];

  const secondaryContactIds = finalContacts
    .filter((c) => c.linkPrecedence === "secondary")
    .map((c) => c.id);

  return res.status(200).json({
    contact: {
      primaryContatctId: primary.id,
      emails,
      phoneNumbers,
      secondaryContactIds,
    },
  });
});

export default router;