import { NextResponse } from "next/server";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { levels, attempts } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";
import { dbError } from "@/lib/api-error";

/**
 * POST /api/levels/random
 *
 * Auth is OPTIONAL. Anyone can spin and receive a random level.
 *   - Logged-in users: a real "pending" attempt row is created, tied to
 *     their account, so it shows up in history/stats.
 *   - Guests: the level is returned directly with no DB attempt record.
 *     Progress tracking requires an account (attempts routes require auth).
 *
 * Random selection is STRATIFIED BY DIFFICULTY when no specific difficulty
 * filter is given: we first pick a difficulty tier uniformly at random
 * from tiers that have at least one matching level, then pick a random
 * level within that tier. This means Easy Demon (which might have far
 * fewer cached levels than Hard) has the same chance of being chosen as
 * any other tier — a flat random pick over all rows would otherwise favor
 * whichever tier has the most levels in the cache.
 */

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  // Logged-in users: return their existing pending attempt if any.
  if (userId) {
    try {
      const pending = await db.query.attempts.findFirst({
        where: and(eq(attempts.userId, userId), eq(attempts.status, "pending")),
        with: { level: true },
      });
      if (pending) return NextResponse.json({ attempt: pending, alreadyPending: true });
    } catch (err) {
      return dbError("levels/random/check-pending", err);
    }
  }

  let body: { difficulty?: string; ratingTier?: string; excludeCompleted?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // no body is fine
  }
  const { difficulty, ratingTier, excludeCompleted = true } = body;

  // Base filter conditions shared across all difficulty tiers
  const baseConditions = [];
  if (ratingTier && ratingTier !== "any") baseConditions.push(eq(levels.ratingTier, ratingTier));

  if (userId && excludeCompleted) {
    try {
      const completedRows = await db
        .select({ levelId: attempts.levelId })
        .from(attempts)
        .where(and(eq(attempts.userId, userId), eq(attempts.status, "completed")));
      const completedIds = completedRows.map((r) => r.levelId);
      if (completedIds.length > 0) baseConditions.push(notInArray(levels.id, completedIds));
    } catch (err) {
      return dbError("levels/random/fetch-completed", err);
    }
  }

  try {
    let chosenLevel;

    if (difficulty && difficulty !== "any") {
      // Specific difficulty requested — plain random pick within it.
      const where = and(eq(levels.difficulty, difficulty), ...baseConditions);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(levels).where(where);
      if (!count) {
        return NextResponse.json(
          { error: "No levels match those filters. Try a different difficulty/tier, or run a sync to add more levels." },
          { status: 404 }
        );
      }
      const skip = Math.floor(Math.random() * count);
      [chosenLevel] = await db.select().from(levels).where(where).limit(1).offset(skip);
    } else {
      // No difficulty specified — stratify: find which tiers actually
      // have matching levels, pick a tier uniformly, then pick within it.
      const tierCounts = await db
        .select({ difficulty: levels.difficulty, count: sql<number>`count(*)` })
        .from(levels)
        .where(baseConditions.length > 0 ? and(...baseConditions) : undefined)
        .groupBy(levels.difficulty);

      const availableTiers = tierCounts.filter((t) => t.count > 0).map((t) => t.difficulty);

      if (availableTiers.length === 0) {
        return NextResponse.json(
          { error: "No levels match those filters. Try different filters, or run a sync to add more levels." },
          { status: 404 }
        );
      }

      const pickedTier = availableTiers[Math.floor(Math.random() * availableTiers.length)];
      const where = and(eq(levels.difficulty, pickedTier), ...baseConditions);
      const tierCount = tierCounts.find((t) => t.difficulty === pickedTier)?.count ?? 0;
      const skip = Math.floor(Math.random() * tierCount);
      [chosenLevel] = await db.select().from(levels).where(where).limit(1).offset(skip);
    }

    if (!chosenLevel) {
      return NextResponse.json({ error: "Failed to select a level — please try again." }, { status: 500 });
    }

    // Guest: return the level directly, no DB write.
    if (!userId) {
      return NextResponse.json({
        attempt: {
          id: null,
          status: "pending",
          level: chosenLevel,
          guest: true,
        },
        guest: true,
        note: "Log in or create an account to save progress on this level.",
      });
    }

    // Logged-in: create a real attempt.
    const attemptId = createId();
    await db.insert(attempts).values({
      id: attemptId, userId, levelId: chosenLevel.id, status: "pending",
      requestedDiff: difficulty ?? "any", requestedTier: ratingTier ?? "any",
    });

    const attempt = await db.query.attempts.findFirst({
      where: eq(attempts.id, attemptId),
      with: { level: true },
    });

    return NextResponse.json({ attempt }, { status: 201 });
  } catch (err) {
    return dbError("levels/random", err);
  }
}
