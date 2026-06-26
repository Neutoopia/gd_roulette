"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.error) { setError("Invalid email or password"); setLoading(false); return; }
    router.push("/dashboard");
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="card" style={{ width: "100%", maxWidth: 400, padding: 40 }}>
        <div style={{ marginBottom: 8, fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--accent)" }}>Welcome back</div>
        <h1 style={{ fontFamily: "var(--font-grotesk)", fontSize: "1.8rem", fontWeight: 700, marginBottom: 8 }}>Log in</h1>
        <p style={{ color: "var(--text-2)", fontSize: "0.875rem", marginBottom: 32 }}>Pick up your grind where you left off.</p>

        <form onSubmit={handle} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Password</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{error}</p>}
          <button type="submit" disabled={loading} className="btn btn-primary" style={{ marginTop: 8, width: "100%", padding: "12px" }}>
            {loading ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p style={{ marginTop: 24, textAlign: "center", fontSize: "0.875rem", color: "var(--text-2)" }}>
          No account? <Link href="/register" style={{ color: "var(--accent)" }}>Create one</Link>
        </p>
      </div>
    </main>
  );
}
