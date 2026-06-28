import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { attempts } from "@/db/schema";
import { dbError } from "@/lib/api-error";

export async function GET() {
  // 1. Auth
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  // 2. Fetch all attempts with their levels
  let rows;
  try {
    rows = await db.query.attempts.findMany({
      where: eq(attempts.userId, session.user.id),
      with: { level: true },
      orderBy: [desc(attempts.spunAt)],
    });
  } catch (err) {
    return dbError("export/fetch", err);
  }

  // 3. Build the export payload
  const exportData = {
    exportedAt:    new Date().toISOString(),
    user:          { email: session.user.email, name: session.user.name ?? null },
    totalAttempts: rows.length,
    attempts: rows.map((a) => ({
      id:            a.id,
      status:        a.status,
      spunAt:        a.spunAt,
      resolvedAt:    a.resolvedAt,
      progressNote:  a.progressNote,
      bestPercent:   a.bestPercent,
      attemptCount:  a.attemptCount,
      timeSpentMin:  a.timeSpentMin,
      requestedDiff: a.requestedDiff,
      requestedTier: a.requestedTier,
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

  // 4. Serialize and return as a file download
  let json: string;
  try {
    json = JSON.stringify(exportData, null, 2);
  } catch (err) {
    console.error("[export/serialize]", err);
    return NextResponse.json(
      { error: "Failed to serialize export data." },
      { status: 500 }
    );
  }

  const filename = `gd-roulette-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(json, {
    status: 200,
    headers: {
      "Content-Type":        "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
