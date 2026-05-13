import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

// Single source of truth used by every RootRecord web upsell button (also referenced by
// Business Manager's UpsellModal). Keeping it inline here avoids a one-line shared file.
const BILLING_URL = "https://rootrecord.info/billing";

/**
 * kilauea.rootrecord.info landing for signed-out visitors.
 *
 * The Kīlauea web dashboard is Pro/Lifetime only — there is no free-tier value behind a sign-in
 * here, so the default view is a paywall pitch ("Become a Member") rather than a sign-in form
 * that just leads to ProPaywall.tsx anyway. Existing members can still sign in via the toggle;
 * the form is the same one that lived here before, just collapsed by default.
 */
export function AuthScreen() {
  const { login, signup } = useAuth();
  const [view, setView] = useState<"pitch" | "signin" | "register">("pitch");
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
        view === "signin"
          ? await login(email, password)
          : await signup(email, password, name.trim() || undefined);
      if (!res.ok) setError(res.detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (view === "pitch") {
    return (
      <div className="auth-shell">
        <div className="auth-card panel">
          <div className="brand-kicker">RootRecord</div>
          <h1 className="auth-title">Kīlauea observatory</h1>
          <p className="muted auth-lead">
            Kīlauea is designed for <strong>Pro</strong> and <strong>Lifetime</strong> members only. The Android app remains usable on the free tier (Volcano location).
          </p>
          <a
            className="btn btn-primary auth-submit"
            href={BILLING_URL}
            data-testid="auth-become-member"
          >
            Become a Member
          </a>
          <p className="muted auth-lead" style={{ textAlign: "center", marginTop: "1rem", marginBottom: 0 }}>
            Already a member?{" "}
            <button
              type="button"
              className="auth-linkish"
              onClick={() => setView("signin")}
              data-testid="auth-show-signin"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card panel">
        <div className="brand-kicker">RootRecord</div>
        <h1 className="auth-title">Kīlauea observatory</h1>
        <p className="muted auth-lead">Sign in with your RootRecord account. Same session as Weather and Business web when SSO hostnames are configured.</p>

        <div className="auth-tabs">
          <button type="button" className={view === "signin" ? "auth-tab active" : "auth-tab"} onClick={() => setView("signin")}>
            Sign in
          </button>
          <button type="button" className={view === "register" ? "auth-tab active" : "auth-tab"} onClick={() => setView("register")}>
            Create account
          </button>
        </div>

        <form className="auth-form" onSubmit={(ev) => void onSubmit(ev)}>
          {view === "register" ? (
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
              autoComplete={view === "signin" ? "current-password" : "new-password"}
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
            {busy ? "Please wait…" : view === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="muted auth-lead" style={{ textAlign: "center", marginTop: "1rem", marginBottom: 0 }}>
          <button
            type="button"
            className="auth-linkish"
            onClick={() => setView("pitch")}
            data-testid="auth-back-to-pitch"
          >
            ← Back
          </button>
        </p>
      </div>
    </div>
  );
}
