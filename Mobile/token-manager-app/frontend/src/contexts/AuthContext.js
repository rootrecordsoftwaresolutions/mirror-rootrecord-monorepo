import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { rrApi, getRrToken, setRrToken, getRrDeviceId, refreshEntitlement as postEntitlement } from "../lib/rrApi";

const AuthCtx = createContext(null);

function isTransientNetworkError(e) {
  return e?.code === "ERR_NETWORK" || String(e?.message || "").toLowerCase().includes("network error");
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function postWithRetry(url, body) {
  try {
    return await rrApi.post(url, body);
  } catch (e1) {
    if (isTransientNetworkError(e1)) {
      await sleep(650);
      return await rrApi.post(url, body);
    }
    throw e1;
  }
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
    subscription_status: String(data.subscription_status || raw.subscription_status || "none"),
  };
}

export function AuthProvider({ children }) {
  // `undefined` = not decided yet (splash); `null` = signed out; object = signed in.
  const [user, setUser] = useState(undefined);

  const refresh = useCallback(async () => {
    const t = getRrToken();
    if (!t) {
      setUser(null);
      return;
    }
    try {
      const { data } = await rrApi.post("/auth/me");
      setUser(userFromMePayload(data));
    } catch {
      setRrToken("");
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const refreshEntitlement = useCallback(async () => {
    const { data } = await postEntitlement();
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

  const login = useCallback(async (email, password) => {
    const { data } = await postWithRetry("/auth/login", {
      email,
      password,
      device_id: getRrDeviceId(),
    });
    const tok = data.access_token || data.token;
    if (!tok) throw new Error("No session token returned.");
    setRrToken(tok);
    await refresh();
    try {
      await refreshEntitlement();
    } catch {
      /* non-fatal — network or unlicensed */
    }
  }, [refresh, refreshEntitlement]);

  const register = useCallback(async (email, password) => {
    const { data } = await postWithRetry("/auth/signup", {
      email,
      password,
      device_id: getRrDeviceId(),
    });
    const tok = data.access_token || data.token;
    if (!tok) throw new Error("No session token returned.");
    setRrToken(tok);
    await refresh();
    try {
      await refreshEntitlement();
    } catch {
      /* non-fatal */
    }
  }, [refresh, refreshEntitlement]);

  const logout = useCallback(async () => {
    try {
      await rrApi.post("/auth/logout");
    } catch {
      /* best-effort */
    }
    setRrToken("");
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, login, register, logout, refresh, refreshEntitlement }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

