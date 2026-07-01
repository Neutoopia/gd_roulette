import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { levels, attempts } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";
import { dbError } from "@/lib/api-error";

/**
 * POST /api/levels/assign
 * Body: { levelId }  — the internal `levels.id` (not the GD level ID)
 *
 * Lets a user pick a specific level from search results rather than
 * spinning randomly. Same guest/logged-in split as /api/levels/random:
 * guests get the level back with no DB write, logged-in users get a
 * real pending attempt.
 */
export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  let body: { levelId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!body.levelId) {
    return NextResponse.json({ error: "levelId is required." }, { status: 400 });
  }

  if (userId) {
    try {
      const pending = await db.query.attempts.findFirst({
        where: and(eq(attempts.userId, userId), eq(attempts.status, "pending")),
        with: { level: true },
      });
      if (pending) {
        return NextResponse.json({
          error: "You already have a level in progress. Resolve it before picking a new one.",
          attempt: pending,
        }, { status: 409 });
      }
    } catch (err) {
      return dbError("levels/assign/check-pending", err);
    }
  }

  let level;
  try {
    [level] = await db.select().from(levels).where(eq(levels.id, body.levelId)).limit(1);
  } catch (err) {
    return dbError("levels/assign/fetch-level", err);
  }
  if (!level) {
    return NextResponse.json({ error: "Level not found." }, { status: 404 });
  }

  if (!userId) {
    return NextResponse.json({
      attempt: { id: null, status: "pending", level, guest: true },
      guest: true,
      note: "Log in or create an account to save progress on this level.",
    });
  }

  try {
    const attemptId = createId();
    await db.insert(attempts).values({
      id: attemptId, userId, levelId: level.id, status: "pending",
      requestedDiff: level.difficulty, requestedTier: level.ratingTier,
    });

    const attempt = await db.query.attempts.findFirst({
      where: eq(attempts.id, attemptId),
      with: { level: true },
    });

    return NextResponse.json({ attempt }, { status: 201 });
  } catch (err) {
    return dbError("levels/assign/create-attempt", err);
  }
}
