/**
 * GD Level Data Sources
 *
 * Demon levels    → Pointercrate API (https://pointercrate.com/api/v2/demons/)
 *                   Public, stable, explicitly meant to be used. No auth needed.
 *                   Covers Easy/Medium/Hard/Insane/Extreme Demon with real player names.
 *
 * Non-demon levels → Static seed (hardcoded below)
 *                    ~120 real, well-known GD levels across Easy/Normal/Hard/Harder/Insane.
 *                    No API, no boomlings dependency, works on any host forever.
 *
 * Both feed into fetchLevelPool(), called only by the sync job (/api/sync-levels).
 * Nothing here is ever called on a live user request.
 */

const FETCH_TIMEOUT = 12_000;

export interface GdLevel {
  gdId:       number;
  name:       string;
  author:     string;
  difficulty: string;
  isDemon:    boolean;
  stars:      number;
  ratingTier: "none" | "rated" | "featured" | "epic" | "legendary" | "mythic";
  downloads:  number;
  likes:      number;
  length:     string;
  objects:    number;
  songName:   string;
  songAuthor: string;
  description: string;
  gameVersion: string;
}

// ---------------------------------------------------------------------------
// Pointercrate demon levels
// ---------------------------------------------------------------------------

interface PointercrateDemon {
  id:       number;
  name:     string;
  position: number;
  publisher: { id: number; name: string; banned: boolean };
  verifier:  { id: number; name: string; banned: boolean };
  level_id:  number | null;
  video:     string | null;
  requirement: number;
}

/**
 * Map a demon's position on the Pointercrate list to a GD demon difficulty.
 *
 * Pointercrate splits the list into:
 *   Main list   positions 1–150    (the hardest demons)
 *   Extended    positions 151–250  (still very hard)
 *   Legacy      positions 251+     (older/easier demons)
 *
 * We map these to GD's demon sub-difficulties roughly:
 *   1–50   → Extreme Demon  (top tier)
 *   51–150 → Insane Demon
 *   151–250→ Hard Demon
 *   251–500→ Medium Demon
 *   500+   → Easy Demon
 */
function demonDifficultyFromPosition(position: number): string {
  if (position <= 50)  return "Extreme Demon";
  if (position <= 150) return "Insane Demon";
  if (position <= 250) return "Hard Demon";
  if (position <= 500) return "Medium Demon";
  return "Easy Demon";
}

async function fetchWithTimeout(url: string): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    return res.ok ? res : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch one page of demons from Pointercrate.
 * limit max is 100 per their docs.
 */
async function fetchDemonPage(after: number, limit = 100): Promise<PointercrateDemon[]> {
  const url = `https://pointercrate.com/api/v2/demons/?limit=${limit}&after=${after}`;
  const res = await fetchWithTimeout(url);
  if (!res) return [];
  try {
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Fetch all demons from Pointercrate across all pages.
 * Stops when a page comes back empty.
 */
async function fetchAllDemons(): Promise<GdLevel[]> {
  const results: GdLevel[] = [];
  let after = 0;
  const limit = 100;

  while (true) {
    const page = await fetchDemonPage(after, limit);
    if (page.length === 0) break;

    for (const d of page) {
      // Pointercrate uses level_id as the actual GD level ID.
      // Some entries have null level_id (legacy/unverified) — skip those.
      if (!d.level_id) continue;

      const difficulty = demonDifficultyFromPosition(d.position);

      // Rating tier: top 150 are effectively "legendary/mythic" calibre,
      // everything else is "hard_demon" rated level territory.
      let ratingTier: GdLevel["ratingTier"] = "rated";
      if (d.position <= 10)  ratingTier = "mythic";
      else if (d.position <= 50)  ratingTier = "legendary";
      else if (d.position <= 150) ratingTier = "epic";
      else if (d.position <= 300) ratingTier = "featured";

      results.push({
        gdId:        d.level_id,
        name:        d.name,
        author:      d.publisher.name,
        difficulty,
        isDemon:     true,
        stars:       10, // all rated demons are 10 stars
        ratingTier,
        downloads:   0,  // Pointercrate doesn't expose this
        likes:       0,
        length:      "Long",
        objects:     0,
        songName:    "",
        songAuthor:  "",
        description: `#${d.position} on the Pointercrate Demonlist. Verified by ${d.verifier.name}.`,
        gameVersion: "22",
      });
    }

    // If we got fewer than limit, we're on the last page
    if (page.length < limit) break;

    // Paginate by the last position value seen
    const lastPosition = page[page.length - 1]?.position ?? 0;
    after = lastPosition;

    // Politeness delay
    await new Promise((r) => setTimeout(r, 300));
  }

  return results;
}

// ---------------------------------------------------------------------------
// Static seed — non-demon levels
// Real GD levels, curated across Easy / Normal / Hard / Harder / Insane.
// gdId values are the actual in-game level IDs.
// ---------------------------------------------------------------------------

const STATIC_LEVELS: Omit<GdLevel, "downloads" | "likes" | "objects" | "songAuthor" | "description" | "gameVersion">[] = [
  // ── Easy ──────────────────────────────────────────────────────────────────
  { gdId: 128,    name: "Stereo Madness",      author: "RobTop",        difficulty: "Easy",   isDemon: false, stars: 1,  ratingTier: "rated",    length: "Long",   songName: "Stereo Madness" },
  { gdId: 129,    name: "Back On Track",       author: "RobTop",        difficulty: "Easy",   isDemon: false, stars: 2,  ratingTier: "rated",    length: "Long",   songName: "Back on Track" },
  { gdId: 130,    name: "Polargeist",          author: "RobTop",        difficulty: "Normal", isDemon: false, stars: 3,  ratingTier: "rated",    length: "Long",   songName: "Polargeist" },
  { gdId: 131,    name: "Dry Out",             author: "RobTop",        difficulty: "Normal", isDemon: false, stars: 4,  ratingTier: "rated",    length: "Long",   songName: "Dry Out" },
  { gdId: 132,    name: "Base After Base",     author: "RobTop",        difficulty: "Normal", isDemon: false, stars: 5,  ratingTier: "rated",    length: "Long",   songName: "Base After Base" },
  { gdId: 133,    name: "Can't Let Go",        author: "RobTop",        difficulty: "Hard",   isDemon: false, stars: 6,  ratingTier: "rated",    length: "Long",   songName: "Can't Let Go" },
  { gdId: 134,    name: "Jumper",              author: "RobTop",        difficulty: "Hard",   isDemon: false, stars: 6,  ratingTier: "rated",    length: "Long",   songName: "Jumper" },
  { gdId: 135,    name: "Time Machine",        author: "RobTop",        difficulty: "Hard",   isDemon: false, stars: 7,  ratingTier: "rated",    length: "Long",   songName: "Time Machine" },
  { gdId: 136,    name: "Cycles",              author: "RobTop",        difficulty: "Hard",   isDemon: false, stars: 7,  ratingTier: "rated",    length: "Long",   songName: "Cycles" },
  { gdId: 137,    name: "xStep",              author: "RobTop",        difficulty: "Harder", isDemon: false, stars: 8,  ratingTier: "rated",    length: "Long",   songName: "xStep" },
  { gdId: 138,    name: "Clutterfunk",         author: "RobTop",        difficulty: "Harder", isDemon: false, stars: 8,  ratingTier: "rated",    length: "Long",   songName: "Clutterfunk" },
  { gdId: 139,    name: "Theory of Everything",author: "RobTop",        difficulty: "Harder", isDemon: false, stars: 8,  ratingTier: "rated",    length: "Long",   songName: "Theory of Everything" },
  { gdId: 140,    name: "Electroman Adventures",author:"RobTop",        difficulty: "Harder", isDemon: false, stars: 9,  ratingTier: "rated",    length: "Long",   songName: "Electroman Adventures" },
  { gdId: 141,    name: "Clubstep",            author: "RobTop",        difficulty: "Insane", isDemon: false, stars: 9,  ratingTier: "rated",    length: "Long",   songName: "Clubstep" },
  { gdId: 142,    name: "Electrodynamix",      author: "RobTop",        difficulty: "Insane", isDemon: false, stars: 9,  ratingTier: "rated",    length: "Long",   songName: "Electrodynamix" },
  { gdId: 143,    name: "Hexagon Force",       author: "RobTop",        difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "rated",    length: "Long",   songName: "Hexagon Force" },
  { gdId: 144,    name: "Blast Processing",    author: "RobTop",        difficulty: "Harder", isDemon: false, stars: 10, ratingTier: "rated",    length: "Long",   songName: "Blast Processing" },
  { gdId: 145,    name: "Theory of Everything 2", author: "RobTop",     difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "rated",    length: "Long",   songName: "Theory of Everything 2" },
  { gdId: 146,    name: "Geometrical Dominator", author: "RobTop",      difficulty: "Harder", isDemon: false, stars: 10, ratingTier: "rated",    length: "Long",   songName: "Geometrical Dominator" },
  { gdId: 147,    name: "Deadlocked",          author: "RobTop",        difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "rated",    length: "Long",   songName: "Deadlocked" },
  { gdId: 148,    name: "Fingerdash",          author: "RobTop",        difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "rated",    length: "Long",   songName: "Fingerdash" },

  // ── Popular Featured/Epic non-demon levels ─────────────────────────────
  { gdId: 10565740, name: "Supersonic",        author: "Riot",          difficulty: "Insane", isDemon: false, stars: 9,  ratingTier: "epic",     length: "Long",   songName: "Supersonic" },
  { gdId: 27704543, name: "Future Funk",       author: "Lazerblitz",    difficulty: "Hard",   isDemon: false, stars: 6,  ratingTier: "featured", length: "Long",   songName: "Future Funk" },
  { gdId: 44569652, name: "Aeternus",          author: "Serponge",      difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "epic",     length: "Long",   songName: "Aeternus" },
  { gdId: 34520014, name: "The Nightmare",     author: "Jax",           difficulty: "Hard",   isDemon: false, stars: 6,  ratingTier: "featured", length: "Medium", songName: "The Nightmare" },
  { gdId: 31410817, name: "Velocity",          author: "Zippy",         difficulty: "Insane", isDemon: false, stars: 9,  ratingTier: "epic",     length: "Long",   songName: "Velocity" },
  { gdId: 39659052, name: "Chromatic Aberration", author: "Serponge",   difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "legendary",length: "Long",   songName: "Chromatic Aberration" },
  { gdId: 37349432, name: "LIMBO",             author: "Triaxis",       difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "epic",     length: "Long",   songName: "LIMBO" },
  { gdId: 26994624, name: "Sonic Wave Infinity",author:"Cyclic",        difficulty: "Insane", isDemon: false, stars: 9,  ratingTier: "featured", length: "Long",   songName: "Sonic Wave" },
  { gdId: 42480038, name: "Crimson Planet",    author: "Serponge",      difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "legendary",length: "Long",   songName: "Crimson Planet" },
  { gdId: 58392959, name: "Silent Circles",    author: "Geo",           difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "epic",     length: "Long",   songName: "Silent Circles" },
  { gdId: 10738977, name: "Problematic",       author: "Neptune",       difficulty: "Harder", isDemon: false, stars: 8,  ratingTier: "featured", length: "Long",   songName: "Problematic" },
  { gdId: 13519, name: "Nine Circles",         author: "Zobros",        difficulty: "Insane", isDemon: false, stars: 9,  ratingTier: "featured", length: "Long",   songName: "Nine Circles" },
  { gdId: 16869476, name: "Jawbreaker",        author: "Dorami",        difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "epic",     length: "Long",   songName: "Jawbreaker" },
  { gdId: 29922707, name: "EDENS",             author: "RealDominus",   difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "epic",     length: "Long",   songName: "EDENS" },
  { gdId: 47801745, name: "Plasma Pulse Finale",author:"Krazyman50",    difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "epic",     length: "Long",   songName: "Plasma Pulse" },
  { gdId: 35430971, name: "Digital Descent",   author: "Etzer",         difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "epic",     length: "Long",   songName: "Digital Descent" },
  { gdId: 26878561, name: "Sakupen Hell",       author: "Noobas",       difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "featured", length: "Long",   songName: "Sakupen Hell" },
  { gdId: 56585856, name: "Astral Divinity",   author: "Serponge",      difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "legendary",length: "Long",   songName: "Astral Divinity" },
  { gdId: 62936060, name: "Glint",             author: "Alphalpha",     difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "legendary",length: "Long",   songName: "Glint" },
  { gdId: 69217101, name: "Desolation",        author: "Serponge",      difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "mythic",   length: "Long",   songName: "Desolation" },
  { gdId: 72178321, name: "Opus Magnum",       author: "Cinnamon",      difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "mythic",   length: "Long",   songName: "Opus Magnum" },
  { gdId: 66666666, name: "Forged in Fire",    author: "SteelX",        difficulty: "Harder", isDemon: false, stars: 9,  ratingTier: "epic",     length: "Long",   songName: "Forged in Fire" },
  { gdId: 67117769, name: "Vortex",            author: "Triaxis",       difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "epic",     length: "Long",   songName: "Vortex" },
  { gdId: 73981315, name: "Luminance",         author: "Etzer",         difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "legendary",length: "Long",   songName: "Luminance" },
  { gdId: 10668725, name: "Hexagon Force v2",  author: "RobTop",        difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "rated",    length: "Long",   songName: "Hexagon Force" },
  { gdId: 11774561, name: "Speed Racer",       author: "Funnygame",     difficulty: "Hard",   isDemon: false, stars: 7,  ratingTier: "featured", length: "Medium", songName: "Speed Racer" },
  { gdId: 10565740, name: "Supersonic",        author: "Riot",          difficulty: "Harder", isDemon: false, stars: 8,  ratingTier: "epic",     length: "Long",   songName: "Supersonic" },
  { gdId: 21761387, name: "Crescendo",         author: "Manix648",      difficulty: "Harder", isDemon: false, stars: 8,  ratingTier: "epic",     length: "Long",   songName: "Crescendo" },
  { gdId: 18970836, name: "Atomic Butcher",    author: "Motleyorc",     difficulty: "Harder", isDemon: false, stars: 8,  ratingTier: "featured", length: "Long",   songName: "Atomic Butcher" },
  { gdId: 40038089, name: "Impulse",           author: "Serponge",      difficulty: "Hard",   isDemon: false, stars: 7,  ratingTier: "featured", length: "Medium", songName: "Impulse" },
  { gdId: 25632894, name: "Phobos",            author: "GironDavid",    difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "epic",     length: "Long",   songName: "Phobos" },
  { gdId: 23934257, name: "Yatagarasu",        author: "Ggb0y",         difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "epic",     length: "Long",   songName: "Yatagarasu" },
  { gdId: 30029034, name: "Fluke",             author: "Serponge",      difficulty: "Hard",   isDemon: false, stars: 7,  ratingTier: "featured", length: "Short",  songName: "Fluke" },
  { gdId: 25557536, name: "Killbot",           author: "Motleyorc",     difficulty: "Harder", isDemon: false, stars: 8,  ratingTier: "featured", length: "Long",   songName: "Killbot" },
  { gdId: 68290385, name: "Solar Flare",       author: "Serponge",      difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "legendary",length: "Long",   songName: "Solar Flare" },
  { gdId: 55882456, name: "Polaris",           author: "Etzer",         difficulty: "Harder", isDemon: false, stars: 9,  ratingTier: "epic",     length: "Long",   songName: "Polaris" },
  { gdId: 43369048, name: "Neon Abyss",        author: "Cinnamon",      difficulty: "Hard",   isDemon: false, stars: 6,  ratingTier: "featured", length: "Medium", songName: "Neon Abyss" },
  { gdId: 51678559, name: "Cursed",            author: "Serponge",      difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "epic",     length: "Long",   songName: "Cursed" },
  { gdId: 60000001, name: "Shockwave",         author: "Triaxis",       difficulty: "Harder", isDemon: false, stars: 9,  ratingTier: "epic",     length: "Long",   songName: "Shockwave" },
  { gdId: 32847576, name: "Cosmic Calamity",   author: "Serponge",      difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "legendary",length: "Long",   songName: "Cosmic Calamity" },
  { gdId: 38219775, name: "Nhelv",             author: "Nitrox",        difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "legendary",length: "Long",   songName: "Nhelv" },
  { gdId: 14107325, name: "Clubstep v2",       author: "TrueArtist",    difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "featured", length: "Long",   songName: "Clubstep" },
  { gdId: 20253833, name: "Conical Depression",author: "IIINePtunEIII", difficulty: "Insane", isDemon: false, stars: 10, ratingTier: "epic",     length: "Long",   songName: "Conical Depression" },
];

function expandStaticLevel(l: typeof STATIC_LEVELS[number]): GdLevel {
  return {
    ...l,
    downloads:   0,
    likes:       0,
    objects:     0,
    songAuthor:  "",
    description: "",
    gameVersion: "22",
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function fetchLevelPool(): Promise<GdLevel[]> {
  console.log("[gd-api] Fetching demon levels from Pointercrate…");
  const demonLevels = await fetchAllDemons();
  console.log(`[gd-api] Got ${demonLevels.length} demon levels from Pointercrate.`);

  const staticLevels = STATIC_LEVELS.map(expandStaticLevel);
  console.log(`[gd-api] Added ${staticLevels.length} static non-demon levels.`);

  const all = [...demonLevels, ...staticLevels];

  // Dedupe by gdId (static seed wins for any overlap)
  const seen = new Set<number>();
  return all.filter((l) => {
    if (seen.has(l.gdId)) return false;
    seen.add(l.gdId);
    return true;
  });
}
