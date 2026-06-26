/**
 * Geometry Dash level data adapter.
 *
 * Talks directly to boomlings.com (the official GD server) using the
 * same undocumented API that the game itself uses. This is what GDBrowser
 * does internally — we just cut out the middleman.
 *
 * GD's API returns pipe/tilde-separated key=value strings that need
 * parsing. We do that here and return clean typed objects.
 *
 * IMPORTANT: only call this from the sync job (/api/sync-levels) — never
 * on a live user request. The GD server rate-limits aggressively.
 *
 * Difficulty mapping (GD server returns a numeric difficulty face):
 *   0  = Auto
 *   10 = Easy
 *   20 = Normal
 *   30 = Hard
 *   40 = Harder
 *   50 = Insane
 *   Demon difficulties are separate: demonDifficulty 1=Easy, 2=Medium, 3=Hard, 4=Insane, 5=Extreme
 *
 * Rating tier (from cp field):
 *   featured=true  →  featured (cp=2)
 *   epic=true       →  epic     (cp=3)
 *   cp=4            →  legendary
 *   cp=5            →  mythic
 *   stars>0,cp=1    →  rated
 *   else            →  none (unrated)
 */

const GD_BASE = "https://www.boomlings.com/database";
const GD_SECRET = "Wmfd2893gb7";
const FETCH_TIMEOUT = 10_000;

export interface GdLevel {
  gdId: number;
  name: string;
  author: string;
  difficulty: string;
  isDemon: boolean;
  stars: number;
  ratingTier: "none" | "rated" | "featured" | "epic" | "legendary" | "mythic";
  downloads: number;
  likes: number;
  length: string;
  objects: number;
  songName: string;
  songAuthor: string;
  description: string;
  gameVersion: string;
}

// GD sends responses as robtop-encoded pipe-separated key=value pairs
function parseGdResponse(raw: string): Record<string, string> {
  const parts = raw.split(":");
  const obj: Record<string, string> = {};
  for (let i = 0; i < parts.length - 1; i += 2) {
    obj[parts[i]] = parts[i + 1] ?? "";
  }
  return obj;
}

function parseDifficulty(
  face: number,
  isDemon: boolean,
  demonType: number
): string {
  if (isDemon) {
    switch (demonType) {
      case 1: return "Easy Demon";
      case 2: return "Medium Demon";
      case 4: return "Insane Demon";
      case 5: return "Extreme Demon";
      default: return "Hard Demon";
    }
  }
  switch (face) {
    case 10: return "Easy";
    case 20: return "Normal";
    case 30: return "Hard";
    case 40: return "Harder";
    case 50: return "Insane";
    default: return "Auto";
  }
}

function parseLength(n: number): string {
  return ["Tiny", "Short", "Medium", "Long", "XL", "Platformer"][n] ?? "Medium";
}

function parseRatingTier(
  stars: number,
  featured: boolean,
  epic: boolean,
  cp: number
): GdLevel["ratingTier"] {
  if (cp >= 5 || (epic && cp >= 5)) return "mythic";
  if (cp === 4) return "legendary";
  if (epic || cp === 3) return "epic";
  if (featured || cp === 2) return "featured";
  if (stars > 0) return "rated";
  return "none";
}

function parseLevel(raw: string): GdLevel | null {
  try {
    const d = parseGdResponse(raw);
    const stars   = parseInt(d["18"] ?? "0");
    const cp      = parseInt(d["55"] ?? "0");
    const isDemon = d["17"] === "1";
    const featured = parseInt(d["19"] ?? "0") > 0;
    const epic    = d["42"] === "1";
    const diffFace = parseInt(d["9"] ?? "0");
    const demonT   = parseInt(d["43"] ?? "0");

    // decode base64 description
    let description = "";
    try {
      description = d["3"]
        ? Buffer.from(d["3"].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8")
        : "";
    } catch { description = ""; }

    return {
      gdId:       parseInt(d["1"] ?? "0"),
      name:       d["2"]  ?? "Unknown",
      author:     d["6"]  ?? "Unknown", // this is playerID; creator name needs a separate lookup
      difficulty: parseDifficulty(diffFace, isDemon, demonT),
      isDemon,
      stars,
      ratingTier: parseRatingTier(stars, featured, epic, cp),
      downloads:  parseInt(d["10"] ?? "0"),
      likes:      parseInt(d["14"] ?? "0"),
      length:     parseLength(parseInt(d["15"] ?? "1")),
      objects:    parseInt(d["45"] ?? "0"),
      songName:   d["52"] ?? "",
      songAuthor: d["53"] ?? "",
      description,
      gameVersion: d["13"] ?? "",
    };
  } catch {
    return null;
  }
}

async function gdPost(
  endpoint: string,
  body: Record<string, string>
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const params = new URLSearchParams({ ...body, secret: GD_SECRET });
    const res = await fetch(`${GD_BASE}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text === "-1" ? null : text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Search GD levels by difficulty type.
 * type 0=mostDownloaded, 1=mostLiked, 2=trending, 3=recent,
 *      4=byUser, 5=featured, 6=magic, 11=hallOfFame, 16=epic,
 *      17=awarded, 21=daily, 22=weekly
 * diff: -1=any, 1=easy, 2=normal, 3=hard, 4=harder, 5=insane, -2=demon
 * demonFilter: 1=easy, 2=medium, 3=hard, 4=insane, 5=extreme (only if diff=-2)
 */
export async function searchGdLevels(opts: {
  type?: number;
  diff?: number;
  demonFilter?: number;
  page?: number;
  count?: number;
}): Promise<GdLevel[]> {
  const { type = 0, diff = -1, demonFilter, page = 0 } = opts;

  const body: Record<string, string> = {
    str:    "-",
    type:   String(type),
    diff:   String(diff),
    page:   String(page),
    total:  "0",
    count:  "20",
    gameVersion: "22",
  };
  if (demonFilter) body.demonFilter = String(demonFilter);

  const raw = await gdPost("getGJLevels21.php", body);
  if (!raw) return [];

  // Response format: levels#creatorNames#songData#... — we only need levels
  const sections = raw.split("#");
  const levelSection = sections[0];
  if (!levelSection) return [];

  return levelSection
    .split("|")
    .map(parseLevel)
    .filter((l): l is GdLevel => l !== null && l.gdId > 0);
}

/**
 * Build a varied pool across all difficulty/type combos.
 * Called by the sync job, not by user-facing routes.
 */
export async function fetchLevelPool(): Promise<GdLevel[]> {
  const jobs: Array<{ type: number; diff: number; demonFilter?: number }> = [
    // Most downloaded per difficulty
    { type: 0, diff: 1 },  // Easy most downloaded
    { type: 0, diff: 2 },  // Normal
    { type: 0, diff: 3 },  // Hard
    { type: 0, diff: 4 },  // Harder
    { type: 0, diff: 5 },  // Insane
    { type: 0, diff: -2, demonFilter: 1 }, // Easy Demon
    { type: 0, diff: -2, demonFilter: 2 }, // Medium Demon
    { type: 0, diff: -2, demonFilter: 3 }, // Hard Demon
    { type: 0, diff: -2, demonFilter: 4 }, // Insane Demon
    { type: 0, diff: -2, demonFilter: 5 }, // Extreme Demon
    // Featured pool per difficulty
    { type: 5, diff: 3 },
    { type: 5, diff: 4 },
    { type: 5, diff: 5 },
    { type: 5, diff: -2 },
    // Epic pool
    { type: 16, diff: -1 },
    { type: 16, diff: -2 },
    // Hall of Fame
    { type: 11, diff: -1 },
    // Trending
    { type: 2, diff: -1 },
    { type: 2, diff: -2 },
    // Recent
    { type: 3, diff: 1 },
    { type: 3, diff: -2 },
  ];

  const all: GdLevel[] = [];
  for (const job of jobs) {
    const results = await searchGdLevels(job);
    all.push(...results);
    // Small delay between calls — be polite to Rob's servers
    await new Promise((r) => setTimeout(r, 400));
  }

  // Dedupe by gdId
  const seen = new Set<number>();
  return all.filter((l) => {
    if (seen.has(l.gdId)) return false;
    seen.add(l.gdId);
    return true;
  });
}
