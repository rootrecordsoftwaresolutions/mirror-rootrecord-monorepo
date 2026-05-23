import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken, setToken, getDeviceId, RR_APP_ID } from "../lib/api";
import { notifyAppSessionStart, ROOTRECORD_ACCOUNT_API_ORIGIN } from "../lib/accountNotifyApi";

const AuthCtx = createContext(null);

function isTransientNetworkError(e) {
  return (
    e?.code === "ERR_NETWORK" ||
    String(e?.message || "").toLowerCase().includes("network error")
  );
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function postWithRetry(url, body) {
  try {
    return await api.post(url, body);
  } catch (e1) {
    if (isTransientNetworkError(e1)) {
      await sleep(650);
      return await api.post(url, body);
    }
    throw e1;
  }
}

function userFromAuthPayload(data, displayName) {
  const email = String(data.email || "").trim();
  const pro = Boolean(data.pro_unlocked || data.proUnlocked);
  const life = Boolean(data.life_member || data.lifeMember);
  const nm = (displayName && String(displayName).trim()) || email.split("@")[0] || "User";
  return {
    id: String(data.account_id || ""),
    email,
    name: nm,
    plan: life ? "life" : pro ? "pro" : "free",
    pro_unlocked: pro,
    life_member: life,
    role: "user",
    created_at: new Date().toISOString(),
    subscription_status: String(data.subscription_status || "none"),
  };
}

function userFromMePayload(data) {
  const email = String(data.email || "").trim();
  const pro = Boolean(data.pro_unlocked);
  const life = Boolean(data.life_member);
  const raw = data.raw && typeof data.raw === "object" ? data.raw : {};
  return {
    id: String(data.account_id || raw.account_id || ""),
    email,
    name: email.split("@")[0] || "User",
    plan: life ? "life" : pro ? "pro" : "free",
    pro_unlocked: pro,
    life_member: life,
    role: "user",
    created_at: String(raw.account_created_at || new Date().toISOString()),
    subscription_status: String(data.subscription_status || raw.subscription_status || "none"),
  };
}

export function AuthProvider({ children }) {
  // `undefined` = not decided yet (splash); `null` = signed out; object = signed in.
  const [user, setUser] = useState(undefined);

  const refresh = useCallback(async () => {
    const t = getToken();
    if (!t) {
      setUser(null);
      return;
    }
    try {
      const { data } = await api.post("/auth/me");
      setUser(userFromMePayload(data));
    } catch {
      setToken("");
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    notifyAppSessionStart({
      apiOrigin: ROOTRECORD_ACCOUNT_API_ORIGIN,
      appId: RR_APP_ID,
      betaTester: false,
      guestId: getDeviceId(),
      getAuthToken: () => getToken(),
    });
  }, [user]);

  // api.js response interceptor dispatches this when the Worker rejects our Bearer with
  // "Invalid or expired session." It already wiped the token; we just need to drop the
  // in-memory user so the AuthScreen re-renders.
  useEffect(() => {
    const onInvalid = () => setUser(null);
    window.addEventListener("rrah.session.invalidated", onInvalid);
    return () => window.removeEventListener("rrah.session.invalidated", onInvalid);
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await postWithRetry("/auth/login", {
      email,
      password,
      device_id: getDeviceId(),
    });
    const tok = data.access_token || data.token;
    if (!tok) throw new Error("No session token returned.");
    setToken(tok);
    const u = userFromAuthPayload(data);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (email, password, name) => {
    const { data } = await postWithRetry("/auth/signup", {
      email,
      password,
      device_id: getDeviceId(),
    });
    const tok = data.access_token || data.token;
    if (!tok) throw new Error("No session token returned.");
    setToken(tok);
    const u = userFromAuthPayload(data, name);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* best-effort; still clear local */
    }
    setToken("");
    setUser(null);
  }, []);

  const refreshEntitlement = useCallback(async () => {
    const { data } = await api.post("/auth/entitlement", { device_id: getDeviceId() });
    setUser((prev) =>
      prev
        ? {
            ...prev,
            plan: data.life_member ? "life" : data.pro_unlocked ? "pro" : "free",
            pro_unlocked: Boolean(data.pro_unlocked),
            life_member: Boolean(data.life_member),
            subscription_status:
              data.subscription_status || prev.subscription_status || "none",
          }
        : prev
    );
    return data;
  }, []);

  return (
    <AuthCtx.Provider
      value={{ user, login, register, logout, refresh, refreshEntitlement }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
