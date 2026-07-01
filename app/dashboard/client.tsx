"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";

interface Level {
  id: string;
  gdId: number;
  name: string;
  author: string;
  difficulty: string;
  isDemon: boolean;
  stars: number;
  ratingTier: string;
  downloads: number;
  likes: number;
  length: string | null;
  objects: number | null;
  songName: string | null;
  songAuthor: string | null;
  description: string | null;
  firstSeenAt?: string | Date;
}
interface Attempt {
  id: string | null;
  status: string;
  spunAt?: string | Date;
  resolvedAt?: string | Date | null;
  progressNote?: string | null;
  bestPercent?: number | null;
  attemptCount?: number;
  timeSpentMin?: number;
  requestedDiff?: string | null;
  requestedTier?: string | null;
  level: Level;
  guest?: boolean;
}
interface Stats {
  total: number;
  completed: number;
  skipped: number;
  abandoned: number;
  pending: number;
  completionRate: number;
  totalAttempts: number;
  totalTimeMins: number;
  byDifficulty: { difficulty: string; count: number }[];
  byRatingTier: { ratingTier: string; count: number }[];
}

const DIFFICULTIES = [
  "any",
  "Auto",
  "Easy",
  "Normal",
  "Hard",
  "Harder",
  "Insane",
  "Easy Demon",
  "Medium Demon",
  "Hard Demon",
  "Insane Demon",
  "Extreme Demon",
];
const RATING_TIERS = [
  "any",
  "none",
  "rated",
  "featured",
  "epic",
  "legendary",
  "mythic",
];
const HISTORY_SORTS = [
  { value: "date_desc", label: "Newest first" },
  { value: "date_asc", label: "Oldest first" },
  { value: "name_asc", label: "Level name A–Z" },
  { value: "diff_asc", label: "Difficulty (easy→hard)" },
  { value: "diff_desc", label: "Difficulty (hard→easy)" },
  { value: "stars_desc", label: "Stars (most)" },
  { value: "percent_desc", label: "Best % (highest)" },
];
const SEARCH_SORTS = [
  { value: "likes_desc", label: "Most liked" },
  { value: "downloads_desc", label: "Most downloaded" },
  { value: "date_desc", label: "Newest added" },
  { value: "date_asc", label: "Oldest added" },
  { value: "stars_desc", label: "Most stars" },
  { value: "name_asc", label: "Name A–Z" },
];
const STATUS_FILTERS = ["all", "pending", "completed", "skipped", "abandoned"];
const DIFF_ORDER = [
  "Auto",
  "Easy",
  "Normal",
  "Hard",
  "Harder",
  "Insane",
  "Easy Demon",
  "Medium Demon",
  "Hard Demon",
  "Insane Demon",
  "Extreme Demon",
];
const TIER_ORDER = ["none", "rated", "featured", "epic", "legendary", "mythic"];

function diffColor(d: string) {
  const map: Record<string, string> = {
    Auto: "var(--diff-auto)",
    Easy: "var(--diff-easy)",
    Normal: "var(--diff-normal)",
    Hard: "var(--diff-hard)",
    Harder: "var(--diff-harder)",
    Insane: "var(--diff-insane)",
    "Easy Demon": "var(--diff-edemon)",
    "Medium Demon": "var(--diff-mdemon)",
    "Hard Demon": "var(--diff-hdemon)",
    "Insane Demon": "var(--diff-idemon)",
    "Extreme Demon": "var(--diff-xdemon)",
  };
  return map[d] ?? "var(--text-2)";
}
function tierColor(t: string) {
  const map: Record<string, string> = {
    none: "var(--tier-none)",
    rated: "var(--tier-rated)",
    featured: "var(--tier-featured)",
    epic: "var(--tier-epic)",
    legendary: "var(--tier-legendary)",
    mythic: "var(--tier-mythic)",
  };
  return map[t] ?? "var(--text-2)";
}
function tierLabel(t: string) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function fmtTime(mins: number) {
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

type UserProp = { id: string; email: string; name?: string | null } | null;

export default function DashboardClient({ user }: { user: UserProp }) {
  const isGuest = !user;
  const [tab, setTab] = useState<"grind" | "search" | "history" | "stats">(
    "grind",
  );

  // ── Grind state ──
  const [difficulty, setDifficulty] = useState("any");
  const [ratingTier, setRatingTier] = useState("any");
  const [excludeCompleted, setExcludeCompleted] = useState(true);
  const [currentAttempt, setCurrentAttempt] = useState<Attempt | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [spinError, setSpinError] = useState("");

  const [editingProgress, setEditingProgress] = useState(false);
  const [progressNote, setProgressNote] = useState("");
  const [bestPercent, setBestPercent] = useState<string>("");
  const [attemptCount, setAttemptCount] = useState<string>("");
  const [timeSpentMin, setTimeSpentMin] = useState<string>("");
  const [savingProgress, setSavingProgress] = useState(false);

  // ── Search state ──
  const [searchQ, setSearchQ] = useState("");
  const [searchDiff, setSearchDiff] = useState("any");
  const [searchTier, setSearchTier] = useState("any");
  const [minLikes, setMinLikes] = useState("");
  const [minDownloads, setMinDownloads] = useState("");
  const [searchSort, setSearchSort] = useState("likes_desc");
  const [searchPage, setSearchPage] = useState(0);
  const [searchResults, setSearchResults] = useState<Level[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [assigningId, setAssigningId] = useState<string | null>(null);

  // ── History state ──
  const [history, setHistory] = useState<Attempt[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date_desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Stats state ──
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  // Load pending attempt on mount (logged-in only — guests never persist)
  useEffect(() => {
    if (isGuest) return;
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/attempts?status=pending");
      if (cancelled || !res.ok) return;
      const data = await res.json();
      if (cancelled) return;
      const a: Attempt | undefined = data.attempts?.[0];
      if (a) {
        setCurrentAttempt(a);
        setProgressNote(a.progressNote ?? "");
        setBestPercent(a.bestPercent != null ? String(a.bestPercent) : "");
        setAttemptCount(a.attemptCount ? String(a.attemptCount) : "");
        setTimeSpentMin(a.timeSpentMin ? String(a.timeSpentMin) : "");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, isGuest]);

  useEffect(() => {
    if (tab !== "history" || isGuest) return;
    let cancelled = false;
    async function load() {
      if (!cancelled) setHistoryLoading(true);
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const res = await fetch(`/api/attempts${params}`);
      if (cancelled || !res.ok) return;
      const data = await res.json();
      if (!cancelled) {
        setHistory(data.attempts ?? []);
        setHistoryLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tab, statusFilter, reloadKey, isGuest]);

  useEffect(() => {
    if (tab !== "stats" || isGuest) return;
    let cancelled = false;
    async function load() {
      if (!cancelled) setStatsLoading(true);
      const res = await fetch("/api/stats");
      if (cancelled || !res.ok) return;
      const data = await res.json();
      if (!cancelled) {
        setStats(data);
        setStatsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tab, reloadKey, isGuest]);

  // Search — debounced text query, immediate on filter/sort/page change
  useEffect(() => {
    if (tab !== "search") return;
    let cancelled = false;
    const params = new URLSearchParams({
      sort: searchSort,
      page: String(searchPage),
      limit: "20",
    });
    if (searchQ.trim().length >= 2) params.set("q", searchQ.trim());
    if (searchDiff !== "any") params.set("difficulty", searchDiff);
    if (searchTier !== "any") params.set("ratingTier", searchTier);
    if (minLikes) params.set("minLikes", minLikes);
    if (minDownloads) params.set("minDownloads", minDownloads);

    async function run() {
      if (!cancelled) {
        setSearchLoading(true);
        setSearchError("");
      }
      const res = await fetch(`/api/levels/search?${params}`);
      const data = await res.json();
      if (cancelled) return;
      if (data.error) {
        setSearchError(data.error);
        setSearchLoading(false);
        return;
      }
      setSearchResults(data.levels ?? []);
      setSearchTotal(data.total ?? 0);
      setSearchHasMore(!!data.hasMore);
      setSearchLoading(false);
    }
    const timer = setTimeout(run, searchQ ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    tab,
    searchQ,
    searchDiff,
    searchTier,
    minLikes,
    minDownloads,
    searchSort,
    searchPage,
  ]);

  function loadAttemptIntoState(a: Attempt) {
    setCurrentAttempt(a);
    setProgressNote(a.progressNote ?? "");
    setBestPercent(a.bestPercent != null ? String(a.bestPercent) : "");
    setAttemptCount(a.attemptCount ? String(a.attemptCount) : "");
    setTimeSpentMin(a.timeSpentMin ? String(a.timeSpentMin) : "");
    setEditingProgress(false);
    setSpinError("");
  }

  async function handleSpin() {
    setSpinError("");
    setSpinning(true);
    const res = await fetch("/api/levels/random", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        difficulty: difficulty === "any" ? undefined : difficulty,
        ratingTier: ratingTier === "any" ? undefined : ratingTier,
        excludeCompleted,
      }),
    });
    setSpinning(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSpinError(data.error ?? "Failed to get a level.");
      return;
    }
    loadAttemptIntoState(data.attempt);
  }

  async function assignFromSearch(level: Level) {
    setAssigningId(level.id);
    const res = await fetch("/api/levels/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ levelId: level.id }),
    });
    const data = await res.json().catch(() => ({}));
    setAssigningId(null);
    if (!res.ok) {
      setSpinError(data.error ?? "Failed to assign that level.");
      setTab("grind");
      return;
    }
    loadAttemptIntoState(data.attempt);
    setTab("grind");
  }

  async function saveProgress() {
    if (!currentAttempt?.id) return;
    setSavingProgress(true);
    await fetch("/api/attempts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId: currentAttempt.id,
        progressNote: progressNote || undefined,
        bestPercent: bestPercent !== "" ? Number(bestPercent) : undefined,
        attemptCount: attemptCount !== "" ? Number(attemptCount) : undefined,
        timeSpentMin: timeSpentMin !== "" ? Number(timeSpentMin) : undefined,
      }),
    });
    setSavingProgress(false);
  }

  async function resolveAttempt(status: "completed" | "skipped" | "abandoned") {
    if (!currentAttempt?.id) return;
    await saveProgress();
    await fetch("/api/attempts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attemptId: currentAttempt.id, status }),
    });
    setCurrentAttempt(null);
    setEditingProgress(false);
    setProgressNote("");
    setBestPercent("");
    setAttemptCount("");
    setTimeSpentMin("");
    setReloadKey((k) => k + 1);
  }

  function clearGuestAttempt() {
    setCurrentAttempt(null);
    setEditingProgress(false);
  }

  function sortedHistory() {
    const arr = [...history];
    switch (sortBy) {
      case "date_asc":
        return arr.sort(
          (a, b) =>
            new Date(a.spunAt!).getTime() - new Date(b.spunAt!).getTime(),
        );
      case "name_asc":
        return arr.sort((a, b) => a.level.name.localeCompare(b.level.name));
      case "diff_asc":
        return arr.sort(
          (a, b) =>
            DIFF_ORDER.indexOf(a.level.difficulty) -
            DIFF_ORDER.indexOf(b.level.difficulty),
        );
      case "diff_desc":
        return arr.sort(
          (a, b) =>
            DIFF_ORDER.indexOf(b.level.difficulty) -
            DIFF_ORDER.indexOf(a.level.difficulty),
        );
      case "stars_desc":
        return arr.sort((a, b) => (b.level.stars ?? 0) - (a.level.stars ?? 0));
      case "percent_desc":
        return arr.sort((a, b) => (b.bestPercent ?? 0) - (a.bestPercent ?? 0));
      default:
        return arr;
    }
  }

  async function downloadExport() {
    const res = await fetch("/api/export");
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gd-roulette-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
    >
      <nav
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-1)",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          height: 56,
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-grotesk)",
            fontWeight: 700,
            color: "var(--accent)",
            fontSize: "1.1rem",
            marginRight: 32,
          }}
        >
          GD Roulette
        </span>
        {(["grind", "search", "history", "stats"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "0 16px",
              height: "100%",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 600,
              borderBottom:
                tab === t ? "2px solid var(--accent)" : "2px solid transparent",
              color: tab === t ? "var(--accent)" : "var(--text-2)",
              transition: "color 0.15s",
              textTransform: "capitalize",
            }}
          >
            {t}
          </button>
        ))}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          {isGuest ? (
            <>
              <span style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>
                Browsing as guest
              </span>
              <Link href="/login" className="btn btn-ghost btn-sm">
                Log in
              </Link>
              <Link href="/register" className="btn btn-primary btn-sm">
                Sign up
              </Link>
            </>
          ) : (
            <>
              <span style={{ fontSize: "0.8rem", color: "var(--text-3)" }}>
                {user!.name || user!.email}
              </span>
              <button onClick={downloadExport} className="btn btn-ghost btn-sm">
                ↓ Export
              </button>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="btn btn-ghost btn-sm"
              >
                Log out
              </button>
            </>
          )}
        </div>
      </nav>

      <div
        style={{
          flex: 1,
          padding: "32px 24px",
          maxWidth: 900,
          margin: "0 auto",
          width: "100%",
        }}
      >
        {isGuest && (tab === "grind" || tab === "search") && (
          <div
            className="card"
            style={{
              padding: "12px 18px",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              borderColor: "var(--border-2)",
            }}
          >
            <span style={{ fontSize: "0.82rem", color: "var(--text-2)" }}>
              🔒 You&apos;re browsing as a guest — spins work, but progress
              won&apos;t be saved.
            </span>
            <Link href="/register" className="btn btn-primary btn-sm">
              Create a free account
            </Link>
          </div>
        )}

        {/* ═══════════ GRIND TAB ═══════════ */}
        {tab === "grind" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {!currentAttempt && (
              <div className="card" style={{ padding: 28 }}>
                <h2
                  style={{
                    fontFamily: "var(--font-grotesk)",
                    fontSize: "1.1rem",
                    fontWeight: 700,
                    marginBottom: 20,
                  }}
                >
                  Get a random level
                </h2>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 20,
                    marginBottom: 20,
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.72rem",
                        color: "var(--text-2)",
                        marginBottom: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                      }}
                    >
                      Difficulty
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {DIFFICULTIES.map((d) => (
                        <button
                          key={d}
                          onClick={() => setDifficulty(d)}
                          style={{
                            padding: "5px 12px",
                            borderRadius: 20,
                            border: "1px solid",
                            borderColor:
                              difficulty === d
                                ? diffColor(d)
                                : "var(--border-2)",
                            background:
                              difficulty === d
                                ? diffColor(d) + "20"
                                : "transparent",
                            color:
                              difficulty === d ? diffColor(d) : "var(--text-2)",
                            fontSize: "0.75rem",
                            cursor: "pointer",
                            fontWeight: difficulty === d ? 600 : 400,
                            transition: "all 0.15s",
                          }}
                        >
                          {d === "any" ? "Any" : d}
                        </button>
                      ))}
                    </div>
                    {difficulty === "any" && (
                      <p
                        style={{
                          fontSize: "0.7rem",
                          color: "var(--text-3)",
                          marginTop: 8,
                        }}
                      >
                        &ldquo;Any&rdquo; picks a difficulty tier at random
                        first, then a level within it — every tier (including
                        Easy Demon) has an equal chance, regardless of how many
                        levels are cached per tier.
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.72rem",
                        color: "var(--text-2)",
                        marginBottom: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                      }}
                    >
                      Rating tier
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {RATING_TIERS.map((t) => (
                        <button
                          key={t}
                          onClick={() => setRatingTier(t)}
                          style={{
                            padding: "5px 12px",
                            borderRadius: 20,
                            border: "1px solid",
                            borderColor:
                              ratingTier === t
                                ? tierColor(t)
                                : "var(--border-2)",
                            background:
                              ratingTier === t
                                ? tierColor(t) + "22"
                                : "transparent",
                            color:
                              ratingTier === t ? tierColor(t) : "var(--text-2)",
                            fontSize: "0.75rem",
                            cursor: "pointer",
                            fontWeight: ratingTier === t ? 600 : 400,
                            transition: "all 0.15s",
                          }}
                        >
                          {t === "any" ? "Any" : tierLabel(t)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {!isGuest && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      marginBottom: 24,
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        cursor: "pointer",
                        fontSize: "0.85rem",
                        color: "var(--text-2)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={excludeCompleted}
                        onChange={(e) => setExcludeCompleted(e.target.checked)}
                        style={{
                          width: 16,
                          height: 16,
                          accentColor: "var(--accent)",
                          cursor: "pointer",
                        }}
                      />
                      Skip levels I&apos;ve already completed
                    </label>
                  </div>
                )}
                {spinError && (
                  <p
                    style={{
                      color: "var(--danger)",
                      fontSize: "0.85rem",
                      marginBottom: 16,
                    }}
                  >
                    {spinError}
                  </p>
                )}
                <button
                  onClick={handleSpin}
                  disabled={spinning}
                  className="btn btn-primary"
                  style={{ fontSize: "1rem", padding: "12px 32px" }}
                >
                  {spinning ? "Finding a level…" : "🎲 Get a random level"}
                </button>
              </div>
            )}

            {currentAttempt && (
              <div
                className="card glow-accent"
                style={{ padding: 28, borderColor: "var(--accent-2)" }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 20,
                    gap: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-grotesk)",
                          fontSize: "1.5rem",
                          fontWeight: 700,
                        }}
                      >
                        {currentAttempt.level.name}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        flexWrap: "wrap",
                        fontSize: "0.82rem",
                        color: "var(--text-2)",
                        alignItems: "center",
                      }}
                    >
                      <span>
                        by{" "}
                        <strong style={{ color: "var(--text)" }}>
                          {currentAttempt.level.author}
                        </strong>
                      </span>
                      <span
                        style={{
                          color: diffColor(currentAttempt.level.difficulty),
                          fontWeight: 600,
                        }}
                      >
                        {currentAttempt.level.difficulty}
                      </span>
                      {currentAttempt.level.stars > 0 && (
                        <span>⭐ {currentAttempt.level.stars}</span>
                      )}
                      <span
                        style={{
                          color: tierColor(currentAttempt.level.ratingTier),
                          fontWeight: 600,
                        }}
                      >
                        {tierLabel(currentAttempt.level.ratingTier)}
                      </span>
                      {currentAttempt.level.length && (
                        <span>📏 {currentAttempt.level.length}</span>
                      )}
                      {currentAttempt.level.downloads > 0 && (
                        <span>↓ {fmtNum(currentAttempt.level.downloads)}</span>
                      )}
                      {currentAttempt.level.likes > 0 && (
                        <span>♥ {fmtNum(currentAttempt.level.likes)}</span>
                      )}
                    </div>
                    {currentAttempt.level.description && (
                      <p
                        style={{
                          marginTop: 10,
                          fontSize: "0.82rem",
                          color: "var(--text-3)",
                          maxWidth: 480,
                          lineHeight: 1.6,
                        }}
                      >
                        {currentAttempt.level.description.slice(0, 200)}
                        {currentAttempt.level.description.length > 200
                          ? "…"
                          : ""}
                      </p>
                    )}
                    <a
                      href={`https://gdbrowser.com/${currentAttempt.level.gdId}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "inline-block",
                        marginTop: 8,
                        fontSize: "0.75rem",
                        color: "var(--accent)",
                        textDecoration: "none",
                      }}
                    >
                      View on GDBrowser ↗
                    </a>
                  </div>
                  {!isGuest && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        minWidth: 140,
                      }}
                    >
                      <div
                        className="card"
                        style={{ padding: "10px 14px", textAlign: "center" }}
                      >
                        <div
                          style={{
                            fontSize: "1.4rem",
                            fontWeight: 700,
                            color: "var(--accent)",
                          }}
                        >
                          {currentAttempt.bestPercent != null
                            ? `${currentAttempt.bestPercent}%`
                            : "–"}
                        </div>
                        <div
                          style={{
                            fontSize: "0.68rem",
                            color: "var(--text-2)",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                          }}
                        >
                          Best %
                        </div>
                      </div>
                      <div
                        className="card"
                        style={{ padding: "10px 14px", textAlign: "center" }}
                      >
                        <div
                          style={{
                            fontSize: "1.4rem",
                            fontWeight: 700,
                            color: "var(--text)",
                          }}
                        >
                          {currentAttempt.attemptCount || 0}
                        </div>
                        <div
                          style={{
                            fontSize: "0.68rem",
                            color: "var(--text-2)",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                          }}
                        >
                          Attempts
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {isGuest ? (
                  <div
                    className="card"
                    style={{
                      padding: "14px 18px",
                      marginBottom: 20,
                      background: "var(--bg-2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{ fontSize: "0.82rem", color: "var(--text-2)" }}
                    >
                      🔒 Log in to log progress, mark this complete, and see it
                      in your history.
                    </span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Link href="/register" className="btn btn-primary btn-sm">
                        Sign up
                      </Link>
                      <button
                        onClick={clearGuestAttempt}
                        className="btn btn-ghost btn-sm"
                      >
                        🎲 Spin again
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {!editingProgress ? (
                      <button
                        onClick={() => setEditingProgress(true)}
                        className="btn btn-ghost btn-sm"
                        style={{ marginBottom: 20 }}
                      >
                        ✏️ Log progress
                      </button>
                    ) : (
                      <div
                        className="card"
                        style={{
                          padding: 20,
                          marginBottom: 20,
                          background: "var(--bg-2)",
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr",
                            gap: 14,
                            marginBottom: 14,
                          }}
                        >
                          {[
                            {
                              label: "Best %",
                              value: bestPercent,
                              set: setBestPercent,
                              ph: "0–100",
                              type: "number",
                              min: 0,
                              max: 100,
                            },
                            {
                              label: "In-game attempts",
                              value: attemptCount,
                              set: setAttemptCount,
                              ph: "e.g. 420",
                              type: "number",
                              min: 0,
                            },
                            {
                              label: "Time spent (min)",
                              value: timeSpentMin,
                              set: setTimeSpentMin,
                              ph: "e.g. 90",
                              type: "number",
                              min: 0,
                            },
                          ].map(({ label, value, set, ph, type, min, max }) => (
                            <div key={label}>
                              <label
                                style={{
                                  display: "block",
                                  fontSize: "0.7rem",
                                  color: "var(--text-2)",
                                  marginBottom: 5,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.08em",
                                }}
                              >
                                {label}
                              </label>
                              <input
                                type={type}
                                value={value}
                                onChange={(e) => set(e.target.value)}
                                placeholder={ph}
                                min={min}
                                max={max}
                                style={{ padding: "8px 12px" }}
                              />
                            </div>
                          ))}
                        </div>
                        <div style={{ marginBottom: 14 }}>
                          <label
                            style={{
                              display: "block",
                              fontSize: "0.7rem",
                              color: "var(--text-2)",
                              marginBottom: 5,
                              textTransform: "uppercase",
                              letterSpacing: "0.08em",
                            }}
                          >
                            Notes
                          </label>
                          <textarea
                            value={progressNote}
                            onChange={(e) => setProgressNote(e.target.value)}
                            placeholder="What's your strategy? Hardest parts? Notes for yourself…"
                            rows={3}
                            style={{ resize: "vertical", minHeight: 80 }}
                          />
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={saveProgress}
                            disabled={savingProgress}
                            className="btn btn-ghost btn-sm"
                          >
                            {savingProgress ? "Saving…" : "💾 Save progress"}
                          </button>
                          <button
                            onClick={() => setEditingProgress(false)}
                            className="btn btn-ghost btn-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button
                        onClick={() => resolveAttempt("completed")}
                        className="btn btn-primary"
                      >
                        ✅ Completed!
                      </button>
                      <button
                        onClick={() => resolveAttempt("skipped")}
                        className="btn btn-ghost"
                      >
                        ⏭️ Skip
                      </button>
                      <button
                        onClick={() => resolveAttempt("abandoned")}
                        className="btn btn-danger btn-sm"
                      >
                        ✗ Abandon
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {currentAttempt && !isGuest && (
              <p
                style={{
                  fontSize: "0.82rem",
                  color: "var(--text-3)",
                  textAlign: "center",
                }}
              >
                Resolve or skip this level to get a new one.
              </p>
            )}
          </div>
        )}

        {/* ═══════════ SEARCH TAB ═══════════ */}
        {tab === "search" && (
          <div>
            <h2
              style={{
                fontFamily: "var(--font-grotesk)",
                fontSize: "1.1rem",
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              Search levels
            </h2>
            <p
              style={{
                fontSize: "0.78rem",
                color: "var(--text-3)",
                marginBottom: 20,
              }}
            >
              Browse the cached level pool directly and pick exactly what you
              want to grind. &ldquo;Newest added&rdquo; sorts by when our sync
              first found the level — GD&apos;s search API doesn&apos;t expose
              real upload dates.
            </p>

            <div className="card" style={{ padding: 20, marginBottom: 20 }}>
              <input
                type="text"
                placeholder="Search by level name or creator…"
                value={searchQ}
                onChange={(e) => {
                  setSearchQ(e.target.value);
                  setSearchPage(0);
                }}
                style={{ marginBottom: 14 }}
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 12,
                  marginBottom: 14,
                }}
              >
                <select
                  value={searchDiff}
                  onChange={(e) => {
                    setSearchDiff(e.target.value);
                    setSearchPage(0);
                  }}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    fontSize: "0.8rem",
                    background: "var(--bg-2)",
                    border: "1px solid var(--border-2)",
                    color: "var(--text)",
                    cursor: "pointer",
                  }}
                >
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {d === "any" ? "Any difficulty" : d}
                    </option>
                  ))}
                </select>
                <select
                  value={searchTier}
                  onChange={(e) => {
                    setSearchTier(e.target.value);
                    setSearchPage(0);
                  }}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    fontSize: "0.8rem",
                    background: "var(--bg-2)",
                    border: "1px solid var(--border-2)",
                    color: "var(--text)",
                    cursor: "pointer",
                  }}
                >
                  {RATING_TIERS.map((t) => (
                    <option key={t} value={t}>
                      {t === "any" ? "Any tier" : tierLabel(t)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  placeholder="Min likes"
                  value={minLikes}
                  onChange={(e) => {
                    setMinLikes(e.target.value);
                    setSearchPage(0);
                  }}
                  style={{ padding: "8px 10px" }}
                />
                <input
                  type="number"
                  min={0}
                  placeholder="Min downloads"
                  value={minDownloads}
                  onChange={(e) => {
                    setMinDownloads(e.target.value);
                    setSearchPage(0);
                  }}
                  style={{ padding: "8px 10px" }}
                />
              </div>
              <select
                value={searchSort}
                onChange={(e) => {
                  setSearchSort(e.target.value);
                  setSearchPage(0);
                }}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  fontSize: "0.8rem",
                  background: "var(--bg-2)",
                  border: "1px solid var(--border-2)",
                  color: "var(--text)",
                  cursor: "pointer",
                }}
              >
                {SEARCH_SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    Sort: {s.label}
                  </option>
                ))}
              </select>
            </div>

            {searchError && (
              <p
                style={{
                  color: "var(--danger)",
                  fontSize: "0.85rem",
                  marginBottom: 16,
                }}
              >
                {searchError}
              </p>
            )}
            {searchLoading && (
              <p
                style={{
                  color: "var(--text-2)",
                  textAlign: "center",
                  padding: 40,
                }}
              >
                Searching…
              </p>
            )}

            {!searchLoading && !searchError && (
              <>
                <p
                  style={{
                    fontSize: "0.78rem",
                    color: "var(--text-3)",
                    marginBottom: 12,
                  }}
                >
                  {searchTotal} level{searchTotal !== 1 ? "s" : ""} found
                </p>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    marginBottom: 20,
                  }}
                >
                  {searchResults.map((lvl) => (
                    <div
                      key={lvl.id}
                      className="card card-hover"
                      style={{
                        padding: "14px 18px",
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <span
                          style={{
                            fontFamily: "var(--font-grotesk)",
                            fontWeight: 600,
                            fontSize: "0.95rem",
                          }}
                        >
                          {lvl.name}
                        </span>
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: "0.75rem",
                            color: "var(--text-2)",
                          }}
                        >
                          by {lvl.author}
                        </span>
                        <div
                          style={{
                            display: "flex",
                            gap: 10,
                            marginTop: 4,
                            fontSize: "0.75rem",
                            color: "var(--text-2)",
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              color: diffColor(lvl.difficulty),
                              fontWeight: 600,
                            }}
                          >
                            {lvl.difficulty}
                          </span>
                          {lvl.stars > 0 && <span>⭐ {lvl.stars}</span>}
                          <span style={{ color: tierColor(lvl.ratingTier) }}>
                            {tierLabel(lvl.ratingTier)}
                          </span>
                          <span>♥ {fmtNum(lvl.likes)}</span>
                          <span>↓ {fmtNum(lvl.downloads)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => assignFromSearch(lvl)}
                        disabled={assigningId === lvl.id || !!currentAttempt}
                        className="btn btn-primary btn-sm"
                      >
                        {assigningId === lvl.id
                          ? "…"
                          : currentAttempt
                            ? "In progress"
                            : "Grind this"}
                      </button>
                    </div>
                  ))}
                  {searchResults.length === 0 && (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "40px 24px",
                        color: "var(--text-2)",
                      }}
                    >
                      No levels match those filters. Try loosening them, or sync
                      more levels.
                    </div>
                  )}
                </div>
                {(searchPage > 0 || searchHasMore) && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      gap: 10,
                    }}
                  >
                    <button
                      onClick={() => setSearchPage((p) => Math.max(0, p - 1))}
                      disabled={searchPage === 0}
                      className="btn btn-ghost btn-sm"
                    >
                      ← Prev
                    </button>
                    <span
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--text-2)",
                        alignSelf: "center",
                      }}
                    >
                      Page {searchPage + 1}
                    </span>
                    <button
                      onClick={() => setSearchPage((p) => p + 1)}
                      disabled={!searchHasMore}
                      className="btn btn-ghost btn-sm"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ═══════════ HISTORY TAB ═══════════ */}
        {tab === "history" &&
          (isGuest ? (
            <div className="card" style={{ padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: 16 }}>🔒</div>
              <h2
                style={{
                  fontFamily: "var(--font-grotesk)",
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                History requires an account
              </h2>
              <p
                style={{
                  color: "var(--text-2)",
                  fontSize: "0.85rem",
                  marginBottom: 20,
                }}
              >
                Sign up to save every level you grind and look back on your
                progress.
              </p>
              <Link href="/register" className="btn btn-primary">
                Create a free account
              </Link>
            </div>
          ) : (
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 20,
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <h2
                  style={{
                    fontFamily: "var(--font-grotesk)",
                    fontSize: "1.2rem",
                    fontWeight: 700,
                  }}
                >
                  Your grind history
                </h2>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      fontSize: "0.8rem",
                      background: "var(--bg-2)",
                      border: "1px solid var(--border-2)",
                      color: "var(--text)",
                      cursor: "pointer",
                    }}
                  >
                    {STATUS_FILTERS.map((s) => (
                      <option key={s} value={s}>
                        {s === "all"
                          ? "All statuses"
                          : s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      fontSize: "0.8rem",
                      background: "var(--bg-2)",
                      border: "1px solid var(--border-2)",
                      color: "var(--text)",
                      cursor: "pointer",
                    }}
                  >
                    {HISTORY_SORTS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={downloadExport}
                    className="btn btn-ghost btn-sm"
                  >
                    ↓ Export JSON
                  </button>
                </div>
              </div>

              {historyLoading && (
                <p
                  style={{
                    color: "var(--text-2)",
                    textAlign: "center",
                    padding: 40,
                  }}
                >
                  Loading…
                </p>
              )}
              {!historyLoading && sortedHistory().length === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "60px 24px",
                    color: "var(--text-2)",
                  }}
                >
                  <div style={{ fontSize: "2.5rem", marginBottom: 16 }}>🎲</div>
                  <p>No records yet. Go grind some levels!</p>
                </div>
              )}

              {!historyLoading && (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {sortedHistory().map((a) => {
                    const expanded = expandedId === a.id;
                    const statusColors: Record<string, string> = {
                      pending: "var(--warn)",
                      completed: "var(--success)",
                      skipped: "var(--text-2)",
                      abandoned: "var(--danger)",
                    };
                    return (
                      <div
                        key={a.id}
                        className="card card-hover"
                        style={{ overflow: "hidden" }}
                      >
                        <div
                          onClick={() => setExpandedId(expanded ? null : a.id)}
                          style={{
                            padding: "14px 20px",
                            display: "flex",
                            alignItems: "center",
                            gap: 14,
                            cursor: "pointer",
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background:
                                statusColors[a.status] ?? "var(--text-2)",
                              flexShrink: 0,
                            }}
                          />
                          <div style={{ flex: 1, minWidth: 180 }}>
                            <span
                              style={{
                                fontFamily: "var(--font-grotesk)",
                                fontWeight: 600,
                                fontSize: "0.95rem",
                              }}
                            >
                              {a.level.name}
                            </span>
                            <span
                              style={{
                                marginLeft: 10,
                                fontSize: "0.75rem",
                                color: diffColor(a.level.difficulty),
                              }}
                            >
                              {a.level.difficulty}
                            </span>
                            {a.level.ratingTier !== "none" && (
                              <span
                                style={{
                                  marginLeft: 8,
                                  fontSize: "0.72rem",
                                  color: tierColor(a.level.ratingTier),
                                }}
                              >
                                {tierLabel(a.level.ratingTier)}
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: 16,
                              fontSize: "0.78rem",
                              color: "var(--text-2)",
                              alignItems: "center",
                            }}
                          >
                            {a.bestPercent != null && (
                              <span
                                style={{
                                  color: "var(--accent)",
                                  fontWeight: 600,
                                }}
                              >
                                {a.bestPercent}%
                              </span>
                            )}
                            {!!a.attemptCount && (
                              <span>{a.attemptCount} att.</span>
                            )}
                            {!!a.timeSpentMin && (
                              <span>{fmtTime(a.timeSpentMin)}</span>
                            )}
                            <span
                              style={{
                                color:
                                  statusColors[a.status] ?? "var(--text-2)",
                                fontWeight: 600,
                                textTransform: "capitalize",
                              }}
                            >
                              {a.status}
                            </span>
                            <span style={{ color: "var(--text-3)" }}>
                              {a.spunAt
                                ? new Date(a.spunAt).toLocaleDateString()
                                : ""}
                            </span>
                          </div>
                          <span
                            style={{
                              color: "var(--text-3)",
                              fontSize: "0.8rem",
                            }}
                          >
                            {expanded ? "▲" : "▼"}
                          </span>
                        </div>
                        {expanded && (
                          <div
                            style={{
                              padding: "0 20px 20px",
                              borderTop: "1px solid var(--border)",
                            }}
                          >
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr 1fr",
                                gap: 12,
                                marginTop: 16,
                                marginBottom: 16,
                              }}
                            >
                              {[
                                ["Author", a.level.author],
                                [
                                  "Stars",
                                  a.level.stars ? `${a.level.stars}⭐` : "–",
                                ],
                                ["Length", a.level.length || "–"],
                                ["Downloads", fmtNum(a.level.downloads)],
                                ["Likes", fmtNum(a.level.likes)],
                                [
                                  "Objects",
                                  a.level.objects
                                    ? fmtNum(a.level.objects)
                                    : "–",
                                ],
                              ].map(([k, v]) => (
                                <div key={k}>
                                  <div
                                    style={{
                                      fontSize: "0.65rem",
                                      color: "var(--text-3)",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.08em",
                                      marginBottom: 3,
                                    }}
                                  >
                                    {k}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "0.85rem",
                                      color: "var(--text)",
                                    }}
                                  >
                                    {v}
                                  </div>
                                </div>
                              ))}
                            </div>
                            {a.progressNote && (
                              <div
                                style={{
                                  background: "var(--bg-2)",
                                  borderRadius: 8,
                                  padding: "12px 14px",
                                  marginBottom: 12,
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "0.65rem",
                                    color: "var(--text-3)",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.08em",
                                    marginBottom: 6,
                                  }}
                                >
                                  Notes
                                </div>
                                <p
                                  style={{
                                    fontSize: "0.85rem",
                                    color: "var(--text-2)",
                                    lineHeight: 1.6,
                                    margin: 0,
                                  }}
                                >
                                  {a.progressNote}
                                </p>
                              </div>
                            )}
                            <a
                              href={`https://gdbrowser.com/${a.level.gdId}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                fontSize: "0.75rem",
                                color: "var(--accent)",
                                textDecoration: "none",
                              }}
                            >
                              View on GDBrowser ↗
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

        {/* ═══════════ STATS TAB ═══════════ */}
        {tab === "stats" &&
          (isGuest ? (
            <div className="card" style={{ padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: 16 }}>🔒</div>
              <h2
                style={{
                  fontFamily: "var(--font-grotesk)",
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                Stats require an account
              </h2>
              <p
                style={{
                  color: "var(--text-2)",
                  fontSize: "0.85rem",
                  marginBottom: 20,
                }}
              >
                Sign up to track your completion rate, time invested, and more.
              </p>
              <Link href="/register" className="btn btn-primary">
                Create a free account
              </Link>
            </div>
          ) : (
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 24,
                }}
              >
                <h2
                  style={{
                    fontFamily: "var(--font-grotesk)",
                    fontSize: "1.2rem",
                    fontWeight: 700,
                  }}
                >
                  Your stats
                </h2>
                <button
                  onClick={downloadExport}
                  className="btn btn-ghost btn-sm"
                >
                  ↓ Export JSON
                </button>
              </div>

              {statsLoading && (
                <p
                  style={{
                    color: "var(--text-2)",
                    textAlign: "center",
                    padding: 40,
                  }}
                >
                  Loading…
                </p>
              )}

              {stats && (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 20 }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(140px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {[
                      {
                        label: "Total spins",
                        value: stats.total,
                        color: "var(--text)",
                      },
                      {
                        label: "Completed",
                        value: stats.completed,
                        color: "var(--success)",
                      },
                      {
                        label: "Skipped",
                        value: stats.skipped,
                        color: "var(--text-2)",
                      },
                      {
                        label: "Abandoned",
                        value: stats.abandoned,
                        color: "var(--danger)",
                      },
                      {
                        label: "Completion rate",
                        value: `${Math.round(stats.completionRate * 100)}%`,
                        color: "var(--accent)",
                      },
                      {
                        label: "Total in-game att.",
                        value: fmtNum(stats.totalAttempts),
                        color: "var(--text)",
                      },
                      {
                        label: "Total time",
                        value: fmtTime(stats.totalTimeMins),
                        color: "var(--text)",
                      },
                    ].map(({ label, value, color }) => (
                      <div
                        key={label}
                        className="card"
                        style={{ padding: "18px 20px" }}
                      >
                        <div
                          style={{
                            fontFamily: "var(--font-grotesk)",
                            fontSize: "1.6rem",
                            fontWeight: 700,
                            color,
                          }}
                        >
                          {value}
                        </div>
                        <div
                          style={{
                            fontSize: "0.72rem",
                            color: "var(--text-2)",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            marginTop: 4,
                          }}
                        >
                          {label}
                        </div>
                      </div>
                    ))}
                  </div>

                  {stats.byDifficulty.length > 0 && (
                    <div className="card" style={{ padding: 24 }}>
                      <h3
                        style={{
                          fontFamily: "var(--font-grotesk)",
                          fontSize: "0.9rem",
                          fontWeight: 700,
                          marginBottom: 16,
                          color: "var(--text-2)",
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                        }}
                      >
                        Completions by difficulty
                      </h3>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        {stats.byDifficulty
                          .sort(
                            (a, b) =>
                              DIFF_ORDER.indexOf(a.difficulty) -
                              DIFF_ORDER.indexOf(b.difficulty),
                          )
                          .map(({ difficulty, count }) => {
                            const pct =
                              stats.completed > 0
                                ? (count / stats.completed) * 100
                                : 0;
                            return (
                              <div key={difficulty}>
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    marginBottom: 5,
                                    fontSize: "0.82rem",
                                  }}
                                >
                                  <span
                                    style={{ color: diffColor(difficulty) }}
                                  >
                                    {difficulty}
                                  </span>
                                  <span style={{ color: "var(--text-2)" }}>
                                    {count}
                                  </span>
                                </div>
                                <div
                                  style={{
                                    height: 6,
                                    background: "var(--bg-3)",
                                    borderRadius: 3,
                                    overflow: "hidden",
                                  }}
                                >
                                  <div
                                    style={{
                                      height: "100%",
                                      width: `${pct}%`,
                                      background: diffColor(difficulty),
                                      borderRadius: 3,
                                      transition: "width 0.6s ease",
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {stats.byRatingTier.length > 0 && (
                    <div className="card" style={{ padding: 24 }}>
                      <h3
                        style={{
                          fontFamily: "var(--font-grotesk)",
                          fontSize: "0.9rem",
                          fontWeight: 700,
                          marginBottom: 16,
                          color: "var(--text-2)",
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                        }}
                      >
                        Completions by rating tier
                      </h3>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        {stats.byRatingTier
                          .sort(
                            (a, b) =>
                              TIER_ORDER.indexOf(a.ratingTier) -
                              TIER_ORDER.indexOf(b.ratingTier),
                          )
                          .map(({ ratingTier, count }) => {
                            const pct =
                              stats.completed > 0
                                ? (count / stats.completed) * 100
                                : 0;
                            return (
                              <div key={ratingTier}>
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    marginBottom: 5,
                                    fontSize: "0.82rem",
                                  }}
                                >
                                  <span
                                    style={{ color: tierColor(ratingTier) }}
                                  >
                                    {tierLabel(ratingTier)}
                                  </span>
                                  <span style={{ color: "var(--text-2)" }}>
                                    {count}
                                  </span>
                                </div>
                                <div
                                  style={{
                                    height: 6,
                                    background: "var(--bg-3)",
                                    borderRadius: 3,
                                    overflow: "hidden",
                                  }}
                                >
                                  <div
                                    style={{
                                      height: "100%",
                                      width: `${pct}%`,
                                      background: tierColor(ratingTier),
                                      borderRadius: 3,
                                      transition: "width 0.6s ease",
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {stats.total === 0 && (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "60px 24px",
                        color: "var(--text-2)",
                      }}
                    >
                      <div style={{ fontSize: "2.5rem", marginBottom: 16 }}>
                        📊
                      </div>
                      <p>
                        No data yet. Spin a level to start building your stats!
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
