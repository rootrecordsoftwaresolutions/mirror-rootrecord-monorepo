import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { getToken, earnHeartbeat, earnCheckin, isBackendConfigured, RR_APP_ID } from "./lib/api";
import BottomNav from "./components/ui/BottomNav";
import AuthScreen from "./components/modules/AuthScreen";
import Dashboard from "./components/modules/Dashboard";
import TimeTracking from "./components/modules/TimeTracking";
import Finance from "./components/modules/Finance";
import Schedule from "./components/modules/Schedule";
import More from "./components/modules/More";
import WorkLog from "./components/modules/WorkLog";
import Reports from "./components/modules/Reports";
import Stock from "./components/modules/Stock";
import Categories from "./components/modules/Categories";
import { AccountSettings, BusinessSettings, ProgramSettings, About, Feedback } from "./components/modules/Settings";
import DeveloperMessages from "./components/modules/DeveloperMessages";

/** Same earn heartbeat pattern as Weather Manager — shared `rr_earn_*` balance on the API Worker. */
function EarnHeartbeat() {
  const loc = useLocation();
  const { user } = useAuth();
  useEffect(() => {
    if (!getToken()) return undefined;
    const page = loc.pathname || "/";
    const tick = () => earnHeartbeat({ app_id: RR_APP_ID, page }).catch(() => {});
    tick();
    const id = setInterval(tick, 25_000);
    return () => clearInterval(id);
  }, [loc.pathname, user]);
  return null;
}

function utcYmd() {
  return new Date().toISOString().slice(0, 10);
}

/** Once per UTC day while signed in (not guest): silent earn check-in, same as Weather Manager. */
function DailyEarnCheckin() {
  const { user, guest } = useAuth();
  useEffect(() => {
    if (user === undefined || guest || !user) return undefined;
    if (!isBackendConfigured()) return undefined;
    const KEY = "rrbm.dailyCheckin.lastAttemptYmd";
    let cancelled = false;
    const attempt = async () => {
      if (cancelled) return;
      const today = utcYmd();
      if (localStorage.getItem(KEY) === today) return;
      localStorage.setItem(KEY, today);
      try {
        await earnCheckin({ app_id: RR_APP_ID });
      } catch {
        /* retry next open / foreground */
      }
    };
    attempt();
    const onVis = () => {
      if (document.visibilityState === "visible") attempt();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user, guest]);
  return null;
}

function Gate({ children }) {
  const { user, guest } = useAuth();
  const loc = useLocation();
  if (user === undefined) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center text-ink-tertiary text-sm">Loading…</div>
    );
  }
  if (!user && !guest) {
    return <Navigate to="/auth" replace state={{ from: loc.pathname }} />;
  }
  return children;
}

/** Left rail padding only when the sidebar is shown (not on /auth — avoids off-center sign-in on desktop). */
function AppLayoutShell() {
  const loc = useLocation();
  const padRail = !loc.pathname.startsWith("/auth");
  return (
    <div className={`business-web-main min-h-[100dvh] ${padRail ? "lg:pl-56" : ""}`}>
      <Outlet />
      <BottomNav />
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayoutShell />}>
      <Route path="/auth" element={<AuthScreen />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Gate><Dashboard /></Gate>} />
      <Route path="/track" element={<Gate><TimeTracking /></Gate>} />
      <Route path="/money" element={<Gate><Finance /></Gate>} />
      <Route path="/schedule" element={<Gate><Schedule /></Gate>} />
      <Route path="/more" element={<Gate><More /></Gate>} />
      <Route path="/work-log" element={<Gate><WorkLog /></Gate>} />
      <Route path="/reports" element={<Gate><Reports /></Gate>} />
      <Route path="/stock" element={<Gate><Stock /></Gate>} />
      <Route path="/categories" element={<Gate><Categories /></Gate>} />
      <Route path="/account" element={<Gate><AccountSettings /></Gate>} />
      <Route path="/business" element={<Gate><BusinessSettings /></Gate>} />
      <Route path="/program" element={<Gate><ProgramSettings /></Gate>} />
      <Route path="/about" element={<Gate><About /></Gate>} />
      <Route path="/feedback" element={<Gate><Feedback /></Gate>} />
      <Route path="/testing-rewards" element={<Gate><Navigate to="/account" replace /></Gate>} />
      <Route path="/developer-messages" element={<Gate><DeveloperMessages /></Gate>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <EarnHeartbeat />
        <DailyEarnCheckin />
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
