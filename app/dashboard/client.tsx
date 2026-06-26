"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Level {
  id: string; gdId: number; name: string; author: string;
  difficulty: string; isDemon: boolean; stars: number;
  ratingTier: string; downloads: number; likes: number;
  length: string | null; objects: number | null;
  songName: string | null; songAuthor: string | null;
  description: string | null;
}
interface Attempt {
  id: string; status: string; spunAt: string | Date; resolvedAt: string | Date | null;
  progressNote: string | null; bestPercent: number | null;
  attemptCount: number; timeSpentMin: number;
  requestedDiff: string | null; requestedTier: string | null;
  level: Level;
}
interface Stats {
  total: number; completed: number; skipped: number; abandoned: number;
  pending: number; completionRate: number;
  totalAttempts: number; totalTimeMins: number;
  byDifficulty: { difficulty: string; count: number }[];
  byRatingTier: { ratingTier: string; count: number }[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DIFFICULTIES = [
  "any", "Auto", "Easy", "Normal", "Hard", "Harder", "Insane",
  "Easy Demon", "Medium Demon", "Hard Demon", "Insane Demon", "Extreme Demon",
];
const RATING_TIERS = ["any", "none", "rated", "featured", "epic", "legendary", "mythic"];
const SORT_OPTIONS = [
  { value: "date_desc", label: "Newest first" },
  { value: "date_asc",  label: "Oldest first" },
  { value: "name_asc",  label: "Level name A–Z" },
  { value: "diff_asc",  label: "Difficulty (easy→hard)" },
  { value: "diff_desc", label: "Difficulty (hard→easy)" },
  { value: "stars_desc",label: "Stars (most)" },
  { value: "percent_desc", label: "Best % (highest)" },
];
const STATUS_FILTERS = ["all", "pending", "completed", "skipped", "abandoned"];

const DIFF_ORDER = ["Auto","Easy","Normal","Hard","Harder","Insane","Easy Demon","Medium Demon","Hard Demon","Insane Demon","Extreme Demon"];
const TIER_ORDER = ["none","rated","featured","epic","legendary","mythic"];

function diffColor(d: string) {
  const map: Record<string, string> = {
    "Auto":"var(--diff-auto)","Easy":"var(--diff-easy)","Normal":"var(--diff-normal)",
    "Hard":"var(--diff-hard)","Harder":"var(--diff-harder)","Insane":"var(--diff-insane)",
    "Easy Demon":"var(--diff-edemon)","Medium Demon":"var(--diff-mdemon)",
    "Hard Demon":"var(--diff-hdemon)","Insane Demon":"var(--diff-idemon)","Extreme Demon":"var(--diff-xdemon)",
  };
  return map[d] ?? "var(--text-2)";
}
function tierColor(t: string) {
  const map: Record<string,string> = {
    none:"var(--tier-none)",rated:"var(--tier-rated)",featured:"var(--tier-featured)",
    epic:"var(--tier-epic)",legendary:"var(--tier-legendary)",mythic:"var(--tier-mythic)",
  };
  return map[t] ?? "var(--text-2)";
}
function tierLabel(t: string) { return t.charAt(0).toUpperCase() + t.slice(1); }
function fmtTime(mins: number) {
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins/60)}h ${mins%60}m`;
}
function fmtNum(n: number) {
  if (n >= 1_000_000) return (n/1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n/1_000).toFixed(1) + "K";
  return String(n);
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function DashboardClient({ user }: { user: { id: string; email: string; name?: string | null } }) {
  const [tab, setTab] = useState<"grind"|"history"|"stats">("grind");

  // Grind tab state
  const [difficulty, setDifficulty] = useState("any");
  const [ratingTier, setRatingTier] = useState("any");
  const [excludeCompleted, setExcludeCompleted] = useState(true);
  const [currentAttempt, setCurrentAttempt] = useState<Attempt | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [spinError, setSpinError] = useState("");

  // Progress editor state
  const [editingProgress, setEditingProgress] = useState(false);
  const [progressNote, setProgressNote] = useState("");
  const [bestPercent, setBestPercent] = useState<string>("");
  const [attemptCount, setAttemptCount] = useState<string>("");
  const [timeSpentMin, setTimeSpentMin] = useState<string>("");
  const [savingProgress, setSavingProgress] = useState(false);

  // History tab state
  const [history, setHistory] = useState<Attempt[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date_desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Stats tab state
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey(k => k + 1);

  // Load pending attempt on mount
  useEffect(() => {
    let cancelled = false;
    async function loadPending() {
      const res = await fetch("/api/attempts?status=pending");
      if (cancelled || !res.ok) return;
      const data = await res.json();
      if (!cancelled && data.attempts?.length > 0) {
        const a = data.attempts[0];
        setCurrentAttempt(a);
        setProgressNote(a.progressNote ?? "");
        setBestPercent(a.bestPercent != null ? String(a.bestPercent) : "");
        setAttemptCount(a.attemptCount ? String(a.attemptCount) : "");
        setTimeSpentMin(a.timeSpentMin ? String(a.timeSpentMin) : "");
      }
    }
    loadPending();
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Load history when tab is active
  useEffect(() => {
    if (tab !== "history") return;
    let cancelled = false;
    async function loadHistory() {
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
    loadHistory();
    return () => { cancelled = true; };
  }, [tab, statusFilter, reloadKey]);

  // Load stats when tab is active
  useEffect(() => {
    if (tab !== "stats") return;
    let cancelled = false;
    async function loadStats() {
      if (!cancelled) setStatsLoading(true);
      const res = await fetch("/api/stats");
      if (cancelled || !res.ok) return;
      const data = await res.json();
      if (!cancelled) { setStats(data); setStatsLoading(false); }
    }
    loadStats();
    return () => { cancelled = true; };
  }, [tab, reloadKey]);

  // Spin
  async function handleSpin() {
    setSpinError(""); setSpinning(true);
    const res = await fetch("/api/levels/random", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ difficulty: difficulty === "any" ? undefined : difficulty, ratingTier: ratingTier === "any" ? undefined : ratingTier, excludeCompleted }),
    });
    setSpinning(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setSpinError(d.error ?? "Failed to get a level.");
      return;
    }
    const data = await res.json();
    const a = data.attempt;
    setCurrentAttempt(a);
    setProgressNote(a.progressNote ?? "");
    setBestPercent(a.bestPercent != null ? String(a.bestPercent) : "");
    setAttemptCount(a.attemptCount ? String(a.attemptCount) : "");
    setTimeSpentMin(a.timeSpentMin ? String(a.timeSpentMin) : "");
    setEditingProgress(false);
  }

  // Save progress mid-grind (doesn't resolve)
  async function saveProgress() {
    if (!currentAttempt) return;
    setSavingProgress(true);
    await fetch("/api/attempts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId:    currentAttempt.id,
        progressNote: progressNote || undefined,
        bestPercent:  bestPercent !== "" ? Number(bestPercent) : undefined,
        attemptCount: attemptCount !== "" ? Number(attemptCount) : undefined,
        timeSpentMin: timeSpentMin !== "" ? Number(timeSpentMin) : undefined,
      }),
    });
    setSavingProgress(false);
  }

  // Resolve attempt
  async function resolveAttempt(status: "completed" | "skipped" | "abandoned") {
    if (!currentAttempt) return;
    await saveProgress();
    await fetch("/api/attempts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attemptId: currentAttempt.id, status }),
    });
    setCurrentAttempt(null);
    setEditingProgress(false);
    setProgressNote(""); setBestPercent(""); setAttemptCount(""); setTimeSpentMin("");
    reload();
  }

  // Sort history
  function sortedHistory() {
    const arr = [...history];
    switch (sortBy) {
      case "date_asc":   return arr.sort((a, b) => new Date(a.spunAt).getTime() - new Date(b.spunAt).getTime());
      case "name_asc":   return arr.sort((a, b) => a.level.name.localeCompare(b.level.name));
      case "diff_asc":   return arr.sort((a, b) => DIFF_ORDER.indexOf(a.level.difficulty) - DIFF_ORDER.indexOf(b.level.difficulty));
      case "diff_desc":  return arr.sort((a, b) => DIFF_ORDER.indexOf(b.level.difficulty) - DIFF_ORDER.indexOf(a.level.difficulty));
      case "stars_desc": return arr.sort((a, b) => (b.level.stars ?? 0) - (a.level.stars ?? 0));
      case "percent_desc": return arr.sort((a, b) => (b.bestPercent ?? 0) - (a.bestPercent ?? 0));
      default: return arr; // date_desc (already from API)
    }
  }

  // Download JSON export
  async function downloadExport() {
    const res = await fetch("/api/export");
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gd-roulette-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Nav */}
      <nav style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-1)", padding: "0 24px", display: "flex", alignItems: "center", height: 56, gap: 0, position: "sticky", top: 0, zIndex: 50 }}>
        <span style={{ fontFamily: "var(--font-grotesk)", fontWeight: 700, color: "var(--accent)", fontSize: "1.1rem", marginRight: 32 }}>GD Roulette</span>
        {(["grind","history","stats"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: "0 16px", height: "100%", background: "none", border: "none", cursor: "pointer", fontSize: "0.875rem", fontWeight: 600, borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent", color: tab === t ? "var(--accent)" : "var(--text-2)", transition: "color 0.15s", textTransform: "capitalize" }}>
            {t}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: "0.8rem", color: "var(--text-3)" }}>{user.name || user.email}</span>
          <button onClick={downloadExport} className="btn btn-ghost btn-sm" title="Download JSON export">
            ↓ Export
          </button>
          <button onClick={() => signOut({ callbackUrl: "/" })} className="btn btn-ghost btn-sm">Log out</button>
        </div>
      </nav>

      {/* Content */}
      <div style={{ flex: 1, padding: "32px 24px", maxWidth: 900, margin: "0 auto", width: "100%" }}>

        {/* ── GRIND TAB ── */}
        {tab === "grind" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Filter Panel */}
            {!currentAttempt && (
              <div className="card" style={{ padding: 28 }}>
                <h2 style={{ fontFamily: "var(--font-grotesk)", fontSize: "1.1rem", fontWeight: 700, marginBottom: 20 }}>Get a random level</h2>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
                  {/* Difficulty */}
                  <div>
                    <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>Difficulty</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {DIFFICULTIES.map(d => (
                        <button key={d} onClick={() => setDifficulty(d)} style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid", borderColor: difficulty === d ? diffColor(d) : "var(--border-2)", background: difficulty === d ? diffColor(d) + "20" : "transparent", color: difficulty === d ? diffColor(d) : "var(--text-2)", fontSize: "0.75rem", cursor: "pointer", fontWeight: difficulty === d ? 600 : 400, transition: "all 0.15s" }}>
                          {d === "any" ? "Any" : d}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Rating Tier */}
                  <div>
                    <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>Rating tier</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {RATING_TIERS.map(t => (
                        <button key={t} onClick={() => setRatingTier(t)} style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid", borderColor: ratingTier === t ? tierColor(t) : "var(--border-2)", background: ratingTier === t ? tierColor(t) + "22" : "transparent", color: ratingTier === t ? tierColor(t) : "var(--text-2)", fontSize: "0.75rem", cursor: "pointer", fontWeight: ratingTier === t ? 600 : 400, transition: "all 0.15s" }}>
                          {t === "any" ? "Any" : tierLabel(t)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.85rem", color: "var(--text-2)" }}>
                    <input type="checkbox" checked={excludeCompleted} onChange={e => setExcludeCompleted(e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--accent)", cursor: "pointer" }} />
                    Skip levels I&apos;ve already completed
                  </label>
                </div>

                {spinError && <p style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: 16 }}>{spinError}</p>}

                <button onClick={handleSpin} disabled={spinning} className="btn btn-primary" style={{ fontSize: "1rem", padding: "12px 32px" }}>
                  {spinning ? "Finding a level…" : "🎲 Get a random level"}
                </button>
              </div>
            )}

            {/* Current Level Card */}
            {currentAttempt && (
              <div className="card glow-accent" style={{ padding: 28, borderColor: "var(--accent-2)" }}>
                {/* Level header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span style={{ fontFamily: "var(--font-grotesk)", fontSize: "1.5rem", fontWeight: 700 }}>{currentAttempt.level.name}</span>
                    </div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: "0.82rem", color: "var(--text-2)", alignItems: "center" }}>
                      <span>by <strong style={{ color: "var(--text)" }}>{currentAttempt.level.author}</strong></span>
                      <span style={{ color: diffColor(currentAttempt.level.difficulty), fontWeight: 600 }}>{currentAttempt.level.difficulty}</span>
                      {currentAttempt.level.stars > 0 && <span>⭐ {currentAttempt.level.stars}</span>}
                      <span style={{ color: tierColor(currentAttempt.level.ratingTier), fontWeight: 600 }}>{tierLabel(currentAttempt.level.ratingTier)}</span>
                      {currentAttempt.level.length && <span>📏 {currentAttempt.level.length}</span>}
                      {currentAttempt.level.downloads > 0 && <span>↓ {fmtNum(currentAttempt.level.downloads)}</span>}
                      {currentAttempt.level.likes > 0 && <span>♥ {fmtNum(currentAttempt.level.likes)}</span>}
                    </div>
                    {currentAttempt.level.description && (
                      <p style={{ marginTop: 10, fontSize: "0.82rem", color: "var(--text-3)", maxWidth: 480, lineHeight: 1.6 }}>{currentAttempt.level.description.slice(0, 200)}{currentAttempt.level.description.length > 200 ? "…" : ""}</p>
                    )}
                    <a href={`https://gdbrowser.com/${currentAttempt.level.gdId}`} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8, fontSize: "0.75rem", color: "var(--accent)", textDecoration: "none" }}>
                      View on GDBrowser ↗
                    </a>
                  </div>

                  {/* Stat pills */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 140 }}>
                    <div className="card" style={{ padding: "10px 14px", textAlign: "center" }}>
                      <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--accent)" }}>{currentAttempt.bestPercent != null ? `${currentAttempt.bestPercent}%` : "–"}</div>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Best %</div>
                    </div>
                    <div className="card" style={{ padding: "10px 14px", textAlign: "center" }}>
                      <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--text)" }}>{currentAttempt.attemptCount || 0}</div>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Attempts</div>
                    </div>
                  </div>
                </div>

                {/* Progress editor toggle */}
                {!editingProgress ? (
                  <button onClick={() => setEditingProgress(true)} className="btn btn-ghost btn-sm" style={{ marginBottom: 20 }}>
                    ✏️ Log progress
                  </button>
                ) : (
                  <div className="card" style={{ padding: 20, marginBottom: 20, background: "var(--bg-2)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                      {[
                        { label: "Best %", value: bestPercent, set: setBestPercent, ph: "0–100", type: "number", min: 0, max: 100 },
                        { label: "In-game attempts", value: attemptCount, set: setAttemptCount, ph: "e.g. 420", type: "number", min: 0 },
                        { label: "Time spent (min)", value: timeSpentMin, set: setTimeSpentMin, ph: "e.g. 90", type: "number", min: 0 },
                      ].map(({ label, value, set, ph, type, min, max }) => (
                        <div key={label}>
                          <label style={{ display: "block", fontSize: "0.7rem", color: "var(--text-2)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</label>
                          <input type={type} value={value} onChange={e => set(e.target.value)} placeholder={ph} min={min} max={max} style={{ padding: "8px 12px" }} />
                        </div>
                      ))}
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ display: "block", fontSize: "0.7rem", color: "var(--text-2)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>Notes</label>
                      <textarea value={progressNote} onChange={e => setProgressNote(e.target.value)} placeholder="What's your strategy? Hardest parts? Notes for yourself…" rows={3} style={{ resize: "vertical", minHeight: 80 }} />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={saveProgress} disabled={savingProgress} className="btn btn-ghost btn-sm">
                        {savingProgress ? "Saving…" : "💾 Save progress"}
                      </button>
                      <button onClick={() => setEditingProgress(false)} className="btn btn-ghost btn-sm">Cancel</button>
                    </div>
                  </div>
                )}

                {/* Resolve actions */}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={() => resolveAttempt("completed")} className="btn btn-primary">
                    ✅ Completed!
                  </button>
                  <button onClick={() => resolveAttempt("skipped")} className="btn btn-ghost">
                    ⏭️ Skip
                  </button>
                  <button onClick={() => resolveAttempt("abandoned")} className="btn btn-danger btn-sm">
                    ✗ Abandon
                  </button>
                </div>
              </div>
            )}

            {/* If no pending: option to spin */}
            {currentAttempt && (
              <p style={{ fontSize: "0.82rem", color: "var(--text-3)", textAlign: "center" }}>
                Resolve or skip this level to get a new one.
              </p>
            )}
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === "history" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
              <h2 style={{ fontFamily: "var(--font-grotesk)", fontSize: "1.2rem", fontWeight: 700 }}>Your grind history</h2>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                {/* Status filter */}
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: "6px 12px", borderRadius: 8, fontSize: "0.8rem", background: "var(--bg-2)", border: "1px solid var(--border-2)", color: "var(--text)", cursor: "pointer" }}>
                  {STATUS_FILTERS.map(s => <option key={s} value={s}>{s === "all" ? "All statuses" : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
                {/* Sort */}
                <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: "6px 12px", borderRadius: 8, fontSize: "0.8rem", background: "var(--bg-2)", border: "1px solid var(--border-2)", color: "var(--text)", cursor: "pointer" }}>
                  {SORT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <button onClick={downloadExport} className="btn btn-ghost btn-sm">↓ Export JSON</button>
              </div>
            </div>

            {historyLoading && <p style={{ color: "var(--text-2)", textAlign: "center", padding: 40 }}>Loading…</p>}

            {!historyLoading && sortedHistory().length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--text-2)" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: 16 }}>🎲</div>
                <p>No records yet. Go grind some levels!</p>
              </div>
            )}

            {!historyLoading && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sortedHistory().map((a) => {
                  const expanded = expandedId === a.id;
                  const statusColors: Record<string,string> = {
                    pending: "var(--warn)", completed: "var(--success)",
                    skipped: "var(--text-2)", abandoned: "var(--danger)",
                  };
                  return (
                    <div key={a.id} className="card card-hover" style={{ overflow: "hidden" }}>
                      {/* Row */}
                      <div onClick={() => setExpandedId(expanded ? null : a.id)} style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", flexWrap: "wrap" }}>
                        {/* Status dot */}
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColors[a.status] ?? "var(--text-2)", flexShrink: 0 }} />
                        {/* Level name + diff */}
                        <div style={{ flex: 1, minWidth: 180 }}>
                          <span style={{ fontFamily: "var(--font-grotesk)", fontWeight: 600, fontSize: "0.95rem" }}>{a.level.name}</span>
                          <span style={{ marginLeft: 10, fontSize: "0.75rem", color: diffColor(a.level.difficulty) }}>{a.level.difficulty}</span>
                          {a.level.ratingTier !== "none" && <span style={{ marginLeft: 8, fontSize: "0.72rem", color: tierColor(a.level.ratingTier) }}>{tierLabel(a.level.ratingTier)}</span>}
                        </div>
                        {/* Stats */}
                        <div style={{ display: "flex", gap: 16, fontSize: "0.78rem", color: "var(--text-2)", alignItems: "center" }}>
                          {a.bestPercent != null && <span style={{ color: "var(--accent)", fontWeight: 600 }}>{a.bestPercent}%</span>}
                          {a.attemptCount > 0 && <span>{a.attemptCount} att.</span>}
                          {a.timeSpentMin > 0 && <span>{fmtTime(a.timeSpentMin)}</span>}
                          <span style={{ color: statusColors[a.status] ?? "var(--text-2)", fontWeight: 600, textTransform: "capitalize" }}>{a.status}</span>
                          <span style={{ color: "var(--text-3)" }}>{new Date(a.spunAt).toLocaleDateString()}</span>
                        </div>
                        <span style={{ color: "var(--text-3)", fontSize: "0.8rem" }}>{expanded ? "▲" : "▼"}</span>
                      </div>

                      {/* Expanded detail */}
                      {expanded && (
                        <div style={{ padding: "0 20px 20px", borderTop: "1px solid var(--border)" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 16, marginBottom: 16 }}>
                            {[
                              ["Author", a.level.author],
                              ["Stars", a.level.stars ? `${a.level.stars}⭐` : "–"],
                              ["Length", a.level.length || "–"],
                              ["Downloads", fmtNum(a.level.downloads)],
                              ["Likes", fmtNum(a.level.likes)],
                              ["Objects", a.level.objects ? fmtNum(a.level.objects) : "–"],
                            ].map(([k,v]) => (
                              <div key={k}>
                                <div style={{ fontSize: "0.65rem", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{k}</div>
                                <div style={{ fontSize: "0.85rem", color: "var(--text)" }}>{v}</div>
                              </div>
                            ))}
                          </div>
                          {a.progressNote && (
                            <div style={{ background: "var(--bg-2)", borderRadius: 8, padding: "12px 14px", marginBottom: 12 }}>
                              <div style={{ fontSize: "0.65rem", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Notes</div>
                              <p style={{ fontSize: "0.85rem", color: "var(--text-2)", lineHeight: 1.6, margin: 0 }}>{a.progressNote}</p>
                            </div>
                          )}
                          <a href={`https://gdbrowser.com/${a.level.gdId}`} target="_blank" rel="noreferrer" style={{ fontSize: "0.75rem", color: "var(--accent)", textDecoration: "none" }}>
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
        )}

        {/* ── STATS TAB ── */}
        {tab === "stats" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <h2 style={{ fontFamily: "var(--font-grotesk)", fontSize: "1.2rem", fontWeight: 700 }}>Your stats</h2>
              <button onClick={downloadExport} className="btn btn-ghost btn-sm">↓ Export JSON</button>
            </div>

            {statsLoading && <p style={{ color: "var(--text-2)", textAlign: "center", padding: 40 }}>Loading…</p>}

            {stats && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Top stat row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
                  {[
                    { label: "Total spins", value: stats.total, color: "var(--text)" },
                    { label: "Completed", value: stats.completed, color: "var(--success)" },
                    { label: "Skipped", value: stats.skipped, color: "var(--text-2)" },
                    { label: "Abandoned", value: stats.abandoned, color: "var(--danger)" },
                    { label: "Completion rate", value: `${Math.round(stats.completionRate * 100)}%`, color: "var(--accent)" },
                    { label: "Total in-game att.", value: fmtNum(stats.totalAttempts), color: "var(--text)" },
                    { label: "Total time", value: fmtTime(stats.totalTimeMins), color: "var(--text)" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="card" style={{ padding: "18px 20px" }}>
                      <div style={{ fontFamily: "var(--font-grotesk)", fontSize: "1.6rem", fontWeight: 700, color }}>{value}</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* Completions by difficulty */}
                {stats.byDifficulty.length > 0 && (
                  <div className="card" style={{ padding: 24 }}>
                    <h3 style={{ fontFamily: "var(--font-grotesk)", fontSize: "0.9rem", fontWeight: 700, marginBottom: 16, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Completions by difficulty</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {stats.byDifficulty
                        .sort((a, b) => DIFF_ORDER.indexOf(a.difficulty) - DIFF_ORDER.indexOf(b.difficulty))
                        .map(({ difficulty, count }) => {
                          const pct = stats.completed > 0 ? (count / stats.completed) * 100 : 0;
                          return (
                            <div key={difficulty}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: "0.82rem" }}>
                                <span style={{ color: diffColor(difficulty) }}>{difficulty}</span>
                                <span style={{ color: "var(--text-2)" }}>{count}</span>
                              </div>
                              <div style={{ height: 6, background: "var(--bg-3)", borderRadius: 3, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${pct}%`, background: diffColor(difficulty), borderRadius: 3, transition: "width 0.6s ease" }} />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Completions by rating tier */}
                {stats.byRatingTier.length > 0 && (
                  <div className="card" style={{ padding: 24 }}>
                    <h3 style={{ fontFamily: "var(--font-grotesk)", fontSize: "0.9rem", fontWeight: 700, marginBottom: 16, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Completions by rating tier</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {stats.byRatingTier
                        .sort((a, b) => TIER_ORDER.indexOf(a.ratingTier) - TIER_ORDER.indexOf(b.ratingTier))
                        .map(({ ratingTier, count }) => {
                          const pct = stats.completed > 0 ? (count / stats.completed) * 100 : 0;
                          return (
                            <div key={ratingTier}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: "0.82rem" }}>
                                <span style={{ color: tierColor(ratingTier) }}>{tierLabel(ratingTier)}</span>
                                <span style={{ color: "var(--text-2)" }}>{count}</span>
                              </div>
                              <div style={{ height: 6, background: "var(--bg-3)", borderRadius: 3, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${pct}%`, background: tierColor(ratingTier), borderRadius: 3, transition: "width 0.6s ease" }} />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {stats.total === 0 && (
                  <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--text-2)" }}>
                    <div style={{ fontSize: "2.5rem", marginBottom: 16 }}>📊</div>
                    <p>No data yet. Spin a level to start building your stats!</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
