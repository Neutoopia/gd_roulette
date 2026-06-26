import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { attempts } from "@/db/schema";

/**
 * GET /api/export
 * Returns the user's full attempt history as a downloadable JSON file.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const rows = await db.query.attempts.findMany({
    where: eq(attempts.userId, session.user.id),
    with: { level: true },
    orderBy: [desc(attempts.spunAt)],
  });

  const exportData = {
    exportedAt: new Date().toISOString(),
    user: { email: session.user.email, name: session.user.name },
    totalAttempts: rows.length,
    attempts: rows.map((a) => ({
      id:             a.id,
      status:         a.status,
      spunAt:         a.spunAt,
      resolvedAt:     a.resolvedAt,
      progressNote:   a.progressNote,
      bestPercent:    a.bestPercent,
      attemptCount:   a.attemptCount,
      timeSpentMin:   a.timeSpentMin,
      requestedDiff:  a.requestedDiff,
      requestedTier:  a.requestedTier,
      level: {
        gdId:       a.level.gdId,
        name:       a.level.name,
        author:     a.level.author,
        difficulty: a.level.difficulty,
        stars:      a.level.stars,
        ratingTier: a.level.ratingTier,
        downloads:  a.level.downloads,
        likes:      a.level.likes,
        length:     a.level.length,
        objects:    a.level.objects,
        songName:   a.level.songName,
      },
    })),
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      "Content-Type":        "application/json",
      "Content-Disposition": `attachment; filename="gd-roulette-records-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
