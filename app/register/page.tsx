"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Something went wrong"); setLoading(false); return; }
    const si = await signIn("credentials", { email, password, redirect: false });
    if (si?.error) { setError("Account created! Please log in."); setLoading(false); return; }
    router.push("/dashboard");
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="card" style={{ width: "100%", maxWidth: 400, padding: 40 }}>
        <div style={{ marginBottom: 8, fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--accent)" }}>Get started</div>
        <h1 style={{ fontFamily: "var(--font-grotesk)", fontSize: "1.8rem", fontWeight: 700, marginBottom: 8 }}>Create account</h1>
        <p style={{ color: "var(--text-2)", fontSize: "0.875rem", marginBottom: 32 }}>Track your grinds across every session.</p>

        <form onSubmit={handle} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            { label: "Name (optional)", type: "text", value: name, set: setName, ph: "GDGrinder420" },
            { label: "Email", type: "email", value: email, set: setEmail, ph: "you@example.com", req: true },
            { label: "Password (min 8 chars)", type: "password", value: password, set: setPassword, ph: "••••••••", req: true },
          ].map(({ label, type, value, set, ph, req }) => (
            <div key={label}>
              <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</label>
              <input type={type} required={req} value={value} onChange={e => set(e.target.value)} placeholder={ph} minLength={type === "password" ? 8 : undefined} />
            </div>
          ))}
          {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{error}</p>}
          <button type="submit" disabled={loading} className="btn btn-primary" style={{ marginTop: 8, width: "100%", padding: "12px" }}>
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p style={{ marginTop: 24, textAlign: "center", fontSize: "0.875rem", color: "var(--text-2)" }}>
          Already have an account? <Link href="/login" style={{ color: "var(--accent)" }}>Log in</Link>
        </p>
      </div>
    </main>
  );
}
