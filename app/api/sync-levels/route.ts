import { NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/db/client";
import { levels } from "@/db/schema";
import { fetchLevelPool } from "@/lib/gd-api";
import { eq } from "drizzle-orm";

/**
 * POST /api/sync-levels
 * Protected by SYNC_SECRET bearer token.
 *
 * Calls the GD servers, parses the response, and upserts
 * levels into the local cache. Run this periodically, not on every user request.
 *
 * Example (local dev):
 *   curl -X POST http://localhost:3000/api/sync-levels \
 *     -H "Authorization: Bearer <SYNC_SECRET>"
 *
 * On Vercel, add a vercel.json cron entry that calls this daily.
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.SYNC_SECRET;
  if (!secret) return NextResponse.json({ error: "SYNC_SECRET not configured" }, { status: 500 });
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pool = await fetchLevelPool();
  if (pool.length === 0)
    return NextResponse.json({ synced: 0, note: "GD server returned no data" });

  let synced = 0;
  for (const lvl of pool) {
    const [existing] = await db.select({ id: levels.id }).from(levels).where(eq(levels.gdId, lvl.gdId)).limit(1);
    if (existing) {
      await db.update(levels).set({
        name:         lvl.name,
        author:       lvl.author,
        difficulty:   lvl.difficulty,
        isDemon:      lvl.isDemon,
        stars:        lvl.stars,
        ratingTier:   lvl.ratingTier,
        downloads:    lvl.downloads,
        likes:        lvl.likes,
        length:       lvl.length,
        objects:      lvl.objects,
        songName:     lvl.songName,
        songAuthor:   lvl.songAuthor,
        description:  lvl.description,
        gameVersion:  lvl.gameVersion,
        lastSyncedAt: new Date(),
      }).where(eq(levels.gdId, lvl.gdId));
    } else {
      await db.insert(levels).values({
        id:           createId(),
        gdId:         lvl.gdId,
        name:         lvl.name,
        author:       lvl.author,
        difficulty:   lvl.difficulty,
        isDemon:      lvl.isDemon,
        stars:        lvl.stars,
        ratingTier:   lvl.ratingTier,
        downloads:    lvl.downloads,
        likes:        lvl.likes,
        length:       lvl.length,
        objects:      lvl.objects,
        songName:     lvl.songName,
        songAuthor:   lvl.songAuthor,
        description:  lvl.description,
        gameVersion:  lvl.gameVersion,
      });
    }
    synced++;
  }

  return NextResponse.json({ synced });
}
