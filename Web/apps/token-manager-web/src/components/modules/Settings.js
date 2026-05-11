import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../ui/PageHeader";
import NetworkPill from "../ui/NetworkPill";
import AddressCopy from "../ui/AddressCopy";
import { useWallet } from "../../contexts/WalletContext";
import { LogOut, BookUser, Network, ChevronRight, ShieldCheck, Coins, RotateCw, Wallet, Megaphone, Gift, MessageSquare } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { earnGetSummary, formatRrApiError } from "../../lib/rrApi";
import {
  formatRewardBalance,
  parseDisplayBalanceFromSummary,
  parseRewardBreakdownFromSummary,
  SOLANA_TOOLS_ACCOUNT_URL,
} from "../../lib/rewardsFormat";
import { NATIVE_APP_VERSION } from "../../lib/nativeAppVersion";

const NETS = [
  { id: "mainnet-beta", label: "Mainnet", hint: "Live SOL — be careful" },
  { id: "devnet", label: "Devnet", hint: "Free SOL via faucet · safe to test" },
  { id: "testnet", label: "Testnet", hint: "Validator performance cluster" },
];

export default function Settings() {
  const nav = useNavigate();
  const { pubkey, mode, network, changeNetwork, disconnect } = useWallet();
  const { user, logout, refreshEntitlement } = useAuth();
  const [earn, setEarn] = useState(null);
  const [earnLoading, setEarnLoading] = useState(false);
  const [earnErr, setEarnErr] = useState("");
  const [entBusy, setEntBusy] = useState(false);

  const loadEarn = useCallback(async () => {
    setEarnErr("");
    setEarnLoading(true);
    try {
      const { data } = await earnGetSummary();
      setEarn(data || null);
    } catch (e) {
      setEarn(null);
      setEarnErr(formatRrApiError(e));
    } finally {
      setEarnLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadEarn();
  }, [user, loadEarn]);

  const rewardBr = user ? parseRewardBreakdownFromSummary(earn) : null;
  const rewardHeadline = user ? formatRewardBalance(parseDisplayBalanceFromSummary(earn)) : null;

  return (
    <div className="page-shell" data-testid="settings-screen">
      <PageHeader title="Settings" subtitle="Preferences & network" right={<NetworkPill network={network} />} />

      <div className="px-4 pt-4 space-y-4">
        <div className="card p-4" data-testid="settings-account">
          <div className="label mb-2">Connected wallet</div>
          <AddressCopy address={pubkey} short={false} className="mono text-[12px]" testid="settings-address" />
          <div className="mt-2 text-xs text-ink-tertiary">
            Mode: <span className="mono uppercase tracking-widest">{mode || "none"}</span>
          </div>
        </div>

        <div className="card p-4" data-testid="settings-rootrecord-login">
          <div className="label mb-2">RootRecord login</div>
          <div className="text-sm text-ink-secondary">
            {user?.email ? (
              <>
                Signed in as <span className="mono">{user.email}</span>
              </>
            ) : (
              "Not signed in."
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <div className="mt-3 flex flex-col gap-2">
              {user?.email ? (
                <>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-ghost flex-1"
                      onClick={async () => {
                        await logout();
                        nav("/auth", { replace: true });
                      }}
                      data-testid="settings-rr-logout"
                    >
                      <LogOut size={16} /> Sign out
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary w-full text-xs"
                    disabled={entBusy}
                    onClick={async () => {
                      setEntBusy(true);
                      try {
                        await refreshEntitlement();
                      } catch (e) {
                        console.warn("refreshEntitlement", e);
                      } finally {
                        setEntBusy(false);
                      }
                    }}
                    data-testid="settings-refresh-entitlement"
                  >
                    {entBusy ? "Refreshing plan…" : "Refresh plan from server"}
                  </button>
                </>
              ) : (
                <button className="btn btn-primary w-full" onClick={() => nav("/auth")} data-testid="settings-rr-login">
                  Sign in
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="card p-4" data-testid="settings-rewards">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Coins size={16} className="text-phos" />
              <div className="label mb-0">Rewards</div>
            </div>
            <button
              className="btn btn-ghost px-3 py-2"
              onClick={loadEarn}
              disabled={!user || earnLoading}
              data-testid="settings-rewards-refresh"
              title="Refresh"
            >
              <RotateCw size={16} />
            </button>
          </div>
          <div className="mt-2 text-sm text-ink-secondary">
            {user ? (
              earnLoading ? (
                "Loading…"
              ) : earnErr ? (
                <span className="text-red-200">{earnErr}</span>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-ink-tertiary">Pending rewards</span>
                    <span className="font-semibold text-ink-primary tabular-nums">{formatRewardBalance(rewardBr?.pending ?? null)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-ink-tertiary">Wallet balance</span>
                    <span className="font-semibold text-ink-primary tabular-nums">{formatRewardBalance(rewardBr?.wallet ?? null)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-ink-tertiary">Lifetime rewards</span>
                    <span className="font-semibold text-ink-primary tabular-nums">{formatRewardBalance(rewardBr?.lifetime ?? null)}</span>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-white/10 pt-1.5 mt-1">
                    <span className="text-ink-tertiary">Total (apps)</span>
                    <span className="font-semibold text-ink-primary tabular-nums">{rewardHeadline}</span>
                  </div>
                  <p className="text-[10px] text-ink-tertiary leading-relaxed pt-0.5">
                    Headline total includes pending accruals. Withdrawable on-chain:{" "}
                    <a href={SOLANA_TOOLS_ACCOUNT_URL} className="text-phos underline" target="_blank" rel="noopener noreferrer">
                      Solana Tools → Account
                    </a>
                    . Shared across RootRecord apps.
                  </p>
                </div>
              )
            ) : (
              "Sign in to track your shared rewards balance."
            )}
          </div>
        </div>

        <div className="card overflow-hidden" data-testid="settings-network">
          <div className="px-4 py-3 flex items-center gap-2 border-b border-white/5">
            <Network size={16} className="text-ink-secondary" />
            <span className="label mb-0">Network</span>
          </div>
          <div className="divide-y divide-white/5">
            {NETS.map((n) => (
              <button
                key={n.id}
                onClick={() => changeNetwork(n.id)}
                className={`w-full flex items-center justify-between p-4 text-left transition-colors ${
                  network === n.id ? "bg-phos/5" : "hover:bg-white/5"
                }`}
                data-testid={`settings-network-${n.id}`}
              >
                <div>
                  <div className="font-semibold text-ink-primary">{n.label}</div>
                  <div className="text-[11px] text-ink-tertiary mt-0.5">{n.hint}</div>
                </div>
                <span
                  className={`w-4 h-4 rounded-full border ${
                    network === n.id ? "bg-phos border-phos" : "border-white/20"
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => nav("/testing-rewards")}
          className="card w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
          data-testid="settings-open-testing-rewards"
        >
          <div className="flex items-center gap-3">
            <Gift size={18} className="text-phos" />
            <div className="text-left">
              <div className="font-semibold text-ink-primary">Testing rewards</div>
              <div className="text-[11px] text-ink-tertiary mt-0.5">Pending / wallet / lifetime — full withdraw on Solana Tools.</div>
            </div>
          </div>
          <ChevronRight size={16} className="text-ink-tertiary" />
        </button>

        <button
          onClick={() => nav("/developer-messages")}
          className="card w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
          data-testid="settings-open-developer-messages"
        >
          <div className="flex items-center gap-3">
            <Megaphone size={18} className="text-phos" />
            <div className="text-left">
              <div className="font-semibold text-ink-primary">Developer messages</div>
              <div className="text-[11px] text-ink-tertiary mt-0.5">Release notes and notices from RootRecord.</div>
            </div>
          </div>
          <ChevronRight size={16} className="text-ink-tertiary" />
        </button>

        <button
          onClick={() => nav("/feedback")}
          className="card w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
          data-testid="settings-open-feedback"
        >
          <div className="flex items-center gap-3">
            <MessageSquare size={18} className="text-phos" />
            <div className="text-left">
              <div className="font-semibold text-ink-primary">Send feedback</div>
              <div className="text-[11px] text-ink-tertiary mt-0.5">In-app note to the team.</div>
            </div>
          </div>
          <ChevronRight size={16} className="text-ink-tertiary" />
        </button>

        <button
          onClick={() => nav("/contacts")}
          className="card w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
          data-testid="settings-open-contacts"
        >
          <div className="flex items-center gap-3">
            <BookUser size={18} className="text-phos" />
            <div className="text-left">
              <div className="font-semibold text-ink-primary">Address book</div>
              <div className="text-[11px] text-ink-tertiary mt-0.5">Save and reuse recipient addresses.</div>
            </div>
          </div>
          <ChevronRight size={16} className="text-ink-tertiary" />
        </button>

        <button
          onClick={() => nav("/my-wallet")}
          className="card w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
          data-testid="settings-open-my-wallet"
        >
          <div className="flex items-center gap-3">
            <Wallet size={18} className="text-phos" />
            <div className="text-left">
              <div className="font-semibold text-ink-primary">My Wallet</div>
              <div className="text-[11px] text-ink-tertiary mt-0.5">Internal RootRecord wallet address.</div>
            </div>
          </div>
          <ChevronRight size={16} className="text-ink-tertiary" />
        </button>

        <div className="card p-4 flex items-start gap-2 text-xs text-ink-secondary" data-testid="settings-security-note">
          <ShieldCheck size={16} className="mt-0.5 text-phos" />
          <span>
            RootRecord never stores or transmits seed phrases or private keys. Signing always happens in your wallet app.
          </span>
        </div>

        <button
          onClick={async () => { await disconnect(); nav("/connect", { replace: true }); }}
          className="btn btn-danger w-full"
          data-testid="settings-disconnect-btn"
        >
          <LogOut size={16} /> Disconnect
        </button>

        <div className="text-center text-[11px] text-ink-tertiary pt-2">
          RootRecord Token Manager · v{NATIVE_APP_VERSION} · mobile
        </div>
      </div>
    </div>
  );
}
