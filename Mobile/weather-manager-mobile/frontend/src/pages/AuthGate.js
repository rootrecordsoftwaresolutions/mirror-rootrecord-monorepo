import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cloud, ArrowRight, Loader2 } from 'lucide-react';
import { api, session, getMobileVersionPolicy } from '../lib/api';
import { NATIVE_APP_VERSION } from '../lib/nativeAppVersion';
import { semverLt } from '../lib/semverLt';

export default function AuthGate({ onSignedIn }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  /** `{ min, url }` when this build is below server min_version. */
  const [outdated, setOutdated] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await getMobileVersionPolicy();
        if (cancelled || !data?.min_version) return;
        if (!semverLt(NATIVE_APP_VERSION, data.min_version)) return;
        const key = `rr_wm_update_dismiss_${data.min_version}`;
        if (sessionStorage.getItem(key)) return;
        setOutdated({ min: data.min_version, url: data.update_url || '' });
      } catch {
        /* offline — skip */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isTransientNetworkError = (e) =>
    e?.code === 'ERR_NETWORK' || String(e?.message || '').toLowerCase().includes('network error');

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!email.trim() || password.length < 6) {
      setErr('Enter an email and a password (6+ characters).');
      return;
    }
    setBusy(true);
    try {
      const fn = mode === 'signin' ? api.login : api.signup;
      const doAttempt = async () => fn(email.trim(), password);
      let res;
      try {
        res = await doAttempt();
      } catch (e1) {
        // Common on cold start / flaky connectivity: retry once.
        if (isTransientNetworkError(e1)) {
          await sleep(650);
          res = await doAttempt();
        } else {
          throw e1;
        }
      }
      const { data } = res;
      const tok = data.access_token || data.token;
      if (!tok) throw new Error('No session token returned. Try again.');
      session.setSession(tok, data.email, data.pro_unlocked, data.life_member);
      onSignedIn?.();
      navigate('/', { replace: true });
    } catch (e2) {
      const detail = e2?.response?.data?.detail;
      if (isTransientNetworkError(e2)) {
        setErr('Having trouble connecting right now. Please try again in a moment.');
      } else {
        const msg = detail || e2?.message || 'Sign in failed.';
        setErr(String(msg));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-app flex flex-col">
      {outdated ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-5 bg-black/80"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wm-upd-title"
        >
          <div className="w-full max-w-sm bg-container border border-accent/40 rounded-sm p-5 shadow-xl">
            <h2 id="wm-upd-title" className="text-lg font-semibold text-white mb-2">
              Update available
            </h2>
            <p className="text-sm text-accent/85 leading-relaxed mb-1">
              You&apos;re on <span className="font-mono text-white">v{NATIVE_APP_VERSION}</span>. Please install at least{' '}
              <span className="font-mono text-white">v{outdated.min}</span> for a supported experience.
            </p>
            <p className="text-xs text-accent/60 mb-4">Same RootRecord account after you update.</p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="bg-accent hover:bg-accentHover text-white py-3 rounded-sm text-sm font-medium"
                onClick={() => {
                  if (outdated.url) window.open(outdated.url, '_blank', 'noopener,noreferrer');
                }}
              >
                Open Play Store
              </button>
              <button
                type="button"
                className="py-2 text-sm text-accent/70 hover:text-accent"
                onClick={() => {
                  sessionStorage.setItem(`rr_wm_update_dismiss_${outdated.min}`, '1');
                  setOutdated(null);
                }}
              >
                Continue anyway
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-slideup">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-md bg-accent/10 border border-accent/30 flex items-center justify-center">
              <Cloud strokeWidth={1.5} className="w-6 h-6 text-accent" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight" data-testid="auth-app-title">Weather Manager</h1>
              <p className="text-xs text-accent/70 uppercase tracking-[.2em] font-mono">Forecasts &amp; alerts</p>
            </div>
          </div>

          <div className="flex gap-2 mb-6 text-xs uppercase tracking-widest font-mono">
            <button
              type="button"
              data-testid="auth-tab-signin"
              onClick={() => setMode('signin')}
              className={`pb-2 border-b-2 ${mode === 'signin' ? 'text-white border-accent' : 'text-accent/60 border-transparent'}`}
            >
              Sign in
            </button>
            <button
              type="button"
              data-testid="auth-tab-signup"
              onClick={() => setMode('signup')}
              className={`pb-2 border-b-2 ${mode === 'signup' ? 'text-white border-accent' : 'text-accent/60 border-transparent'}`}
            >
              Create account
            </button>
          </div>

          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <label className="block">
              <span className="text-[11px] uppercase tracking-widest text-accent/70 font-mono">Email</span>
              <input
                data-testid="auth-email-input"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 w-full bg-container border border-subtle rounded-sm px-3 py-3 outline-none focus:border-accent transition-colors"
              />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-widest text-accent/70 font-mono">Password</span>
              <input
                data-testid="auth-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                className="mt-1 w-full bg-container border border-subtle rounded-sm px-3 py-3 outline-none focus:border-accent transition-colors"
              />
            </label>

            {err && (
              <div className="text-xs bg-sev-severe/10 border border-sev-severe/40 text-sev-severe p-2 rounded-sm" data-testid="auth-error">
                {err}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              data-testid="auth-submit-button"
              className="bg-accent hover:bg-accentHover text-white py-3 rounded-sm flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-[11px] text-accent/70 leading-relaxed">
            Create an account to save locations and receive alert notifications across devices.
          </p>
        </div>
      </div>
    </div>
  );
}
