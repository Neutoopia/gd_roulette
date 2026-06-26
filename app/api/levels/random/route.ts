import { NextResponse } from "next/server";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { levels, attempts } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";

/**
 * POST /api/levels/random
 * Body: { difficulty?, ratingTier?, excludeCompleted? }
 *
 * Picks a random level from the cache matching the filters,
 * then creates a PENDING attempt for the user.
 *
 * If the user already has a pending attempt, returns it
 * (can't spin while a level is still in progress).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const userId = session.user.id;

  // If there's already a pending attempt, return it
  const pending = await db.query.attempts.findFirst({
    where: and(eq(attempts.userId, userId), eq(attempts.status, "pending")),
    with: { level: true },
  });
  if (pending)
    return NextResponse.json({ attempt: pending, alreadyPending: true });

  let body: {
    difficulty?: string;
    ratingTier?: string;
    excludeCompleted?: boolean;
  } = {};
  try { body = await req.json(); } catch { /* no body is fine */ }

  const { difficulty, ratingTier, excludeCompleted = true } = body;

  // Build filter conditions
  const conditions = [];
  if (difficulty && difficulty !== "any") {
    conditions.push(eq(levels.difficulty, difficulty));
  }
  if (ratingTier && ratingTier !== "any") {
    conditions.push(eq(levels.ratingTier, ratingTier));
  }

  // Exclude levels the user has already completed (optional)
  if (excludeCompleted) {
    const completedRows = await db
      .select({ levelId: attempts.levelId })
      .from(attempts)
      .where(and(eq(attempts.userId, userId), eq(attempts.status, "completed")));

    const completedIds = completedRows.map((r) => r.levelId);
    if (completedIds.length > 0) {
      conditions.push(notInArray(levels.id, completedIds));
    }
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Count candidates
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(levels)
    .where(where);

  if (!count || count === 0)
    return NextResponse.json(
      { error: "No levels found for those filters. Try a different difficulty or rating, or run the sync job to populate the level cache." },
      { status: 404 }
    );

  // Pick randomly
  const skip = Math.floor(Math.random() * count);
  const [level] = await db.select().from(levels).where(where).limit(1).offset(skip);

  // Create the attempt
  const attemptId = createId();
  await db.insert(attempts).values({
    id:            attemptId,
    userId,
    levelId:       level.id,
    status:        "pending",
    requestedDiff: difficulty ?? "any",
    requestedTier: ratingTier ?? "any",
  });

  const attempt = await db.query.attempts.findFirst({
    where: eq(attempts.id, attemptId),
    with: { level: true },
  });

  return NextResponse.json({ attempt }, { status: 201 });
}
