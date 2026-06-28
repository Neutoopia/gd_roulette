import { NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/db/client";
import { levels } from "@/db/schema";
import { fetchLevelPool } from "@/lib/gd-api";
import { eq } from "drizzle-orm";

/**
 * GET /api/sync-levels
 *
 * Fetches levels from Pointercrate (demons) + static seed (non-demons)
 * and upserts them into the local Turso/SQLite cache.
 *
 * Protected by bearer token. Accepts either:
 *   - SYNC_SECRET  (your manual secret, for curl / cron-job.org)
 *   - CRON_SECRET  (auto-set by Vercel, for Vercel Cron)
 *
 * Manual trigger:
 *   curl https://your-app.vercel.app/api/sync-levels \
 *     -H "Authorization: Bearer <SYNC_SECRET>"
 */
async function handleSync(req: Request): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader    = req.headers.get("authorization");
  const syncSecret    = process.env.SYNC_SECRET;
  const cronSecret    = process.env.CRON_SECRET;

  if (!syncSecret) {
    console.error("[sync-levels] SYNC_SECRET is not set.");
    return NextResponse.json(
      { error: "SYNC_SECRET is not configured. Add it to your environment variables." },
      { status: 500 }
    );
  }

  const isManual     = authHeader === `Bearer ${syncSecret}`;
  const isVercelCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isManual && !isVercelCron) {
    return NextResponse.json(
      { error: "Unauthorized. Send your SYNC_SECRET as: Authorization: Bearer <secret>" },
      { status: 401 }
    );
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────
  console.log("[sync-levels] Starting level pool fetch…");
  let pool: Awaited<ReturnType<typeof fetchLevelPool>>;
  try {
    pool = await fetchLevelPool();
  } catch (err) {
    console.error("[sync-levels] fetchLevelPool threw:", err);
    return NextResponse.json(
      { error: "Failed to fetch levels. Pointercrate may be temporarily down. Try again later." },
      { status: 502 }
    );
  }

  if (!pool || pool.length === 0) {
    console.warn("[sync-levels] No levels returned.");
    return NextResponse.json(
      { synced: 0, failed: 0, note: "No levels were returned. Nothing was changed." },
      { status: 200 }
    );
  }

  console.log(`[sync-levels] Upserting ${pool.length} levels…`);

  // ── Upsert ────────────────────────────────────────────────────────────────
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const lvl of pool) {
    try {
      const [existing] = await db
        .select({ id: levels.id })
        .from(levels)
        .where(eq(levels.gdId, lvl.gdId))
        .limit(1);

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
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`gdId=${lvl.gdId} (${lvl.name}): ${msg}`);
      console.error(`[sync-levels] Failed to upsert gdId=${lvl.gdId}:`, err);
    }
  }

  console.log(`[sync-levels] Done. synced=${synced} failed=${failed}`);

  return NextResponse.json({
    synced,
    failed,
    ...(errors.length > 0 && { errors }),
  });
}

// Support both GET (Vercel Cron, cron-job.org) and POST (manual curl)
export const GET  = handleSync;
export const POST = handleSync;
