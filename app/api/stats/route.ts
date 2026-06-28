import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { attempts, levels } from "@/db/schema";
import { dbError } from "@/lib/api-error";

export async function GET() {
  // 1. Auth
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const userId = session.user.id;

  // 2. Aggregate totals
  let totals;
  try {
    [totals] = await db
      .select({
        total:          sql<number>`count(*)`,
        completed:      sql<number>`sum(case when ${attempts.status} = 'completed' then 1 else 0 end)`,
        skipped:        sql<number>`sum(case when ${attempts.status} = 'skipped'   then 1 else 0 end)`,
        abandoned:      sql<number>`sum(case when ${attempts.status} = 'abandoned' then 1 else 0 end)`,
        pending:        sql<number>`sum(case when ${attempts.status} = 'pending'   then 1 else 0 end)`,
        totalAttempts:  sql<number>`sum(${attempts.attemptCount})`,
        totalTimeMins:  sql<number>`sum(${attempts.timeSpentMin})`,
      })
      .from(attempts)
      .where(eq(attempts.userId, userId));
  } catch (err) {
    return dbError("stats/totals", err);
  }

  // 3. Completions by difficulty
  let byDiff;
  try {
    byDiff = await db
      .select({ difficulty: levels.difficulty, count: sql<number>`count(*)` })
      .from(attempts)
      .innerJoin(levels, eq(attempts.levelId, levels.id))
      .where(and(eq(attempts.userId, userId), eq(attempts.status, "completed")))
      .groupBy(levels.difficulty);
  } catch (err) {
    return dbError("stats/by-difficulty", err);
  }

  // 4. Completions by rating tier
  let byTier;
  try {
    byTier = await db
      .select({ ratingTier: levels.ratingTier, count: sql<number>`count(*)` })
      .from(attempts)
      .innerJoin(levels, eq(attempts.levelId, levels.id))
      .where(and(eq(attempts.userId, userId), eq(attempts.status, "completed")))
      .groupBy(levels.ratingTier);
  } catch (err) {
    return dbError("stats/by-tier", err);
  }

  const completed = totals?.completed ?? 0;
  const skipped   = totals?.skipped   ?? 0;
  const resolved  = completed + skipped;

  return NextResponse.json({
    total:         totals?.total         ?? 0,
    completed,
    skipped,
    abandoned:     totals?.abandoned     ?? 0,
    pending:       totals?.pending       ?? 0,
    totalAttempts: totals?.totalAttempts ?? 0,
    totalTimeMins: totals?.totalTimeMins ?? 0,
    completionRate: resolved > 0 ? completed / resolved : 0,
    byDifficulty:  byDiff,
    byRatingTier:  byTier,
  });
}
