import {

  createContext,

  useCallback,

  useContext,

  useEffect,

  useMemo,

  useRef,

  useState,

  type ReactNode,

} from "react";

import { getPlotCatalog, plotUnlockCost, rowSlotCost } from "../game/catalog";
import {
  clearSave,
  harvestCooldownSecRemaining,
  loadLastForegroundMs,
  loadSave,
  persistLastForegroundMs,
  persistLastHarvestMs,
  persistPendingRu,
  persistSave,
} from "../game/storage";

import {
  advancePlotsToNow,
  canBuyPlotUnlock,
  createInitialSave,
  peekUnsettledRu,
  simulatePlotTicks,
  totalRuPerSec,
} from "../game/sim";
import { GUEST_SCOPE, GUEST_STARTING_BALANCE } from "../guest";
import { formatRu } from "../game/format";

import type { GameSave } from "../game/types";

import { useAuth } from "./AuthContext";

import {
  fetchAccountRootUnits,
  publishAccountBalance,
  ensureAccountBalanceCacheMigrated,
  readCachedAccountBalance,
  subscribeAccountBalance,
} from "../lib/accountBalance";

import {
  fetchFarmsState,
  postFarmsPurchase,
  postFarmsSettle,
  postStoreProtectionToggle,
  postVarmintAck,
  type FarmsPurchaseKind,
  type FarmsSettleOk,
  type FarmsStateResponse,
} from "../lib/farmsApi";
import {
  protectionIncomeMultiplier,
  type FarmsProtections,
  type ProtectionKind,
  type VarmintEvent,
} from "../game/storeCatalog";

export type PurchaseResult = "ok" | "insufficient" | "unavailable" | "need_sign_in" | "offline";



type GameCtx = {

  save: GameSave;

  scope: string;
  guestMode: boolean;

  /** Loaded from `/earn/summary` — same balance as the rest of Root Record. */
  accountBalance: number;
  balanceReady: boolean;
  /** Accrued since last server settle; not spendable until settled. */
  pendingHarvest: number;
  spendableBalance: number;
  syncNote: string | null;

  progressVersion: number;

  purchaseBusy: boolean;

  refreshServerBalance: () => Promise<void>;
  harvestNow: () => Promise<void>;
  harvestBusy: boolean;
  harvestCooldownSec: number;

  purchaseRowSlot: (plotId: number) => Promise<PurchaseResult>;

  purchasePlotUnlock: (plotId: number) => Promise<PurchaseResult>;

  resetProgress: () => void;
  protections: FarmsProtections;
  ruPerSec: number;
  protectionFeePerMinute: number;
  storeBusy: boolean;
  toggleProtection: (kind: ProtectionKind, enabled: boolean) => Promise<void>;
  varmintNotifications: VarmintEvent[];
  activeVarmintEvent: VarmintEvent | null;
  dismissActiveVarmint: () => Promise<void>;
  welcomeBack: { harvestRu: number | null; varmintEvents: VarmintEvent[] } | null;
  resolveWelcomeBack: (withAdBonus: boolean) => void;
};

const OFFLINE_CONTRACT_MIN_AWAY_MS = 30_000;



const Ctx = createContext<GameCtx | null>(null);



function applyServerPlots(save: GameSave, remote: Partial<GameSave> & { plots: GameSave["plots"] }): GameSave {

  return {

    ...save,

    plots: remote.plots,

    lifetimeEarned: Math.max(save.lifetimeEarned, remote.lifetimeEarned ?? save.lifetimeEarned),

    lastSettledMs: remote.lastSettledMs ?? save.lastSettledMs,

  };

}



export function GameProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const guestMode = auth.guestMode;
  const scope = guestMode ? GUEST_SCOPE : auth.email.toLowerCase() || "user";

  const [save, setSave] = useState<GameSave>(() => (guestMode ? createInitialSave() : loadSave(scope)));

  const saveRef = useRef(save);

  const [accountBalance, setAccountBalance] = useState(0);
  const [balanceReady, setBalanceReady] = useState(false);
  const [pendingHarvest, setPendingHarvest] = useState(0);
  const accountBalanceRef = useRef(0);

  const [syncNote, setSyncNote] = useState<string | null>(null);

  const [progressVersion, setProgressVersion] = useState(1);

  const progressVersionRef = useRef(1);

  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [harvestBusy, setHarvestBusy] = useState(false);
  const [harvestCooldownSec, setHarvestCooldownSec] = useState(() => harvestCooldownSecRemaining(scope));

  const [protections, setProtections] = useState<FarmsProtections>({
    gopher: false,
    mice: false,
    rabbit: false,
  });
  const [ruPerSec, setRuPerSec] = useState(0);
  const [protectionFeePerMinute, setProtectionFeePerMinute] = useState(0);
  const [storeBusy, setStoreBusy] = useState(false);
  const [varmintNotifications, setVarmintNotifications] = useState<VarmintEvent[]>([]);
  const [activeVarmintEvent, setActiveVarmintEvent] = useState<VarmintEvent | null>(null);
  const [welcomeBack, setWelcomeBack] = useState<{
    harvestRu: number | null;
    varmintEvents: VarmintEvent[];
  } | null>(null);
  const welcomeBackRef = useRef(welcomeBack);
  const activeVarmintQueueRef = useRef<VarmintEvent[]>([]);
  const protectionsRef = useRef(protections);
  const farmsApiLiveRef = useRef(false);

  saveRef.current = save;
  protectionsRef.current = protections;

  progressVersionRef.current = progressVersion;
  welcomeBackRef.current = welcomeBack;

  const ingestVarmintEvents = useCallback((events: VarmintEvent[], awayMs: number, pendingHarvestRu: number) => {
    if (!events.length && pendingHarvestRu <= 0) return;
    if (awayMs >= OFFLINE_CONTRACT_MIN_AWAY_MS) {
      setWelcomeBack({
        harvestRu: pendingHarvestRu > 0 ? pendingHarvestRu : null,
        varmintEvents: events,
      });
      setActiveVarmintEvent(null);
      activeVarmintQueueRef.current = [];
      return;
    }
    setVarmintNotifications((prev) => {
      const ids = new Set(prev.map((e) => e.id));
      const merged = [...prev];
      for (const e of events) {
        if (!ids.has(e.id)) merged.unshift(e);
      }
      return merged.slice(0, 30);
    });
    if (events.length) {
      activeVarmintQueueRef.current = [...events];
      setActiveVarmintEvent(events[0] ?? null);
    }
  }, []);

  const persist = useCallback(
    (next: GameSave) => {
      saveRef.current = next;
      setSave(next);
      if (!guestMode) persistSave(scope, next);
    },
    [guestMode, scope],
  );

  const applyBalanceFromServer = useCallback((balance: number) => {
    const n = Math.max(0, Math.floor(balance));
    accountBalanceRef.current = n;
    setAccountBalance(n);
    setBalanceReady(true);
    publishAccountBalance(n);
  }, []);

  const computeAwayMs = useCallback((nowMs: number) => {
    const lastFg = loadLastForegroundMs(scope);
    if (lastFg > 0) return Math.max(0, nowMs - lastFg);
    return Math.max(0, nowMs - saveRef.current.lastTickMs);
  }, [scope]);

  const applyRemoteFarmsState = useCallback(
    (remote: FarmsStateResponse, nowMs: number, opts?: { skipWelcome?: boolean; awayMs?: number }) => {
      farmsApiLiveRef.current = true;
      if (remote.protections) {
        setProtections(remote.protections);
        protectionsRef.current = remote.protections;
      }
      if (remote.balance != null) applyBalanceFromServer(remote.balance);
      setProgressVersion(remote.progress_version);
      progressVersionRef.current = remote.progress_version;
      const awayMs = opts?.awayMs ?? nowMs - saveRef.current.lastTickMs;
      if (remote.plots?.length) {
        const merged = applyServerPlots(saveRef.current, {
          plots: remote.plots,
          lifetimeEarned: remote.lifetime_farms_earned,
          lastSettledMs: remote.last_settled_ms,
        });
        persist({ ...merged, lastTickMs: nowMs });
      }
      const incomeMult = protectionIncomeMultiplier(remote.protections ?? protectionsRef.current);
      const pending = peekUnsettledRu(saveRef.current, nowMs, incomeMult);
      setRuPerSec(totalRuPerSec(saveRef.current, incomeMult));
      if (remote.protection_fee_per_minute != null) {
        setProtectionFeePerMinute(Math.max(0, remote.protection_fee_per_minute));
      } else {
        const gross = totalRuPerSec(saveRef.current, 1);
        setProtectionFeePerMinute(Math.floor(gross * 60 * (1 - incomeMult)));
      }
      setPendingHarvest(pending);
      persistPendingRu(scope, pending);
      const events = remote.varmint_events ?? [];
      const awayLong = awayMs >= OFFLINE_CONTRACT_MIN_AWAY_MS;
      if (!opts?.skipWelcome && awayLong && (events.length > 0 || pending > 0)) {
        ingestVarmintEvents(events, awayMs, pending > 0 ? pending : 0);
      } else if (!opts?.skipWelcome && events.length > 0) {
        ingestVarmintEvents(events, 0, 0);
      } else if (!opts?.skipWelcome) {
        setWelcomeBack(null);
      }
      setSyncNote(null);
    },
    [applyBalanceFromServer, ingestVarmintEvents, persist, scope],
  );

  const applySettleSuccess = useCallback(
    (settled: FarmsSettleOk) => {
      const nowMs = Date.now();
      setProgressVersion(settled.progress_version);
      progressVersionRef.current = settled.progress_version;
      const merged = applyServerPlots(saveRef.current, {
        plots: settled.plots ?? saveRef.current.plots,
        lifetimeEarned: settled.lifetime_farms_earned,
        lastSettledMs: settled.last_settled_ms,
      });
      const nextSave = { ...merged, lastTickMs: nowMs };
      persist(nextSave);
      saveRef.current = nextSave;
      applyBalanceFromServer(settled.balance);
      const incomeMult = protectionIncomeMultiplier(protectionsRef.current);
      const pending = peekUnsettledRu(nextSave, nowMs, incomeMult);
      setPendingHarvest(pending);
      setRuPerSec(totalRuPerSec(nextSave, incomeMult));
      persistPendingRu(scope, pending);
      if (settled.granted > 0) {
        setSyncNote(`Harvested +${formatRu(settled.granted)} Root Units`);
      } else {
        setSyncNote(null);
      }
    },
    [applyBalanceFromServer, persist, scope],
  );

  const markHarvestCooldown = useCallback(
    (atMs: number, retrySec?: number) => {
      persistLastHarvestMs(scope, atMs);
      setHarvestCooldownSec(retrySec ?? harvestCooldownSecRemaining(scope, atMs));
    },
    [scope],
  );

  const refreshLedgerBalance = useCallback(async (): Promise<number | null> => {
    const live = await fetchAccountRootUnits();
    if (live == null) return null;
    applyBalanceFromServer(live);
    return live;
  }, [applyBalanceFromServer]);

  const loadAccountBalanceFirst = useCallback(async (): Promise<boolean> => {
    ensureAccountBalanceCacheMigrated();
    const cached = readCachedAccountBalance();
    if (cached != null) applyBalanceFromServer(cached);
    const live = await refreshLedgerBalance();
    if (live == null) {
      if (cached == null) {
        setSyncNote("Could not load your Root Units balance. Check your connection and try again.");
        setBalanceReady(false);
        return false;
      }
      setSyncNote("Using last known balance — reconnect to refresh.");
      return true;
    }
    return true;
  }, [applyBalanceFromServer, refreshLedgerBalance]);

  const syncFarmsAfterBalance = useCallback(async () => {
    const remote = await fetchFarmsState();
    if (remote?.ok) {
      applyRemoteFarmsState(remote, Date.now());
      return;
    }
    const settled = await postFarmsSettle(Date.now(), progressVersionRef.current, saveRef.current.plots);
    if (settled?.ok) {
      applySettleSuccess(settled);
      return;
    }
    const pending = peekUnsettledRu(
      saveRef.current,
      Date.now(),
      protectionIncomeMultiplier(protectionsRef.current),
    );
    setPendingHarvest(pending);
    persistPendingRu(scope, pending);
    setSyncNote(
      "Could not sync farm progress from the server. Balance is live; plots may differ from web until sync works.",
    );
  }, [applyRemoteFarmsState, applySettleSuccess, persist, scope]);

  const performHarvest = useCallback(
    async (opts?: { skipCooldownCheck?: boolean; rewardedDouble?: boolean }): Promise<boolean> => {
      if (harvestBusy || !balanceReady) return false;
      if (!opts?.skipCooldownCheck && harvestCooldownSec > 0) return false;
      setHarvestBusy(true);
      try {
        const nowMs = Date.now();
        if (guestMode) {
          const incomeMult = protectionIncomeMultiplier(protectionsRef.current);
          const advanced = advancePlotsToNow(saveRef.current, nowMs);
          const pending = peekUnsettledRu(advanced, nowMs, incomeMult);
          if (pending <= 0) {
            setSyncNote("No new earnings to harvest yet.");
            return false;
          }
          persist({ ...advanced, lastSettledMs: nowMs });
          const mult = opts?.rewardedDouble ? 2 : 1;
          const granted = pending * mult;
          applyBalanceFromServer(accountBalanceRef.current + granted);
          setPendingHarvest(0);
          if (!opts?.skipCooldownCheck) setHarvestCooldownSec(60);
          setSyncNote(
            opts?.rewardedDouble
              ? `Harvested +${formatRu(granted)} Root Units (2× guest bonus).`
              : `Harvested +${formatRu(pending)} Root Units (guest session only).`,
          );
          return true;
        }
        const remote = await fetchFarmsState();
        if (remote?.ok) {
          applyRemoteFarmsState(remote, nowMs, { skipWelcome: true });
        }
        persist(advancePlotsToNow(saveRef.current, nowMs));
        const settled = await postFarmsSettle(nowMs, progressVersionRef.current, saveRef.current.plots, {
          rewardedDouble: opts?.rewardedDouble,
        });
        if (settled?.ok) {
          applySettleSuccess(settled);
          if (settled.granted > 0) {
            markHarvestCooldown(nowMs, settled.harvest_cooldown_sec ?? 60);
            if (opts?.rewardedDouble && (settled.ad_bonus_granted ?? 0) > 0) {
              setSyncNote(`Harvested +${formatRu(settled.granted)} Root Units (2× away bonus).`);
            }
          } else if (settled.daily_cap_blocked) {
            setSyncNote(settled.detail ?? "Daily farms earning cap reached for today.");
          } else if (settled.detail) {
            setSyncNote(settled.detail);
          } else if ((settled.pending_ru ?? 0) > 0) {
            setSyncNote(
              `Server pending ${formatRu(settled.pending_ru ?? 0)} — farm progress is syncing. Wait a moment and harvest again.`,
            );
          } else {
            setSyncNote("No new earnings to harvest yet.");
          }
          return settled.granted > 0;
        }
        if (settled && !settled.ok) {
          if (settled.status === 429) {
            const retry = settled.retry_after_sec ?? 60;
            markHarvestCooldown(Date.now() - (60_000 - retry * 1000), retry);
            if (settled.balance != null) applyBalanceFromServer(settled.balance);
            if (settled.pending_ru != null) {
              setPendingHarvest(settled.pending_ru);
              persistPendingRu(scope, settled.pending_ru);
            }
            setSyncNote(settled.detail ?? `Harvest again in ${retry}s.`);
            return false;
          }
          if (settled.status === 409 && settled.progress_version != null) {
            setProgressVersion(settled.progress_version);
            progressVersionRef.current = settled.progress_version;
            if (settled.plots?.length) {
              const merged = applyServerPlots(saveRef.current, {
                plots: settled.plots,
                lifetimeEarned: settled.lifetime_farms_earned,
                lastSettledMs: settled.last_settled_ms,
              });
              persist({ ...merged, lastTickMs: Date.now() });
            }
            if (settled.balance != null) applyBalanceFromServer(settled.balance);
            const retry = await postFarmsSettle(
              Date.now(),
              progressVersionRef.current,
              saveRef.current.plots,
            );
            if (retry?.ok) {
              applySettleSuccess(retry);
              if (retry.granted > 0) {
                markHarvestCooldown(Date.now(), retry.harvest_cooldown_sec ?? 60);
                return true;
              }
            }
          }
        }
        if (settled === null) {
          setSyncNote("Farm server unreachable — reinstall after update or check connection.");
        } else {
          setSyncNote(settled.detail ?? "Could not harvest — try again in a moment.");
        }
        return false;
      } finally {
        setHarvestBusy(false);
      }
    },
    [
      applyBalanceFromServer,
      applySettleSuccess,
      balanceReady,
      harvestBusy,
      guestMode,
      harvestCooldownSec,
      markHarvestCooldown,
      persist,
    ],
  );

  const harvestNow = useCallback(async () => {
    if (welcomeBackRef.current != null) return;
    await performHarvest();
  }, [performHarvest]);

  const bootstrapSession = useCallback(async () => {
    setProgressVersion(1);
    progressVersionRef.current = 1;
    if (guestMode) {
      farmsApiLiveRef.current = false;
      const loaded = createInitialSave();
      saveRef.current = loaded;
      setSave(loaded);
      applyBalanceFromServer(GUEST_STARTING_BALANCE);
      setBalanceReady(true);
      setPendingHarvest(0);
      const incomeMult = protectionIncomeMultiplier(protectionsRef.current);
      setRuPerSec(totalRuPerSec(loaded, incomeMult));
      setSyncNote("Guest mode — nothing is saved. Your farm resets when you open the app again.");
      return;
    }
    if (!(await loadAccountBalanceFirst())) return;
    const loaded = loadSave(scope);
    const nowMs = Date.now();
    const awayMs = computeAwayMs(nowMs);
    saveRef.current = loaded;
    setSave(loaded);
    const remote = await fetchFarmsState();
    if (remote?.ok) {
      applyRemoteFarmsState(remote, nowMs, { awayMs });
    } else {
      await syncFarmsAfterBalance();
    }
    if (welcomeBackRef.current == null) {
      const next = advancePlotsToNow(saveRef.current, nowMs);
      saveRef.current = next;
      setSave(next);
    }
    persistLastForegroundMs(scope, nowMs);
  }, [
    applyBalanceFromServer,
    applyRemoteFarmsState,
    computeAwayMs,
    guestMode,
    loadAccountBalanceFirst,
    persist,
    scope,
    syncFarmsAfterBalance,
  ]);

  useEffect(() => {
    if (!auth.decided) return;
    void bootstrapSession();
  }, [auth.decided, bootstrapSession]);

  useEffect(() => {
    if (!balanceReady || guestMode) return;
    const refresh = () => {
      if (welcomeBackRef.current != null || harvestBusy) return;
      void fetchFarmsState().then((remote) => {
        if (remote?.ok) applyRemoteFarmsState(remote, Date.now(), { skipWelcome: true });
      });
    };
    refresh();
    const id = window.setInterval(refresh, 12_000);
    return () => clearInterval(id);
  }, [applyRemoteFarmsState, balanceReady, guestMode, harvestBusy]);

  const refreshServerBalance = useCallback(async () => {
    if (!(await loadAccountBalanceFirst())) return;
    await syncFarmsAfterBalance();
  }, [loadAccountBalanceFirst, syncFarmsAfterBalance]);



  useEffect(() => {

    let raf = 0;

    let last = performance.now();

    let lastRender = 0;

    const loop = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (welcomeBackRef.current != null) {
        raf = requestAnimationFrame(loop);
        return;
      }
      if (dt > 0) {
        const incomeMult = protectionIncomeMultiplier(protectionsRef.current);
        const { save: next } = simulatePlotTicks(saveRef.current, dt, incomeMult);
        saveRef.current = next;
        if (now - lastRender > 80) {
          lastRender = now;
          setSave(next);
          if (balanceReady) {
            setRuPerSec(totalRuPerSec(next, incomeMult));
            const gross = totalRuPerSec(next, 1);
            setProtectionFeePerMinute(Math.floor(gross * 60 * (1 - incomeMult)));
            const pending = peekUnsettledRu(next, Date.now(), incomeMult);
            setPendingHarvest(pending);
            persistPendingRu(scope, pending);
          }
        }

      }

      raf = requestAnimationFrame(loop);

    };

    raf = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(raf);

  }, [balanceReady, guestMode, scope]);

  useEffect(() => {
    if (guestMode) return;
    const id = window.setInterval(() => {
      persist(saveRef.current);
    }, 5000);
    return () => clearInterval(id);
  }, [guestMode, persist]);

  useEffect(() => {
    if (guestMode) return;
    return subscribeAccountBalance((balance) => {
      applyBalanceFromServer(balance);
    });
  }, [applyBalanceFromServer, guestMode]);

  useEffect(() => {
    const tick = () => setHarvestCooldownSec(harvestCooldownSecRemaining(scope));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [scope]);



  const refreshServerBalanceRef = useRef(refreshServerBalance);
  refreshServerBalanceRef.current = refreshServerBalance;

  const dismissActiveVarmint = useCallback(async () => {
    const cur = activeVarmintEvent;
    if (cur) await postVarmintAck([cur.id]);
    const rest = activeVarmintQueueRef.current.filter((e) => e.id !== cur?.id);
    activeVarmintQueueRef.current = rest;
    setActiveVarmintEvent(rest[0] ?? null);
    if (!rest.length) {
      setVarmintNotifications((prev) => prev.filter((e) => e.id !== cur?.id));
    }
  }, [activeVarmintEvent]);

  const toggleProtection = useCallback(
    async (kind: ProtectionKind, enabled: boolean) => {
      if (storeBusy || !balanceReady) return;
      if (guestMode) {
        const next = { ...protectionsRef.current, [kind]: enabled };
        setProtections(next);
        protectionsRef.current = next;
        const incomeMult = protectionIncomeMultiplier(next);
        setRuPerSec(totalRuPerSec(saveRef.current, incomeMult));
        const gross = totalRuPerSec(saveRef.current, 1);
        setProtectionFeePerMinute(Math.floor(gross * 60 * (1 - incomeMult)));
        return;
      }
      setStoreBusy(true);
      try {
        const remote = await postStoreProtectionToggle(kind, enabled, progressVersionRef.current);
        if (!remote?.ok) {
          setSyncNote("Could not update protection — refresh and try again.");
          return;
        }
        applyRemoteFarmsState(remote, Date.now());
      } finally {
        setStoreBusy(false);
      }
    },
    [applyRemoteFarmsState, balanceReady, guestMode, storeBusy],
  );

  const resolveWelcomeBack = useCallback(
    (withAdBonus: boolean) => {
      const ids = welcomeBack?.varmintEvents.map((e) => e.id) ?? [];
      if (ids.length) void postVarmintAck(ids);
      setWelcomeBack(null);
      activeVarmintQueueRef.current = [];
      setActiveVarmintEvent(null);
      void performHarvest({ skipCooldownCheck: true, rewardedDouble: withAdBonus });
    },
    [performHarvest, welcomeBack],
  );

  const handleAppResume = useCallback(() => {
    if (welcomeBackRef.current != null) return;
    const nowMs = Date.now();
    const awayMs = computeAwayMs(nowMs);
    if (guestMode) {
      if (awayMs >= OFFLINE_CONTRACT_MIN_AWAY_MS) {
        const incomeMult = protectionIncomeMultiplier(protectionsRef.current);
        const pending = peekUnsettledRu(saveRef.current, nowMs, incomeMult);
        if (pending > 0) {
          setWelcomeBack({ harvestRu: pending, varmintEvents: [] });
          return;
        }
      }
      const next = advancePlotsToNow(saveRef.current, nowMs);
      saveRef.current = next;
      setSave(next);
      return;
    }

    if (!balanceReady) return;

    void (async () => {
      const remote = await fetchFarmsState();
      if (remote?.ok) {
        applyRemoteFarmsState(remote, nowMs, { awayMs });
      } else {
        await refreshServerBalanceRef.current();
      }
      if (welcomeBackRef.current == null) {
        const advanced = advancePlotsToNow(saveRef.current, nowMs);
        saveRef.current = advanced;
        setSave(advanced);
      }
    })();
  }, [applyRemoteFarmsState, balanceReady, computeAwayMs, guestMode, scope]);

  const handleAppPause = useCallback(() => {
    persistLastForegroundMs(scope, Date.now());
  }, [scope]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") handleAppPause();
      else handleAppResume();
    };
    const onResume = () => handleAppResume();
    const onPause = () => handleAppPause();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("rr-farms-resume", onResume);
    window.addEventListener("rr-farms-pause", onPause);
    window.addEventListener("pagehide", onPause);
    window.addEventListener("pageshow", () => {
      if (document.visibilityState === "visible") handleAppResume();
    });
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("rr-farms-resume", onResume);
      window.removeEventListener("rr-farms-pause", onPause);
      window.removeEventListener("pagehide", onPause);
    };
  }, [handleAppPause, handleAppResume]);



  const spendableBalance = accountBalance;



  const runPurchase = useCallback(

    async (kind: FarmsPurchaseKind, plotId: number, localCost: number, _applyLocal: (s: GameSave) => GameSave): Promise<PurchaseResult> => {

      if (purchaseBusy) return "unavailable";
      if (!balanceReady) return "offline";
      if (accountBalanceRef.current < localCost) return "insufficient";

      if (guestMode) {
        setPurchaseBusy(true);
        try {
          persist(_applyLocal(saveRef.current));
          applyBalanceFromServer(accountBalanceRef.current - localCost);
          return "ok";
        } finally {
          setPurchaseBusy(false);
        }
      }

      setPurchaseBusy(true);

      try {
        const applyPurchaseResponse = (
          remote: NonNullable<Awaited<ReturnType<typeof postFarmsPurchase>>>,
        ) => {
          applyBalanceFromServer(remote.balance);
          setProgressVersion(remote.progress_version);
          progressVersionRef.current = remote.progress_version;
          persist(
            applyServerPlots(saveRef.current, {
              plots: remote.plots,
              lifetimeEarned: remote.lifetime_farms_earned,
              lastSettledMs: remote.last_settled_ms,
            }),
          );
        };

        const attempt = async (): Promise<PurchaseResult | "retry"> => {
          const remote = await postFarmsPurchase(kind, plotId, progressVersionRef.current);
          if (!remote) return "offline";
          applyPurchaseResponse(remote);
          if (remote.rejected) {
            if (accountBalanceRef.current < remote.cost) return "insufficient";
            const d = (remote.detail || "").toLowerCase();
            if (d.includes("previous plot") || d.includes("unlock the previous")) return "unavailable";
            return "retry";
          }
          return "ok";
        };

        for (let tryN = 0; tryN < 4; tryN++) {
          const result = await attempt();
          if (result === "ok" || result === "insufficient" || result === "unavailable") return result;
          if (result === "offline") {
            const remote = await fetchFarmsState();
            if (!remote?.ok) return "offline";
            setProgressVersion(remote.progress_version);
            progressVersionRef.current = remote.progress_version;
            if (remote.plots?.length) {
              persist(
                applyServerPlots(saveRef.current, {
                  plots: remote.plots,
                  lifetimeEarned: remote.lifetime_farms_earned,
                  lastSettledMs: remote.last_settled_ms,
                }),
              );
            }
            continue;
          }
          /* retry — state synced from rejected response */
        }
        return "offline";

      } finally {

        setPurchaseBusy(false);

      }

    },

    [applyBalanceFromServer, balanceReady, guestMode, persist, purchaseBusy],

  );



  const purchaseRowSlot = useCallback(

    (plotId: number) => {

      const plot = saveRef.current.plots.find((p) => p.id === plotId);

      if (!plot?.unlocked) return Promise.resolve("unavailable" as const);

      const cat = getPlotCatalog(plotId);

      if (plot.rowCount >= cat.maxRows) return Promise.resolve("unavailable" as const);

      const cost = rowSlotCost(plotId, plot.rowCount);

      if (!balanceReady) return Promise.resolve("offline" as const);

      return runPurchase("row_slot", plotId, cost, (s) => {

        const plots = s.plots.map((p) => {

          if (p.id !== plotId) return p;

          const rowCount = p.rowCount + 1;

          return { ...p, rowCount, rowsActive: rowCount };

        });

        return { ...s, plots };

      });

    },

    [balanceReady, runPurchase],

  );



  const purchasePlotUnlock = useCallback(

    (plotId: number) => {

      if (!canBuyPlotUnlock(saveRef.current, plotId)) return Promise.resolve("unavailable" as const);

      const cost = plotUnlockCost(plotId);

      if (!balanceReady) return Promise.resolve("offline" as const);

      return runPurchase("unlock_plot", plotId, cost, (s) => {

        const plots = s.plots.map((p) =>

          p.id === plotId ? { ...p, unlocked: true, rowCount: 1, rowsActive: 1, cycleProgress: 0 } : p,

        );

        return { ...s, plots };

      });

    },

    [balanceReady, runPurchase],

  );



  const resetProgress = useCallback(() => {
    setWelcomeBack(null);
    if (guestMode) {
      const fresh = createInitialSave();
      persist(fresh);
      applyBalanceFromServer(GUEST_STARTING_BALANCE);
      setPendingHarvest(0);
      setHarvestCooldownSec(0);
      return;
    }
    clearSave(scope);
    const fresh = advancePlotsToNow(loadSave(scope), Date.now());
    persist(fresh);
    setProgressVersion(1);
    progressVersionRef.current = 1;
    void refreshServerBalanceRef.current();
  }, [applyBalanceFromServer, guestMode, persist, scope]);



  const value = useMemo<GameCtx>(

    () => ({

      save,

      scope,
      guestMode,

      accountBalance,
      balanceReady,
      pendingHarvest,
      spendableBalance,

      syncNote,

      progressVersion,

      purchaseBusy,

      refreshServerBalance,
      harvestNow,
      harvestBusy,
      harvestCooldownSec,

      purchaseRowSlot,

      purchasePlotUnlock,

      resetProgress,

      protections,
      ruPerSec,
      protectionFeePerMinute,
      storeBusy,
      toggleProtection,
      varmintNotifications,
      activeVarmintEvent,
      dismissActiveVarmint,
      welcomeBack,
      resolveWelcomeBack,

    }),

    [

      save,

      scope,
      guestMode,

      accountBalance,
      balanceReady,
      pendingHarvest,
      spendableBalance,

      syncNote,

      progressVersion,

      purchaseBusy,

      refreshServerBalance,
      harvestNow,
      harvestBusy,
      harvestCooldownSec,

      purchaseRowSlot,

      purchasePlotUnlock,

      resetProgress,

      protections,
      ruPerSec,
      protectionFeePerMinute,
      storeBusy,
      toggleProtection,
      varmintNotifications,
      activeVarmintEvent,
      dismissActiveVarmint,
      welcomeBack,
      resolveWelcomeBack,

    ],

  );



  if (!balanceReady && welcomeBack == null) {
    return (
      <Ctx.Provider value={value}>
        <div className="boot">Loading Root Units…</div>
      </Ctx.Provider>
    );
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;

}



export function useGame(): GameCtx {

  const v = useContext(Ctx);

  if (!v) throw new Error("useGame must be used within GameProvider");

  return v;

}

