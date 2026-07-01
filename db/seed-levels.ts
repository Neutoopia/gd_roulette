/**
 * Local seed script — populates the level cache directly against Turso.
 * Runs on your machine (no Vercel timeout limit), so it can process the
 * full SYNC_JOBS list in one go.
 *
 * Usage:
 *   npx tsx --env-file=.env.local db/seed-levels.ts
 *
 * Make sure .env.local has DATABASE_URL + DATABASE_AUTH_TOKEN pointing
 * at Turso (not the local file), or you'll just seed your local dev.db.
 */
import "dotenv/config";
import { db } from "./client";
import { levels } from "./schema";
import { eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { SYNC_JOBS, searchGdLevels } from "../lib/gd-api";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(`\n🌱 GD Roulette seed — ${SYNC_JOBS.length} buckets\n`);

  const seen = new Set<number>();
  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < SYNC_JOBS.length; i++) {
    const job = SYNC_JOBS[i];
    process.stdout.write(
      `[${String(i + 1).padStart(3)}/${SYNC_JOBS.length}] type=${job.type} diff=${String(job.diff).padStart(3)} demonFilter=${job.demonFilter ?? "-"} page=${job.page ?? 0} ... `
    );

    const results = await searchGdLevels(job);
    let jobSynced = 0;

    for (const lvl of results) {
      if (seen.has(lvl.gdId)) { skipped++; continue; }
      seen.add(lvl.gdId);

      try {
        const [existing] = await db.select({ id: levels.id }).from(levels).where(eq(levels.gdId, lvl.gdId)).limit(1);

        if (existing) {
          await db.update(levels).set({
            name: lvl.name, author: lvl.author, difficulty: lvl.difficulty,
            isDemon: lvl.isDemon, stars: lvl.stars, ratingTier: lvl.ratingTier,
            downloads: lvl.downloads, likes: lvl.likes, length: lvl.length,
            objects: lvl.objects, songName: lvl.songName, songAuthor: lvl.songAuthor,
            description: lvl.description, gameVersion: lvl.gameVersion,
            lastSyncedAt: new Date(),
          }).where(eq(levels.gdId, lvl.gdId));
        } else {
          await db.insert(levels).values({
            id: createId(), gdId: lvl.gdId, name: lvl.name, author: lvl.author,
            difficulty: lvl.difficulty, isDemon: lvl.isDemon, stars: lvl.stars,
            ratingTier: lvl.ratingTier, downloads: lvl.downloads, likes: lvl.likes,
            length: lvl.length, objects: lvl.objects, songName: lvl.songName,
            songAuthor: lvl.songAuthor, description: lvl.description, gameVersion: lvl.gameVersion,
          });
        }
        jobSynced++;
        synced++;
      } catch (err) {
        failed++;
        console.warn(`\n  ✗ gdId=${lvl.gdId}:`, (err as Error).message);
      }
    }

    console.log(`${jobSynced}/${results.length} saved`);
    await sleep(results.length === 0 ? 2000 : 600);
  }

  console.log(`\n✅ Done.`);
  console.log(`   Upserted : ${synced}`);
  console.log(`   Dupes    : ${skipped}`);
  console.log(`   Failed   : ${failed}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
