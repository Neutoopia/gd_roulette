import { NextResponse } from "next/server";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { levels, attempts } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";
import { dbError } from "@/lib/api-error";

export async function POST(req: Request) {
  // 1. Auth
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const userId = session.user.id;

  // 2. Return existing pending attempt if one exists
  try {
    const pending = await db.query.attempts.findFirst({
      where: and(eq(attempts.userId, userId), eq(attempts.status, "pending")),
      with: { level: true },
    });
    if (pending)
      return NextResponse.json({ attempt: pending, alreadyPending: true });
  } catch (err) {
    return dbError("levels/random/check-pending", err);
  }

  // 3. Parse optional filter body
  let body: { difficulty?: string; ratingTier?: string; excludeCompleted?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // No body is fine — all filters are optional
  }

  const { difficulty, ratingTier, excludeCompleted = true } = body;

  // 4. Build WHERE conditions
  const conditions = [];
  if (difficulty && difficulty !== "any") conditions.push(eq(levels.difficulty, difficulty));
  if (ratingTier && ratingTier !== "any")  conditions.push(eq(levels.ratingTier, ratingTier));

  if (excludeCompleted) {
    try {
      const completedRows = await db
        .select({ levelId: attempts.levelId })
        .from(attempts)
        .where(and(eq(attempts.userId, userId), eq(attempts.status, "completed")));
      const completedIds = completedRows.map((r) => r.levelId);
      if (completedIds.length > 0) conditions.push(notInArray(levels.id, completedIds));
    } catch (err) {
      return dbError("levels/random/fetch-completed", err);
    }
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // 5. Count candidates
  let count: number;
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(levels)
      .where(where);
    count = row?.count ?? 0;
  } catch (err) {
    return dbError("levels/random/count", err);
  }

  if (count === 0) {
    const hasLevels = await db
      .select({ count: sql<number>`count(*)` })
      .from(levels)
      .then(([r]) => (r?.count ?? 0) > 0)
      .catch(() => null);

    if (hasLevels === false) {
      return NextResponse.json(
        {
          error:
            "The level cache is empty. Run the sync job first: POST /api/sync-levels with your SYNC_SECRET bearer token.",
        },
        { status: 404 }
      );
    }
    return NextResponse.json(
      {
        error:
          "No levels match those filters. Try a different difficulty or rating tier, or uncheck 'skip completed'.",
      },
      { status: 404 }
    );
  }

  // 6. Pick a random level and create the attempt
  try {
    const skip = Math.floor(Math.random() * count);
    const [level] = await db.select().from(levels).where(where).limit(1).offset(skip);

    if (!level) {
      // Race condition — count changed between step 5 and 6
      return NextResponse.json(
        { error: "Failed to select a level — please try again." },
        { status: 500 }
      );
    }

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
  } catch (err) {
    return dbError("levels/random/create-attempt", err);
  }
}
