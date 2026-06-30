// /**
//  * GD Level Data Source — GDBrowser API
//  *
//  * GDBrowser (gdbrowser.com) proxies the official GD servers and exposes
//  * a clean JSON API. We call it ONLY from the sync job (/api/sync-levels),
//  * never on live user requests. All data is stored in our own DB so the
//  * app keeps working even if GDBrowser is temporarily down.
//  *
//  * We send a realistic User-Agent to avoid being blocked by Vercel's
//  * datacenter IPs, and add polite delays between requests.
//  */

// const BASE        = "https://gdbrowser.com/api";
// const TIMEOUT_MS  = 12_000;
// const DELAY_MS    = 500; // between each search call

// const USER_AGENT =
//   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
//   "AppleWebKit/537.36 (KHTML, like Gecko) " +
//   "Chrome/124.0.0.0 Safari/537.36";

// export interface GdLevel {
//   gdId:        number;
//   name:        string;
//   author:      string;
//   difficulty:  string;
//   isDemon:     boolean;
//   stars:       number;
//   ratingTier:  "none" | "rated" | "featured" | "epic" | "legendary" | "mythic";
//   downloads:   number;
//   likes:       number;
//   length:      string;
//   objects:     number;
//   songName:    string;
//   songAuthor:  string;
//   description: string;
//   gameVersion: string;
// }

// // ── GDBrowser response shape ───────────────────────────────────────────────

// interface GdbLevel {
//   id:          number | string;
//   name:        string;
//   author:      string;
//   difficulty:  string;  // e.g. "Easy", "Hard Demon"
//   stars:       number;
//   featured:    number;  // 0 or 1
//   epic:        number;  // 0 or 1
//   cp?:         number;  // creator points: 1=rated,2=featured,3=epic,4=legendary,5=mythic
//   downloads:   number;
//   likes:       number;
//   length:      string;  // "Tiny"|"Short"|"Medium"|"Long"|"XL"|"Platformer"
//   objects?:    number;
//   songName?:   string;
//   songAuthor?: string;
//   description?: string;
//   version?:    number;
//   disliked?:   boolean;
// }

// // ── Helpers ────────────────────────────────────────────────────────────────

// function sleep(ms: number) {
//   return new Promise((r) => setTimeout(r, ms));
// }

// async function fetchWithTimeout(url: string): Promise<Response | null> {
//   const controller = new AbortController();
//   const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
//   try {
//     const res = await fetch(url, {
//       signal: controller.signal,
//       headers: {
//         "User-Agent": USER_AGENT,
//         Accept: "application/json",
//       },
//     });
//     return res.ok ? res : null;
//   } catch {
//     return null;
//   } finally {
//     clearTimeout(timer);
//   }
// }

// function parseRatingTier(lvl: GdbLevel): GdLevel["ratingTier"] {
//   const cp = lvl.cp ?? 0;
//   if (cp >= 5 || (lvl.epic && cp >= 4)) return "mythic";
//   if (cp === 4) return "legendary";
//   if (lvl.epic || cp === 3)    return "epic";
//   if (lvl.featured || cp === 2) return "featured";
//   if (lvl.stars > 0)            return "rated";
//   return "none";
// }

// function isDemon(difficulty: string): boolean {
//   return difficulty.toLowerCase().includes("demon");
// }

// function normalizeLevel(raw: GdbLevel): GdLevel | null {
//   const id = Number(raw.id);
//   if (!id || isNaN(id)) return null;

//   return {
//     gdId:        id,
//     name:        raw.name        ?? "Unknown",
//     author:      raw.author      ?? "Unknown",
//     difficulty:  raw.difficulty  ?? "Normal",
//     isDemon:     isDemon(raw.difficulty ?? ""),
//     stars:       raw.stars       ?? 0,
//     ratingTier:  parseRatingTier(raw),
//     downloads:   raw.downloads   ?? 0,
//     likes:       raw.likes       ?? 0,
//     length:      raw.length      ?? "Medium",
//     objects:     raw.objects     ?? 0,
//     songName:    raw.songName    ?? "",
//     songAuthor:  raw.songAuthor  ?? "",
//     description: raw.description ?? "",
//     gameVersion: raw.version ? String(raw.version) : "22",
//   };
// }

// // ── Search ─────────────────────────────────────────────────────────────────

// /**
//  * GDBrowser search query params:
//  *   type: 0=mostDownloaded, 1=mostLiked, 2=trending, 3=recent,
//  *         4=byUser, 5=featured, 6=magic, 11=hallOfFame, 16=epic
//  *   diff: 1=easy, 2=normal, 3=hard, 4=harder, 5=insane, -2=demon
//  *   demonFilter: 1=easyDemon, 2=medDemon, 3=hardDemon, 4=insaneDemon, 5=extremeDemon
//  *   page: 0-indexed
//  *   count: results per page (default 20, max ~20)
//  */
// async function searchLevels(params: {
//   type?: number;
//   diff?: number;
//   demonFilter?: number;
//   page?: number;
// }): Promise<GdLevel[]> {
//   const { type = 0, diff = -1, demonFilter, page = 0 } = params;

//   const qs = new URLSearchParams({
//     type:  String(type),
//     diff:  String(diff),
//     page:  String(page),
//     count: "20",
//   });
//   if (demonFilter !== undefined) qs.set("demonFilter", String(demonFilter));

//   const url = `${BASE}/search/-?${qs.toString()}`;
//   const res = await fetchWithTimeout(url);
//   if (!res) return [];

//   try {
//     const data = await res.json();
//     if (!Array.isArray(data)) return [];
//     return data
//       .map((raw: GdbLevel) => normalizeLevel(raw))
//       .filter((l): l is GdLevel => l !== null);
//   } catch {
//     return [];
//   }
// }

// // ── Pool builder ───────────────────────────────────────────────────────────

// /**
//  * Fetches a broad spread of levels across all difficulties and rating tiers.
//  * Called only from the sync job — not on live user requests.
//  *
//  * We fetch multiple pages per difficulty/type combo to build up a large
//  * enough pool to make the roulette interesting.
//  */
// export async function fetchLevelPool(): Promise<GdLevel[]> {
//   // Each entry is one search call
//   const jobs: Array<{ type: number; diff: number; demonFilter?: number; page?: number }> = [
//     // Most downloaded per difficulty (pages 0 and 1)
//     { type: 0, diff: 1 },          // Easy
//     { type: 0, diff: 1, page: 1 },
//     { type: 0, diff: 2 },          // Normal
//     { type: 0, diff: 2, page: 1 },
//     { type: 0, diff: 3 },          // Hard
//     { type: 0, diff: 3, page: 1 },
//     { type: 0, diff: 4 },          // Harder
//     { type: 0, diff: 4, page: 1 },
//     { type: 0, diff: 5 },          // Insane
//     { type: 0, diff: 5, page: 1 },
//     { type: 0, diff: -2, demonFilter: 1 }, // Easy Demon
//     { type: 0, diff: -2, demonFilter: 1, page: 1 },
//     { type: 0, diff: -2, demonFilter: 2 }, // Medium Demon
//     { type: 0, diff: -2, demonFilter: 2, page: 1 },
//     { type: 0, diff: -2, demonFilter: 3 }, // Hard Demon
//     { type: 0, diff: -2, demonFilter: 3, page: 1 },
//     { type: 0, diff: -2, demonFilter: 4 }, // Insane Demon
//     { type: 0, diff: -2, demonFilter: 4, page: 1 },
//     { type: 0, diff: -2, demonFilter: 5 }, // Extreme Demon
//     { type: 0, diff: -2, demonFilter: 5, page: 1 },

//     // Most liked per difficulty
//     { type: 1, diff: 3 },
//     { type: 1, diff: 4 },
//     { type: 1, diff: 5 },
//     { type: 1, diff: -2 },

//     // Featured pool
//     { type: 5, diff: 1 },
//     { type: 5, diff: 2 },
//     { type: 5, diff: 3 },
//     { type: 5, diff: 4 },
//     { type: 5, diff: 5 },
//     { type: 5, diff: -2, demonFilter: 1 },
//     { type: 5, diff: -2, demonFilter: 2 },
//     { type: 5, diff: -2, demonFilter: 3 },
//     { type: 5, diff: -2, demonFilter: 4 },
//     { type: 5, diff: -2, demonFilter: 5 },

//     // Epic pool (type 16)
//     { type: 16, diff: -1 },
//     { type: 16, diff: -1, page: 1 },
//     { type: 16, diff: -2 },

//     // Hall of Fame (type 11)
//     { type: 11, diff: -1 },

//     // Magic (type 6) — well-designed levels
//     { type: 6, diff: 3 },
//     { type: 6, diff: 4 },
//     { type: 6, diff: 5 },

//     // Trending (type 2) — fresh levels
//     { type: 2, diff: -1 },
//     { type: 2, diff: -2 },
//   ];

//   const all: GdLevel[] = [];

//   for (const job of jobs) {
//     const results = await searchLevels(job);
//     all.push(...results);
//     console.log(`[gd-api] type=${job.type} diff=${job.diff} demonFilter=${job.demonFilter ?? "-"} page=${job.page ?? 0} → ${results.length} levels`);
//     await sleep(DELAY_MS);
//   }

//   // Deduplicate by gdId
//   const seen = new Set<number>();
//   const deduped = all.filter((l) => {
//     if (seen.has(l.gdId)) return false;
//     seen.add(l.gdId);
//     return true;
//   });

//   console.log(`[gd-api] Total unique levels: ${deduped.length}`);
//   return deduped;
// }

// ----------------------------------------------------------------------------------//
// ----------------------------------------------------------------------------------//
// ----------------------------------------------------------------------------------//

/**
 * Geometry Dash level data adapter — talks directly to boomlings.com
 * (the official GD server). Only ever called from the sync job
 * (/api/sync-levels), never on live user requests.
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
  demonType: number,
): string {
  if (isDemon) {
    switch (demonType) {
      case 1:
        return "Easy Demon";
      case 2:
        return "Medium Demon";
      case 4:
        return "Insane Demon";
      case 5:
        return "Extreme Demon";
      default:
        return "Hard Demon";
    }
  }
  switch (face) {
    case 10:
      return "Easy";
    case 20:
      return "Normal";
    case 30:
      return "Hard";
    case 40:
      return "Harder";
    case 50:
      return "Insane";
    default:
      return "Auto";
  }
}

function parseLength(n: number): string {
  return ["Tiny", "Short", "Medium", "Long", "XL", "Platformer"][n] ?? "Medium";
}

function parseRatingTier(
  stars: number,
  featured: boolean,
  epic: boolean,
  cp: number,
): GdLevel["ratingTier"] {
  if (cp >= 5) return "mythic";
  if (cp === 4) return "legendary";
  if (epic || cp === 3) return "epic";
  if (featured || cp === 2) return "featured";
  if (stars > 0) return "rated";
  return "none";
}

function parseLevel(raw: string): GdLevel | null {
  try {
    const d = parseGdResponse(raw);
    const stars = parseInt(d["18"] ?? "0");
    const cp = parseInt(d["55"] ?? "0");
    const isDemon = d["17"] === "1";
    const featured = parseInt(d["19"] ?? "0") > 0;
    const epic = d["42"] === "1";
    const diffFace = parseInt(d["9"] ?? "0");
    const demonT = parseInt(d["43"] ?? "0");

    let description = "";
    try {
      description = d["3"]
        ? Buffer.from(
            d["3"].replace(/-/g, "+").replace(/_/g, "/"),
            "base64",
          ).toString("utf-8")
        : "";
    } catch {
      description = "";
    }

    return {
      gdId: parseInt(d["1"] ?? "0"),
      name: d["2"] ?? "Unknown",
      author: d["6"] ?? "Unknown",
      difficulty: parseDifficulty(diffFace, isDemon, demonT),
      isDemon,
      stars,
      ratingTier: parseRatingTier(stars, featured, epic, cp),
      downloads: parseInt(d["10"] ?? "0"),
      likes: parseInt(d["14"] ?? "0"),
      length: parseLength(parseInt(d["15"] ?? "1")),
      objects: parseInt(d["45"] ?? "0"),
      songName: d["52"] ?? "",
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
  body: Record<string, string>,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const params = new URLSearchParams({ ...body, secret: GD_SECRET });
    const res = await fetch(`${GD_BASE}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "", // bypasses Cloudflare fingerprinting
      },
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

export async function searchGdLevels(opts: {
  type?: number;
  diff?: number;
  demonFilter?: number;
  page?: number;
}): Promise<GdLevel[]> {
  const { type = 0, diff = -1, demonFilter, page = 0 } = opts;

  const body: Record<string, string> = {
    str: "-",
    type: String(type),
    diff: String(diff),
    page: String(page),
    total: "0",
    count: "20",
    gameVersion: "22",
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

// export async function fetchLevelPool(): Promise<GdLevel[]> {
//   const jobs: Array<{ type: number; diff: number; demonFilter?: number }> = [
//     { type: 0, diff: 1 },
//     { type: 0, diff: 2 },
//     { type: 0, diff: 3 },
//     { type: 0, diff: 4 },
//     { type: 0, diff: 5 },
//     { type: 0, diff: -2, demonFilter: 1 },
//     { type: 0, diff: -2, demonFilter: 2 },
//     { type: 0, diff: -2, demonFilter: 3 },
//     { type: 0, diff: -2, demonFilter: 4 },
//     { type: 0, diff: -2, demonFilter: 5 },
//     { type: 5, diff: 3 },
//     { type: 5, diff: 4 },
//     { type: 5, diff: 5 },
//     { type: 5, diff: -2 },
//     { type: 16, diff: -1 },
//     { type: 16, diff: -2 },
//     { type: 11, diff: -1 },
//     { type: 2, diff: -1 },
//     { type: 2, diff: -2 },
//     { type: 3, diff: 1 },
//     { type: 3, diff: -2 },
//   ];

//   const all: GdLevel[] = [];
//   for (const job of jobs) {
//     const results = await searchGdLevels(job);
//     all.push(...results);
//     await new Promise((r) => setTimeout(r, 400));
//   }

//   const seen = new Set<number>();
//   return all.filter((l) => {
//     if (seen.has(l.gdId)) return false;
//     seen.add(l.gdId);
//     return true;
//   });
// }

export async function fetchLevelPool(): Promise<GdLevel[]> {
  const jobs: Array<{
    type: number;
    diff: number;
    demonFilter?: number;
    page?: number;
  }> = [
    // Most downloaded — pages 0, 1, 2 per difficulty
    { type: 0, diff: 1 },
    { type: 0, diff: 1, page: 1 },
    { type: 0, diff: 1, page: 2 },
    { type: 0, diff: 2 },
    { type: 0, diff: 2, page: 1 },
    { type: 0, diff: 2, page: 2 },
    { type: 0, diff: 3 },
    { type: 0, diff: 3, page: 1 },
    { type: 0, diff: 3, page: 2 },
    { type: 0, diff: 4 },
    { type: 0, diff: 4, page: 1 },
    { type: 0, diff: 4, page: 2 },
    { type: 0, diff: 5 },
    { type: 0, diff: 5, page: 1 },
    { type: 0, diff: 5, page: 2 },
    { type: 0, diff: -2, demonFilter: 1 },
    { type: 0, diff: -2, demonFilter: 1, page: 1 },
    { type: 0, diff: -2, demonFilter: 2 },
    { type: 0, diff: -2, demonFilter: 2, page: 1 },
    { type: 0, diff: -2, demonFilter: 3 },
    { type: 0, diff: -2, demonFilter: 3, page: 1 },
    { type: 0, diff: -2, demonFilter: 4 },
    { type: 0, diff: -2, demonFilter: 4, page: 1 },
    { type: 0, diff: -2, demonFilter: 5 },
    { type: 0, diff: -2, demonFilter: 5, page: 1 },

    // Most liked — different results from most downloaded
    { type: 1, diff: 1 },
    { type: 1, diff: 2 },
    { type: 1, diff: 3 },
    { type: 1, diff: 4 },
    { type: 1, diff: 5 },
    { type: 1, diff: -2, demonFilter: 1 },
    { type: 1, diff: -2, demonFilter: 2 },
    { type: 1, diff: -2, demonFilter: 3 },
    { type: 1, diff: -2, demonFilter: 4 },
    { type: 1, diff: -2, demonFilter: 5 },

    // Trending — fresh/rotating levels, different each sync
    { type: 2, diff: 1 },
    { type: 2, diff: 2 },
    { type: 2, diff: 3 },
    { type: 2, diff: 4 },
    { type: 2, diff: 5 },
    { type: 2, diff: -2 },

    // Recent — newest levels, always new content each sync
    { type: 3, diff: 1 },
    { type: 3, diff: 1, page: 1 },
    { type: 3, diff: 2 },
    { type: 3, diff: 2, page: 1 },
    { type: 3, diff: 3 },
    { type: 3, diff: 3, page: 1 },
    { type: 3, diff: 4 },
    { type: 3, diff: 4, page: 1 },
    { type: 3, diff: 5 },
    { type: 3, diff: 5, page: 1 },
    { type: 3, diff: -2 },
    { type: 3, diff: -2, page: 1 },

    // Featured
    { type: 5, diff: 3 },
    { type: 5, diff: 4 },
    { type: 5, diff: 5 },
    { type: 5, diff: -2 },

    // Epic
    { type: 16, diff: -1 },
    { type: 16, diff: -1, page: 1 },
    { type: 16, diff: -2 },

    // Hall of Fame
    { type: 11, diff: -1 },
    { type: 11, diff: -1, page: 1 },

    // Magic
    { type: 6, diff: 3 },
    { type: 6, diff: 4 },
    { type: 6, diff: 5 },
  ];
  
  const all: GdLevel[] = [];
  for (const job of jobs) {
    const results = await searchGdLevels(job);
    all.push(...results);
    await new Promise((r) => setTimeout(r, 400));
  }
  const seen = new Set<number>();
  return all.filter((l) => {
    if (seen.has(l.gdId)) return false;
    seen.add(l.gdId);
    return true;
  });
}
