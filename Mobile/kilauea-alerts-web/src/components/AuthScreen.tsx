import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

export function AuthScreen() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res =
        mode === "signin"
          ? await login(email, password)
          : await signup(email, password, name.trim() || undefined);
      if (!res.ok) setError(res.detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card panel">
        <div className="brand-kicker">RootRecord</div>
        <h1 className="auth-title">Kīlauea observatory</h1>
        <p className="muted auth-lead">Sign in with your RootRecord account. Same session as Weather and Business web when SSO hostnames are configured.</p>

        <div className="auth-tabs">
          <button type="button" className={mode === "signin" ? "auth-tab active" : "auth-tab"} onClick={() => setMode("signin")}>
            Sign in
          </button>
          <button type="button" className={mode === "register" ? "auth-tab active" : "auth-tab"} onClick={() => setMode("register")}>
            Create account
          </button>
        </div>

        <form className="auth-form" onSubmit={(ev) => void onSubmit(ev)}>
          {mode === "register" ? (
            <label className="field">
              <span className="field-label">Name (optional)</span>
              <input className="input" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          ) : null}
          <label className="field">
            <span className="field-label">Email</span>
            <input
              className="input"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input
              className="input"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error ? (
            <div className="auth-error" role="alert">
              {error}
            </div>
          ) : null}
          <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
