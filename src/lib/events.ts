import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./prisma";
import { normalizeSlug } from "./slugs";

const quickEventInput = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().default(""),
});

export async function createDraftEvent(input: { photographerId: string; title: unknown; description?: unknown }) {
  const parsed = quickEventInput.safeParse({ title: input.title, description: input.description });
  if (!parsed.success) throw new Error("Event name is required");
  const base = normalizeSlug(parsed.data.title) || "event";

  for (let suffix = 0; suffix < 100; suffix += 1) {
    const slug = suffix === 0 ? base : `${base}-${suffix + 1}`;
    try {
      return await prisma.event.create({
        data: {
          photographerId: input.photographerId,
          title: parsed.data.title,
          description: parsed.data.description || null,
          slug,
          accessCode: crypto.randomUUID().slice(0, 8),
          status: "DRAFT",
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    }
  }
  throw new Error("Unable to create a unique event URL");
}
