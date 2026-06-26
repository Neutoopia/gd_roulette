import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { attempts, levels } from "@/db/schema";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const userId = session.user.id;

  const [totals] = await db
    .select({
      total:     sql<number>`count(*)`,
      completed: sql<number>`sum(case when ${attempts.status} = 'completed' then 1 else 0 end)`,
      skipped:   sql<number>`sum(case when ${attempts.status} = 'skipped'   then 1 else 0 end)`,
      abandoned: sql<number>`sum(case when ${attempts.status} = 'abandoned' then 1 else 0 end)`,
      pending:   sql<number>`sum(case when ${attempts.status} = 'pending'   then 1 else 0 end)`,
      totalAttempts:  sql<number>`sum(${attempts.attemptCount})`,
      totalTimeMins:  sql<number>`sum(${attempts.timeSpentMin})`,
    })
    .from(attempts)
    .where(eq(attempts.userId, userId));

  // Completions by difficulty
  const byDiff = await db
    .select({
      difficulty: levels.difficulty,
      count: sql<number>`count(*)`,
    })
    .from(attempts)
    .innerJoin(levels, eq(attempts.levelId, levels.id))
    .where(and(eq(attempts.userId, userId), eq(attempts.status, "completed")))
    .groupBy(levels.difficulty);

  // Completions by rating tier
  const byTier = await db
    .select({
      ratingTier: levels.ratingTier,
      count: sql<number>`count(*)`,
    })
    .from(attempts)
    .innerJoin(levels, eq(attempts.levelId, levels.id))
    .where(and(eq(attempts.userId, userId), eq(attempts.status, "completed")))
    .groupBy(levels.ratingTier);

  const resolved = (totals.completed ?? 0) + (totals.skipped ?? 0);
  const completionRate = resolved > 0 ? (totals.completed ?? 0) / resolved : 0;

  return NextResponse.json({
    total:        totals.total ?? 0,
    completed:    totals.completed ?? 0,
    skipped:      totals.skipped ?? 0,
    abandoned:    totals.abandoned ?? 0,
    pending:      totals.pending ?? 0,
    totalAttempts: totals.totalAttempts ?? 0,
    totalTimeMins: totals.totalTimeMins ?? 0,
    completionRate,
    byDifficulty: byDiff,
    byRatingTier: byTier,
  });
}
