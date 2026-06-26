import Link from "next/link";

const DIFFICULTIES = ["Easy", "Normal", "Hard", "Harder", "Insane", "Easy Demon", "Medium Demon", "Hard Demon", "Insane Demon", "Extreme Demon"];
const TIERS = ["Featured", "Epic", "Legendary", "Mythic"];

export default function Home() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", position: "relative" }}>
      <div style={{ maxWidth: 680, width: "100%", textAlign: "center" }}>
        {/* Badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--bg-2)", border: "1px solid var(--border-2)", borderRadius: 20, padding: "6px 16px", marginBottom: 32, fontSize: "0.75rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--accent)" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
          Level Grinder Tracker
        </div>

        <h1 style={{ fontFamily: "var(--font-grotesk)", fontSize: "clamp(2.5rem, 6vw, 4rem)", fontWeight: 700, lineHeight: 1.05, marginBottom: 20, color: "var(--text)" }}>
          Your levels.<br />
          <span style={{ color: "var(--accent)" }} className="text-glow">Your grinds.</span><br />
          All tracked.
        </h1>

        <p style={{ fontSize: "1.05rem", color: "var(--text-2)", lineHeight: 1.7, marginBottom: 40, maxWidth: 520, margin: "0 auto 40px" }}>
          Pick a difficulty — Easy all the way to Extreme Demon. Filter by Mythic, Epic, Featured, and more. Get assigned a random GD level and track every attempt, your best %, notes, and time spent.
        </p>

        {/* Difficulty pills preview */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 40 }}>
          {DIFFICULTIES.map((d) => (
            <span key={d} style={{ padding: "4px 12px", borderRadius: 20, border: "1px solid var(--border-2)", fontSize: "0.75rem", color: "var(--text-2)", background: "var(--bg-1)" }}>{d}</span>
          ))}
          {TIERS.map((t) => (
            <span key={t} style={{ padding: "4px 12px", borderRadius: 20, border: "1px solid var(--border-2)", fontSize: "0.75rem", color: "var(--tier-" + t.toLowerCase() + ")", background: "var(--bg-1)" }}>{t}</span>
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <Link href="/register" className="btn btn-primary" style={{ fontSize: "1rem", padding: "12px 28px" }}>
            Start grinding
          </Link>
          <Link href="/login" className="btn btn-ghost" style={{ fontSize: "1rem", padding: "12px 28px" }}>
            Log in
          </Link>
        </div>

        {/* Features */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginTop: 64, textAlign: "left" }}>
          {[
            { icon: "🎲", title: "Random Assignment", desc: "Pick a difficulty & tier. Get assigned a random matching level." },
            { icon: "📊", title: "Progress Tracking", desc: "Log your best %, attempts, time spent, and personal notes per level." },
            { icon: "📁", title: "JSON Export", desc: "Download your full grind history as a JSON file at any time." },
            { icon: "🏆", title: "Stats Dashboard", desc: "Completion rate, total grinds, time invested, breakdowns by difficulty." },
          ].map((f) => (
            <div key={f.title} className="card" style={{ padding: "20px" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: 10 }}>{f.icon}</div>
              <div style={{ fontFamily: "var(--font-grotesk)", fontWeight: 600, fontSize: "0.9rem", marginBottom: 6, color: "var(--text)" }}>{f.title}</div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-2)", lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
