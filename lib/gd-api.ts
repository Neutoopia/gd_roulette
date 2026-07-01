/**
 * Geometry Dash level data adapter — talks directly to boomlings.com
 * (the official GD server). Only ever called from the sync job
 * (/api/sync-levels), never on live user requests.
 *
 * IMPORTANT — Cloudflare bypass:
 * boomlings.com sits behind Cloudflare bot protection. Sending a normal
 * browser-like User-Agent gets flagged and blocked ("Access denied").
 * Counterintuitively, sending an EMPTY User-Agent string avoids matching
 * Cloudflare's bot fingerprint rules and gets through cleanly. Do not
 * "fix" this by adding a realistic User-Agent back — it will break sync.
 */

const GD_BASE   = "http://www.boomlings.com/database";
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

function parseGdResponse(raw: string): Record<string, string> {
  const parts = raw.split(":");
  const obj: Record<string, string> = {};
  for (let i = 0; i < parts.length - 1; i += 2) {
    obj[parts[i]] = parts[i + 1] ?? "";
  }
  return obj;
}

function parseDifficulty(face: number, isDemon: boolean, demonType: number): string {
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

function parseRatingTier(stars: number, featured: boolean, epic: boolean, cp: number): GdLevel["ratingTier"] {
  if (cp >= 5) return "mythic";
  if (cp === 4) return "legendary";
  if (epic || cp === 3) return "epic";
  if (featured || cp === 2) return "featured";
  if (stars > 0) return "rated";
  return "none";
}

function decodeDescription(b64: string): string {
  if (!b64) return "";
  try {
    return Buffer.from(b64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
  } catch {
    return "";
  }
}

function parseLevel(raw: string): GdLevel | null {
  try {
    const d = parseGdResponse(raw);
    const gdId = parseInt(d["1"] ?? "0");
    if (!gdId) return null;

    const stars    = parseInt(d["18"] ?? "0");
    const cp       = parseInt(d["55"] ?? "0");
    const isDemon  = d["17"] === "1";
    const featured = parseInt(d["19"] ?? "0") > 0;
    const epic     = d["42"] === "1";
    const diffFace = parseInt(d["9"] ?? "0");
    const demonT   = parseInt(d["43"] ?? "0");

    return {
      gdId,
      name:        d["2"] ?? "Unknown",
      author:      d["6"] ?? "Unknown",
      difficulty:  parseDifficulty(diffFace, isDemon, demonT),
      isDemon,
      stars,
      ratingTier:  parseRatingTier(stars, featured, epic, cp),
      downloads:   parseInt(d["10"] ?? "0"),
      likes:       parseInt(d["14"] ?? "0"),
      length:      parseLength(parseInt(d["15"] ?? "1")),
      objects:     parseInt(d["45"] ?? "0"),
      songName:    d["52"] ?? "",
      songAuthor:  d["53"] ?? "",
      description: decodeDescription(d["3"] ?? ""),
      gameVersion: d["13"] ?? "21",
    };
  } catch {
    return null;
  }
}

async function gdPost(endpoint: string, body: Record<string, string>): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const params = new URLSearchParams({
      gameVersion: "21",
      binaryVersion: "35",
      secret: GD_SECRET,
      ...body,
    });
    const res = await fetch(`${GD_BASE}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "", // see file header comment — this is intentional
      },
      body: params.toString(),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.trim() === "-1") return null;
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function searchGdLevels(opts: {
  type?: number; diff?: number; demonFilter?: number; page?: number;
}): Promise<GdLevel[]> {
  const { type = 0, diff = -1, demonFilter, page = 0 } = opts;

  const body: Record<string, string> = {
    str: "-", type: String(type), diff: String(diff),
    page: String(page), total: "0", count: "20",
  };
  if (demonFilter) body.demonFilter = String(demonFilter);

  const raw = await gdPost("getGJLevels21.php", body);
  if (!raw) return [];

  const levelSection = raw.split("#")[0];
  if (!levelSection) return [];

  return levelSection
    .split("|")
    .map(parseLevel)
    .filter((l): l is GdLevel => l !== null && l.gdId > 0);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Builds the full list of search jobs, giving every difficulty tier
 * (including each demon sub-tier) roughly EQUAL coverage — same number
 * of search-type variations and pages each — rather than letting the
 * naturally larger "Hard"/"Insane" buckets dominate the sync. This
 * matters because /api/levels/random does stratified-by-difficulty
 * selection, so every tier needs a healthy pool to draw from.
 */
function buildJobs(): Array<{ type: number; diff: number; demonFilter?: number; page?: number }> {
  const jobs: Array<{ type: number; diff: number; demonFilter?: number; page?: number }> = [];

  // type: 0=mostDownloaded, 1=mostLiked, 2=trending, 3=recent, 5=featured
  const searchTypes = [0, 1, 2, 3, 5];
  const pages = [0, 1, 2];

  // Non-demon tiers: diff 1..5 = Easy..Insane
  for (const diff of [1, 2, 3, 4, 5]) {
    for (const type of searchTypes) {
      for (const page of pages) {
        jobs.push({ type, diff, page });
      }
    }
  }

  // Demon tiers: diff -2 with demonFilter 1..5 = Easy..Extreme Demon
  for (const demonFilter of [1, 2, 3, 4, 5]) {
    for (const type of searchTypes) {
      for (const page of pages) {
        jobs.push({ type, diff: -2, demonFilter, page });
      }
    }
  }

  // A few extra broad pools that don't fit the per-difficulty pattern
  jobs.push(
    { type: 16, diff: -1 }, { type: 16, diff: -1, page: 1 }, { type: 16, diff: -2 }, // epic
    { type: 11, diff: -1 }, { type: 11, diff: -1, page: 1 },                          // hall of fame
    { type: 6,  diff: 3  }, { type: 6, diff: 4 }, { type: 6, diff: 5 },               // magic
  );

  return jobs;
}

export const SYNC_JOBS = buildJobs();
export const TOTAL_SYNC_JOBS = SYNC_JOBS.length;

/**
 * Fetch a single job by index. Used by the sync route to process one
 * bucket per request, avoiding serverless function timeouts.
 */
export async function fetchSyncBucket(index: number): Promise<GdLevel[]> {
  const job = SYNC_JOBS[index];
  if (!job) return [];
  return searchGdLevels(job);
}

/**
 * Fetches everything in one pass. Only suitable for local scripts —
 * this will exceed Vercel's serverless timeout if called from an API
 * route. Use fetchSyncBucket() + the ?bucket= param for deployed syncs.
 */
export async function fetchLevelPool(): Promise<GdLevel[]> {
  const all: GdLevel[] = [];
  for (const job of SYNC_JOBS) {
    const results = await searchGdLevels(job);
    all.push(...results);
    await sleep(600);
  }

  const seen = new Set<number>();
  return all.filter((l) => {
    if (seen.has(l.gdId)) return false;
    seen.add(l.gdId);
    return true;
  });
}
