/**
 * Wallet admin calls go to same-origin `/api/dev/wallet-admin/*` (Next.js route proxies to
 * rootrecord-primary with server-side `RR_PUSH_ADMIN_SECRET`). Do not call the API host directly
 * from the browser — production Worker requires `X-RR-Push-Admin-Key`.
 */
function walletAdminBase(): string {
  return '';
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export type DevWalletListItem = {
  account_id: string;
  pubkey: string;
  created_at: string;
  email: string | null;
};

export type DevWalletOverview = {
  account_id: string;
  pubkey: string;
  sol_balance_lamports: number | null;
  token_accounts: Array<{
    token_account: string;
    mint: string | null;
    owner: string | null;
    amount_raw: string | null;
    decimals: number | null;
    ui_amount: number | null;
    ui_amount_string: string | null;
  }>;
};

function detailFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const d = (body as { detail?: unknown }).detail;
    if (typeof d === 'string' && d.trim()) return d;
  }
  return fallback;
}

async function apiFetch(path: string, token: string, init?: RequestInit): Promise<Response> {
  return fetch(`${walletAdminBase()}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      ...authHeaders(token),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}

export type DevListWalletsParams = {
  limit?: number;
  cursor?: string | null;
  q?: string;
};

export async function devListWallets(
  token: string,
  params: DevListWalletsParams | number = {},
): Promise<
  | { ok: true; items: DevWalletListItem[]; total_count: number; next_cursor: string | null }
  | { ok: false; status: number; detail: string }
> {
  const p: DevListWalletsParams = typeof params === 'number' ? { limit: params } : params;
  const limit = p.limit ?? 10;
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  const c = p.cursor == null ? '' : String(p.cursor).trim();
  if (c) qs.set('cursor', c);
  const q = String(p.q ?? '').trim();
  if (q) qs.set('q', q);
  const res = await apiFetch(`/api/dev/wallet-admin/wallets?${qs.toString()}`, token);
  const j: unknown = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, detail: detailFromBody(j, `HTTP ${res.status}`) };
  const items =
    j && typeof j === 'object' && 'items' in j && Array.isArray((j as { items: unknown }).items)
      ? ((j as { items: DevWalletListItem[] }).items as DevWalletListItem[])
      : [];
  const total_count =
    j && typeof j === 'object' && 'total_count' in j && typeof (j as { total_count?: unknown }).total_count === 'number'
      ? Math.max(0, Math.floor((j as { total_count: number }).total_count))
      : 0;
  const next_cursor =
    j && typeof j === 'object' && 'next_cursor' in j && typeof (j as { next_cursor?: unknown }).next_cursor === 'string'
      ? (j as { next_cursor: string }).next_cursor
      : null;
  return { ok: true, items, total_count, next_cursor };
}

export async function devWalletOverview(
  token: string,
  accountId: string,
): Promise<{ ok: true; overview: DevWalletOverview } | { ok: false; status: number; detail: string }> {
  const res = await apiFetch(`/api/dev/wallet-admin/wallet/${encodeURIComponent(accountId)}/overview`, token);
  const j: unknown = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, detail: detailFromBody(j, `HTTP ${res.status}`) };
  if (!j || typeof j !== 'object') {
    return { ok: false, status: 502, detail: 'Invalid overview response.' };
  }
  const raw = j as Record<string, unknown>;
  const token_accounts = Array.isArray(raw.token_accounts) ? raw.token_accounts : [];
  const overview: DevWalletOverview = {
    account_id: String(raw.account_id ?? accountId),
    pubkey: String(raw.pubkey ?? ''),
    sol_balance_lamports: typeof raw.sol_balance_lamports === 'number' ? raw.sol_balance_lamports : null,
    token_accounts: token_accounts as DevWalletOverview['token_accounts'],
  };
  return { ok: true, overview };
}

export async function devTransferSol(
  token: string,
  accountId: string,
  toPubkeyBase58: string,
  lamports: number,
): Promise<{ ok: true; signature: string } | { ok: false; status: number; detail: string }> {
  const res = await apiFetch(`/api/dev/wallet-admin/wallet/${encodeURIComponent(accountId)}/transfer-sol`, token, {
    method: 'POST',
    body: JSON.stringify({ to_pubkey_base58: toPubkeyBase58, lamports }),
  });
  const j: unknown = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, detail: detailFromBody(j, `HTTP ${res.status}`) };
  const sig =
    j && typeof j === 'object' && 'signature' in j && typeof (j as { signature?: unknown }).signature === 'string'
      ? (j as { signature: string }).signature
      : '';
  return { ok: true, signature: sig };
}

export async function devTransferSpl(
  token: string,
  accountId: string,
  mintBase58: string,
  toOwnerBase58: string,
  amountUi: string,
  decimals: number,
): Promise<{ ok: true; signature: string } | { ok: false; status: number; detail: string }> {
  const res = await apiFetch(`/api/dev/wallet-admin/wallet/${encodeURIComponent(accountId)}/transfer-spl`, token, {
    method: 'POST',
    body: JSON.stringify({ mint_base58: mintBase58, to_owner_base58: toOwnerBase58, amount_ui: amountUi, decimals }),
  });
  const j: unknown = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, detail: detailFromBody(j, `HTTP ${res.status}`) };
  const sig =
    j && typeof j === 'object' && 'signature' in j && typeof (j as { signature?: unknown }).signature === 'string'
      ? (j as { signature: string }).signature
      : '';
  return { ok: true, signature: sig };
}

export async function devBurnSpl(
  token: string,
  accountId: string,
  mintBase58: string,
  amountUi: string,
  decimals: number,
): Promise<{ ok: true; signature: string } | { ok: false; status: number; detail: string }> {
  const res = await apiFetch(`/api/dev/wallet-admin/wallet/${encodeURIComponent(accountId)}/burn-spl`, token, {
    method: 'POST',
    body: JSON.stringify({ mint_base58: mintBase58, amount_ui: amountUi, decimals }),
  });
  const j: unknown = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, detail: detailFromBody(j, `HTTP ${res.status}`) };
  const sig =
    j && typeof j === 'object' && 'signature' in j && typeof (j as { signature?: unknown }).signature === 'string'
      ? (j as { signature: string }).signature
      : '';
  return { ok: true, signature: sig };
}

export async function devCloseEmptyAta(
  token: string,
  accountId: string,
  tokenAccountBase58: string,
  destinationBase58: string,
): Promise<{ ok: true; signature: string } | { ok: false; status: number; detail: string }> {
  const res = await apiFetch(`/api/dev/wallet-admin/wallet/${encodeURIComponent(accountId)}/close-empty-ata`, token, {
    method: 'POST',
    body: JSON.stringify({ token_account_base58: tokenAccountBase58, destination_base58: destinationBase58 }),
  });
  const j: unknown = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, detail: detailFromBody(j, `HTTP ${res.status}`) };
  const sig =
    j && typeof j === 'object' && 'signature' in j && typeof (j as { signature?: unknown }).signature === 'string'
      ? (j as { signature: string }).signature
      : '';
  return { ok: true, signature: sig };
}

