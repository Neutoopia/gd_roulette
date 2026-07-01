import { NextResponse } from "next/server";
import { and, asc, desc, eq, gte, like, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { levels } from "@/db/schema";
import { dbError } from "@/lib/api-error";

const SORT_MAP = {
  likes_desc:     desc(levels.likes),
  likes_asc:      asc(levels.likes),
  downloads_desc: desc(levels.downloads),
  downloads_asc:  asc(levels.downloads),
  date_desc:      desc(levels.firstSeenAt), // "newest" — see schema note on firstSeenAt
  date_asc:       asc(levels.firstSeenAt),  // "oldest"
  stars_desc:     desc(levels.stars),
  stars_asc:      asc(levels.stars),
  name_asc:       asc(levels.name),
} as const;

type SortKey = keyof typeof SORT_MAP;
const VALID_SORTS = new Set(Object.keys(SORT_MAP));

/**
 * GET /api/levels/search
 * No auth required — browsing the level pool is open to guests.
 *
 * Query params (all optional):
 *   q            — text search on level name or author
 *   difficulty   — exact match, e.g. "Hard Demon"
 *   ratingTier   — exact match, e.g. "epic"
 *   minLikes     — integer floor on likes
 *   minDownloads — integer floor on downloads
 *   sort         — one of the SORT_MAP keys above (default: likes_desc)
 *   page         — 0-indexed (default 0)
 *   limit        — page size, max 50 (default 20)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const q            = searchParams.get("q")?.trim();
  const difficulty   = searchParams.get("difficulty");
  const ratingTier   = searchParams.get("ratingTier");
  const minLikesRaw  = searchParams.get("minLikes");
  const minDlRaw     = searchParams.get("minDownloads");
  const sortRaw      = searchParams.get("sort") ?? "likes_desc";
  const pageRaw      = searchParams.get("page") ?? "0";
  const limitRaw     = searchParams.get("limit") ?? "20";

  if (!VALID_SORTS.has(sortRaw)) {
    return NextResponse.json(
      { error: `Invalid sort. Must be one of: ${[...VALID_SORTS].join(", ")}.` },
      { status: 400 }
    );
  }
  const sort = sortRaw as SortKey;

  const page  = Math.max(0, parseInt(pageRaw) || 0);
  const limit = Math.min(50, Math.max(1, parseInt(limitRaw) || 20));

  const minLikes = minLikesRaw ? parseInt(minLikesRaw) : undefined;
  const minDl    = minDlRaw ? parseInt(minDlRaw) : undefined;
  if (minLikesRaw && (minLikes === undefined || isNaN(minLikes)))
    return NextResponse.json({ error: "minLikes must be a number." }, { status: 400 });
  if (minDlRaw && (minDl === undefined || isNaN(minDl)))
    return NextResponse.json({ error: "minDownloads must be a number." }, { status: 400 });

  const conditions = [];
  if (q && q.length >= 2) {
    conditions.push(or(like(levels.name, `%${q}%`), like(levels.author, `%${q}%`)));
  }
  if (difficulty && difficulty !== "any") conditions.push(eq(levels.difficulty, difficulty));
  if (ratingTier && ratingTier !== "any") conditions.push(eq(levels.ratingTier, ratingTier));
  if (minLikes !== undefined) conditions.push(gte(levels.likes, minLikes));
  if (minDl    !== undefined) conditions.push(gte(levels.downloads, minDl));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  try {
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(levels).where(where);

    const results = await db
      .select()
      .from(levels)
      .where(where)
      .orderBy(SORT_MAP[sort])
      .limit(limit)
      .offset(page * limit);

    return NextResponse.json({
      levels: results,
      total: count ?? 0,
      page,
      limit,
      hasMore: (page + 1) * limit < (count ?? 0),
    });
  } catch (err) {
    return dbError("levels/search", err);
  }
}
