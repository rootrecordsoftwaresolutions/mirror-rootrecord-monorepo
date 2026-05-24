import { apiFetch } from "./api";

export type RootsMintStatus = {
  ok: true;
  roots_mint: string;
  internal_balance_atomic: number;
  custodial_roots_atomic: number;
  custodial_wallet: string;
  custodial_sol_lamports: number;
  minimum_sol_lamports: number;
  can_mint: boolean;
};

export type RootsMintResult =
  | {
      ok: true;
      request_id: string;
      amount_atomic: number;
      destination_owner: string;
      custodial_fee_payer: string;
      tx_signature: string;
      explorer: string;
      new_balance: number;
    }
  | {
      ok: false;
      detail: string;
      request_id?: string;
      pending?: boolean;
      tx_signature?: string;
      explorer?: string;
      new_balance?: number;
    };

function detailFromData(data: Record<string, unknown>, fallback: string): string {
  return typeof data.detail === "string" && data.detail.trim() ? data.detail : fallback;
}

export async function fetchRootsMintStatus(): Promise<RootsMintStatus | { ok: false; detail: string }> {
  try {
    const res = await apiFetch("/api/v1/me/roots/mint-balance", { method: "GET", headers: { Accept: "application/json" } });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data.ok !== true) return { ok: false, detail: detailFromData(data, "Could not load Minting Machine status.") };
    return {
      ok: true,
      roots_mint: String(data.roots_mint || ""),
      internal_balance_atomic: Math.max(0, Math.floor(Number(data.internal_balance_atomic) || 0)),
      custodial_roots_atomic: Math.max(0, Math.floor(Number(data.custodial_roots_atomic) || 0)),
      custodial_wallet: String(data.custodial_wallet || ""),
      custodial_sol_lamports: Math.max(0, Math.floor(Number(data.custodial_sol_lamports) || 0)),
      minimum_sol_lamports: Math.max(0, Math.floor(Number(data.minimum_sol_lamports) || 0)),
      can_mint: data.can_mint === true,
    };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Could not reach the Minting Machine." };
  }
}

export async function mintFullRootsBalance(destinationPubkey?: string): Promise<RootsMintResult> {
  try {
    const res = await apiFetch("/api/v1/me/roots/mint-balance", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ destination_pubkey: destinationPubkey?.trim() || null }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data.ok !== true) {
      return {
        ok: false,
        detail: detailFromData(data, `Mint request failed (${res.status}).`),
        request_id: typeof data.request_id === "string" ? data.request_id : undefined,
        pending: data.pending === true,
        tx_signature: typeof data.tx_signature === "string" ? data.tx_signature : undefined,
        explorer: typeof data.explorer === "string" ? data.explorer : undefined,
        new_balance: data.new_balance != null ? Math.max(0, Math.floor(Number(data.new_balance) || 0)) : undefined,
      };
    }
    return {
      ok: true,
      request_id: String(data.request_id || ""),
      amount_atomic: Math.max(0, Math.floor(Number(data.amount_atomic) || 0)),
      destination_owner: String(data.destination_owner || ""),
      custodial_fee_payer: String(data.custodial_fee_payer || ""),
      tx_signature: String(data.tx_signature || ""),
      explorer: String(data.explorer || ""),
      new_balance: Math.max(0, Math.floor(Number(data.new_balance) || 0)),
    };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Could not reach the Minting Machine." };
  }
}
