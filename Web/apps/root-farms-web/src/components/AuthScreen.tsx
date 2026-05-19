import { useState } from "react";

import { useAuth } from "../contexts/AuthContext";

type AuthMode = "signin" | "signup";

export function AuthScreen({ onContinueAsBetaTester }: { onContinueAsBetaTester?: () => void }) {
  const auth = useAuth();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const out =
        mode === "signin"
          ? await auth.login(email.trim(), password)
          : await auth.register(email.trim(), password, name.trim());
      if (!out.ok) setErr(out.detail);
    } catch {
      setErr("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Root Units Idle Farmer</h1>
        <p className="auth-lead">
          {mode === "signup" ? (
            <>
              Create a <strong>rootrecord.info</strong> account to save your farm and Root Units across devices.
            </>
          ) : (
            <>
              Sign in with your <strong>rootrecord.info</strong> account to save progress. Your farm and Root Units sync
              with your account.
            </>
          )}
        </p>

        <AuthModeTabs mode={mode} setMode={setMode} />

        <form onSubmit={submit} className="auth-form">
          {mode === "signup" ? (
            <label>
              Name
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="What should we call you?"
              />
            </label>
          ) : null}
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              required
            />
            {mode === "signup" ? <span className="auth-field-hint">At least 6 characters.</span> : null}
          </label>
          {err ? (
            <p className="auth-err" role="alert">
              {err}
            </p>
          ) : null}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          type="button"
          className="btn btn-ghost auth-guest-btn"
          disabled={busy}
          onClick={() => {
            auth.enterBetaTesterMode();
            onContinueAsBetaTester?.();
          }}
        >
          Continue as Beta Tester
        </button>
        <p className="auth-guest-note">
          Don&apos;t want to sign in? Play as a <strong>Beta Tester</strong> — progress stays on this device and is not
          saved to your RootRecord account.
        </p>
      </div>
    </div>
  );
}

function AuthModeTabs({ mode, setMode }: { mode: AuthMode; setMode: (m: AuthMode) => void }) {
  return (
    <div className="auth-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={mode === "signin"}
        className={mode === "signin" ? "auth-tab auth-tab--active" : "auth-tab"}
        onClick={() => setMode("signin")}
      >
        Sign in
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "signup"}
        className={mode === "signup" ? "auth-tab auth-tab--active" : "auth-tab"}
        onClick={() => setMode("signup")}
      >
        Create account
      </button>
    </div>
  );
}
