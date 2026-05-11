'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

import {
  devBurnSpl,
  devCloseEmptyAta,
  devListWallets,
  devTransferSol,
  devTransferSpl,
  devWalletOverview,
  type DevWalletListItem,
  type DevWalletOverview,
} from '@/lib/devWalletAdminApi';
import { getPortalToken } from '@/lib/rootrecordSession';

const PAGE_SIZE = 10;
const CUSTOM = '__custom__';

const selectClassName = cn(
  'flex h-11 w-full rounded-lg border border-border bg-ink-700/40 px-3 py-2 text-sm text-foreground transition-colors',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sol-green/40 focus-visible:border-sol-green/60',
  'disabled:cursor-not-allowed disabled:opacity-50',
);

function short(s: string, n = 42): string {
  if (!s) return '';
  return s.length <= n ? s : `${s.slice(0, Math.max(0, n - 1))}…`;
}

function solFromLamports(lamports: number | null): string {
  if (lamports == null || !Number.isFinite(lamports)) return '—';
  const sol = lamports / 1e9;
  const fixed = sol.toFixed(9);
  return fixed.replace(/0+$/, '').replace(/\.$/, '');
}

function uniqPubkeys(rows: DevWalletListItem[], extra: string | null | undefined): string[] {
  const s = new Set<string>();
  for (const w of rows) {
    const p = String(w.pubkey || '').trim();
    if (p) s.add(p);
  }
  const e = String(extra || '').trim();
  if (e) s.add(e);
  return [...s];
}

export function DevWalletAdminClient() {
  const token = useMemo(() => getPortalToken() || '', []);

  const [filterInput, setFilterInput] = useState('');
  const [filterDebounced, setFilterDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setFilterDebounced(filterInput.trim()), 350);
    return () => clearTimeout(t);
  }, [filterInput]);

  const pageCursorsRef = useRef<(string | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [wallets, setWallets] = useState<DevWalletListItem[]>([]);
  const [listBusy, setListBusy] = useState(false);

  const [selected, setSelected] = useState<string>('');
  const [overview, setOverview] = useState<DevWalletOverview | null>(null);
  const [overviewBusy, setOverviewBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const [sendSolToChoice, setSendSolToChoice] = useState('');
  const [sendSolToCustom, setSendSolToCustom] = useState('');
  const [sendSolLamportsChoice, setSendSolLamportsChoice] = useState('1000000');
  const [sendSolLamportsCustom, setSendSolLamportsCustom] = useState('');

  const [sendSplMintChoice, setSendSplMintChoice] = useState('');
  const [sendSplMintCustom, setSendSplMintCustom] = useState('');
  const [sendSplToChoice, setSendSplToChoice] = useState('');
  const [sendSplToCustom, setSendSplToCustom] = useState('');
  const [sendSplAmount, setSendSplAmount] = useState('');
  const [sendSplDecimals, setSendSplDecimals] = useState('9');

  const [burnSplMintChoice, setBurnSplMintChoice] = useState('');
  const [burnSplMintCustom, setBurnSplMintCustom] = useState('');
  const [burnSplAmount, setBurnSplAmount] = useState('');
  const [burnSplDecimals, setBurnSplDecimals] = useState('9');

  const [closeAtaChoice, setCloseAtaChoice] = useState('');
  const [closeAtaCustom, setCloseAtaCustom] = useState('');
  const [closeDestChoice, setCloseDestChoice] = useState('');
  const [closeDestCustom, setCloseDestCustom] = useState('');

  const fetchWalletListPage = useCallback(
    async (p: number, searchQ: string) => {
      if (!token) {
        toast.error('Sign in required', { description: 'Open /account and sign in first.' });
        return;
      }
      setListBusy(true);
      try {
        const cur = pageCursorsRef.current[p] ?? null;
        const res = await devListWallets(token, { limit: PAGE_SIZE, cursor: cur, q: searchQ });
        if (!res.ok) {
          toast.error('Wallet admin unavailable', { description: res.detail });
          return;
        }
        setWallets(res.items || []);
        setTotalCount(res.total_count);
        setNextCursor(res.next_cursor ?? null);
        setPageIndex(p);
        const arr = [...pageCursorsRef.current];
        while (arr.length <= p) arr.push(null);
        arr[p] = cur;
        if (res.next_cursor) arr[p + 1] = res.next_cursor;
        pageCursorsRef.current = arr;
      } catch (e) {
        toast.error('Request failed', { description: String(e) });
      } finally {
        setListBusy(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!token) return;
    pageCursorsRef.current = [null];
    void fetchWalletListPage(0, filterDebounced);
  }, [token, filterDebounced, fetchWalletListPage]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const destPubkeys = useMemo(() => uniqPubkeys(wallets, overview?.pubkey), [wallets, overview?.pubkey]);

  const mintRows = useMemo(
    () => (overview?.token_accounts || []).filter((t) => String(t.mint || '').trim()),
    [overview?.token_accounts],
  );

  const mintOptions = useMemo(() => {
    const m = new Map<string, { mint: string; decimals: number | null }>();
    for (const t of mintRows) {
      const mint = String(t.mint).trim();
      if (!m.has(mint)) m.set(mint, { mint, decimals: t.decimals });
    }
    return [...m.values()];
  }, [mintRows]);

  const tokenAccountOptions = useMemo(
    () =>
      (overview?.token_accounts || []).map((t) => ({
        token_account: t.token_account,
        mint: t.mint,
        label: `${short(t.token_account || '', 12)} · ${t.ui_amount_string ?? (t.ui_amount == null ? '—' : String(t.ui_amount))}`,
      })),
    [overview?.token_accounts],
  );

  useEffect(() => {
    if (!destPubkeys.length) {
      setSendSolToChoice(CUSTOM);
      setSendSplToChoice(CUSTOM);
      setCloseDestChoice(CUSTOM);
      return;
    }
    setSendSolToChoice((c) => (c && (c === CUSTOM || destPubkeys.includes(c)) ? c : destPubkeys[0]!));
    setSendSplToChoice((c) => (c && (c === CUSTOM || destPubkeys.includes(c)) ? c : destPubkeys[0]!));
    setCloseDestChoice((c) => (c && (c === CUSTOM || destPubkeys.includes(c)) ? c : destPubkeys[0]!));
  }, [destPubkeys]);

  useEffect(() => {
    if (!mintOptions.length) {
      setSendSplMintChoice(CUSTOM);
      setBurnSplMintChoice(CUSTOM);
      return;
    }
    setSendSplMintChoice((c) => {
      if (c === CUSTOM) return CUSTOM;
      if (c && mintOptions.some((m) => m.mint === c)) return c;
      return mintOptions[0]!.mint;
    });
    setBurnSplMintChoice((c) => {
      if (c === CUSTOM) return CUSTOM;
      if (c && mintOptions.some((m) => m.mint === c)) return c;
      return mintOptions[0]!.mint;
    });
  }, [mintOptions]);

  useEffect(() => {
    const mint = sendSplMintChoice === CUSTOM ? '' : sendSplMintChoice;
    if (!mint) return;
    const row = mintRows.find((r) => String(r.mint) === mint);
    if (row?.decimals != null) setSendSplDecimals(String(row.decimals));
  }, [sendSplMintChoice, mintRows]);

  useEffect(() => {
    const mint = burnSplMintChoice === CUSTOM ? '' : burnSplMintChoice;
    if (!mint) return;
    const row = mintRows.find((r) => String(r.mint) === mint);
    if (row?.decimals != null) setBurnSplDecimals(String(row.decimals));
  }, [burnSplMintChoice, mintRows]);

  useEffect(() => {
    if (!tokenAccountOptions.length) {
      setCloseAtaChoice(CUSTOM);
      return;
    }
    setCloseAtaChoice((c) => {
      if (c === CUSTOM) return CUSTOM;
      if (c && tokenAccountOptions.some((o) => o.token_account === c)) return c;
      return tokenAccountOptions[0]!.token_account;
    });
  }, [tokenAccountOptions]);

  async function loadOverview(accountId: string) {
    if (!token) return;
    setOverviewBusy(true);
    setOverview(null);
    try {
      const res = await devWalletOverview(token, accountId);
      if (!res.ok) {
        toast.error('Overview failed', { description: res.detail });
        return;
      }
      setOverview(res.overview);
    } catch (e) {
      toast.error('Request failed', { description: String(e) });
    } finally {
      setOverviewBusy(false);
    }
  }

  const refreshOverviewQuiet = useCallback(async () => {
    if (!token || !selected) return;
    try {
      const res = await devWalletOverview(token, selected);
      if (res.ok) setOverview(res.overview);
    } catch {
      /* ignore poll errors */
    }
  }, [token, selected]);

  useEffect(() => {
    if (!selected || !token) return;
    const id = setInterval(() => void refreshOverviewQuiet(), 12000);
    return () => clearInterval(id);
  }, [selected, token, refreshOverviewQuiet]);

  function resolveMint(choice: string, custom: string): string {
    return choice === CUSTOM ? custom.trim() : choice.trim();
  }

  function resolvePubkey(choice: string, custom: string): string {
    return choice === CUSTOM ? custom.trim() : choice.trim();
  }

  function resolveTokenAccount(choice: string, custom: string): string {
    return choice === CUSTOM ? custom.trim() : choice.trim();
  }

  async function onSendSol() {
    if (!token || !selected) return;
    const to = resolvePubkey(sendSolToChoice, sendSolToCustom);
    const lam =
      sendSolLamportsChoice === CUSTOM ? Number(sendSolLamportsCustom.trim()) : Number(sendSolLamportsChoice);
    if (!to || !Number.isFinite(lam) || lam <= 0) {
      toast.error('Missing fields', { description: 'Pick a destination and a valid lamports amount.' });
      return;
    }
    setActionBusy(true);
    try {
      const res = await devTransferSol(token, selected, to, lam);
      if (!res.ok) return toast.error('Send failed', { description: res.detail });
      toast.success('Sent SOL', { description: res.signature ? short(res.signature, 18) : 'OK' });
      await loadOverview(selected);
    } finally {
      setActionBusy(false);
    }
  }

  async function onSendSpl() {
    if (!token || !selected) return;
    const mint = resolveMint(sendSplMintChoice, sendSplMintCustom);
    const toOwner = resolvePubkey(sendSplToChoice, sendSplToCustom);
    const amt = sendSplAmount.trim();
    const dec = Number(sendSplDecimals.trim());
    if (!mint || !toOwner || !amt || !Number.isFinite(dec)) {
      toast.error('Missing fields', { description: 'Mint, destination, amount, and decimals required.' });
      return;
    }
    setActionBusy(true);
    try {
      const res = await devTransferSpl(token, selected, mint, toOwner, amt, dec);
      if (!res.ok) return toast.error('Send failed', { description: res.detail });
      toast.success('Sent SPL', { description: res.signature ? short(res.signature, 18) : 'OK' });
      await loadOverview(selected);
    } finally {
      setActionBusy(false);
    }
  }

  async function onBurnSpl() {
    if (!token || !selected) return;
    const mint = resolveMint(burnSplMintChoice, burnSplMintCustom);
    const amt = burnSplAmount.trim();
    const dec = Number(burnSplDecimals.trim());
    if (!mint || !amt || !Number.isFinite(dec)) {
      toast.error('Missing fields', { description: 'Mint, amount, and decimals required.' });
      return;
    }
    if (!confirm('Burn is irreversible. Continue?')) return;
    setActionBusy(true);
    try {
      const res = await devBurnSpl(token, selected, mint, amt, dec);
      if (!res.ok) return toast.error('Burn failed', { description: res.detail });
      toast.success('Burned SPL', { description: res.signature ? short(res.signature, 18) : 'OK' });
      await loadOverview(selected);
    } finally {
      setActionBusy(false);
    }
  }

  async function onCloseAta() {
    if (!token || !selected) return;
    const ta = resolveTokenAccount(closeAtaChoice, closeAtaCustom);
    const dest = resolvePubkey(closeDestChoice, closeDestCustom);
    if (!ta || !dest) {
      toast.error('Missing fields', { description: 'Token account and destination required.' });
      return;
    }
    if (!confirm('Close token account? This only succeeds if it is empty.')) return;
    setActionBusy(true);
    try {
      const res = await devCloseEmptyAta(token, selected, ta, dest);
      if (!res.ok) return toast.error('Close failed', { description: res.detail });
      toast.success('Closed ATA', { description: res.signature ? short(res.signature, 18) : 'OK' });
      await loadOverview(selected);
    } finally {
      setActionBusy(false);
    }
  }

  const busy = listBusy || overviewBusy || actionBusy;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Wallet admin (dev-only)</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Requires a RootRecord portal session and server dev flag. Intended for rootrecord@outlook.com only.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Wallets</CardTitle>
            <Button variant="outline" size="sm" onClick={() => void fetchWalletListPage(pageIndex, filterDebounced)} disabled={listBusy}>
              Refresh
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="filter">Filter</Label>
              <Input
                id="filter"
                value={filterInput}
                onChange={(e) => setFilterInput(e.target.value)}
                placeholder="account_id, pubkey, email (server-side)"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Page {pageIndex + 1} of {totalPages}
                {totalCount > 0 ? ` · ${totalCount} wallet(s)` : ''}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={listBusy || pageIndex <= 0}
                  onClick={() => void fetchWalletListPage(pageIndex - 1, filterDebounced)}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={listBusy || !nextCursor}
                  onClick={() => void fetchWalletListPage(pageIndex + 1, filterDebounced)}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              {listBusy && !wallets.length ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : wallets.length ? (
                wallets.map((w) => (
                  <Button
                    key={w.account_id}
                    variant={selected === w.account_id ? 'default' : 'outline'}
                    className="h-auto justify-start whitespace-normal rounded-2xl py-3"
                    onClick={() => {
                      setSelected(w.account_id);
                      void loadOverview(w.account_id);
                    }}
                  >
                    <div className="text-left w-full">
                      <div className="font-mono text-xs">{w.account_id}</div>
                      <div className="mt-1 text-xs text-muted-foreground font-mono">
                        {short(w.pubkey, 48)}
                        {w.email ? ` — ${w.email}` : ''}
                      </div>
                    </div>
                  </Button>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No wallets.</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Wallet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selected ? (
              <div className="text-sm text-muted-foreground">Select a wallet.</div>
            ) : overviewBusy && !overview ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : !overview ? (
              <div className="text-sm text-muted-foreground">Could not load overview.</div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">Balances refresh from chain about every 12s while this wallet is selected.</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => void refreshOverviewQuiet()} disabled={actionBusy}>
                    Refresh balances
                  </Button>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Account</div>
                  <div className="font-mono text-xs">{overview.account_id}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Pubkey</div>
                  <div className="font-mono text-xs break-all">{overview.pubkey}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">SOL</div>
                  <div className="font-mono text-xs">{solFromLamports(overview.sol_balance_lamports)}</div>
                </div>

                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <div className="font-semibold">Send SOL</div>
                    <div className="space-y-1">
                      <Label className="text-xs">To</Label>
                      <select
                        className={selectClassName}
                        value={sendSolToChoice}
                        onChange={(e) => setSendSolToChoice(e.target.value)}
                        disabled={busy}
                      >
                        {destPubkeys.map((p) => (
                          <option key={p} value={p}>
                            {short(p, 44)}
                          </option>
                        ))}
                        <option value={CUSTOM}>Custom address…</option>
                      </select>
                    </div>
                    {sendSolToChoice === CUSTOM ? (
                      <Input value={sendSolToCustom} onChange={(e) => setSendSolToCustom(e.target.value)} placeholder="To pubkey (base58)" />
                    ) : null}
                    <div className="space-y-1">
                      <Label className="text-xs">Lamports</Label>
                      <select
                        className={selectClassName}
                        value={sendSolLamportsChoice}
                        onChange={(e) => setSendSolLamportsChoice(e.target.value)}
                        disabled={busy}
                      >
                        <option value="5000">5,000 (0.000005 SOL)</option>
                        <option value="10000">10,000 (0.00001 SOL)</option>
                        <option value="1000000">1,000,000 (0.001 SOL)</option>
                        <option value="10000000">10,000,000 (0.01 SOL)</option>
                        <option value="100000000">100,000,000 (0.1 SOL)</option>
                        <option value={CUSTOM}>Custom…</option>
                      </select>
                    </div>
                    {sendSolLamportsChoice === CUSTOM ? (
                      <Input
                        value={sendSolLamportsCustom}
                        onChange={(e) => setSendSolLamportsCustom(e.target.value)}
                        placeholder="Lamports (integer)"
                      />
                    ) : null}
                    <Button onClick={() => void onSendSol()} disabled={busy}>
                      Send SOL
                    </Button>
                  </div>

                  <div className="grid gap-2">
                    <div className="font-semibold">Send SPL</div>
                    <div className="space-y-1">
                      <Label className="text-xs">Mint</Label>
                      <select
                        className={selectClassName}
                        value={sendSplMintChoice}
                        onChange={(e) => setSendSplMintChoice(e.target.value)}
                        disabled={busy}
                      >
                        {mintOptions.map((m) => (
                          <option key={m.mint} value={m.mint}>
                            {short(m.mint, 36)} {m.decimals != null ? `(dec ${m.decimals})` : ''}
                          </option>
                        ))}
                        <option value={CUSTOM}>Custom mint…</option>
                      </select>
                    </div>
                    {sendSplMintChoice === CUSTOM ? (
                      <Input value={sendSplMintCustom} onChange={(e) => setSendSplMintCustom(e.target.value)} placeholder="Mint (base58)" />
                    ) : null}
                    <div className="space-y-1">
                      <Label className="text-xs">To owner</Label>
                      <select
                        className={selectClassName}
                        value={sendSplToChoice}
                        onChange={(e) => setSendSplToChoice(e.target.value)}
                        disabled={busy}
                      >
                        {destPubkeys.map((p) => (
                          <option key={`spl-${p}`} value={p}>
                            {short(p, 44)}
                          </option>
                        ))}
                        <option value={CUSTOM}>Custom owner…</option>
                      </select>
                    </div>
                    {sendSplToChoice === CUSTOM ? (
                      <Input value={sendSplToCustom} onChange={(e) => setSendSplToCustom(e.target.value)} placeholder="Owner pubkey (base58)" />
                    ) : null}
                    <Input value={sendSplAmount} onChange={(e) => setSendSplAmount(e.target.value)} placeholder="Amount UI (e.g. 1.5)" />
                    <div className="space-y-1">
                      <Label className="text-xs">Decimals</Label>
                      <select
                        className={selectClassName}
                        value={sendSplDecimals}
                        onChange={(e) => setSendSplDecimals(e.target.value)}
                        disabled={busy}
                      >
                        {['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button onClick={() => void onSendSpl()} disabled={busy}>
                      Send SPL
                    </Button>
                  </div>

                  <div className="grid gap-2">
                    <div className="font-semibold">Burn SPL</div>
                    <div className="space-y-1">
                      <Label className="text-xs">Mint</Label>
                      <select
                        className={selectClassName}
                        value={burnSplMintChoice}
                        onChange={(e) => setBurnSplMintChoice(e.target.value)}
                        disabled={busy}
                      >
                        {mintOptions.map((m) => (
                          <option key={`burn-${m.mint}`} value={m.mint}>
                            {short(m.mint, 36)}
                          </option>
                        ))}
                        <option value={CUSTOM}>Custom mint…</option>
                      </select>
                    </div>
                    {burnSplMintChoice === CUSTOM ? (
                      <Input value={burnSplMintCustom} onChange={(e) => setBurnSplMintCustom(e.target.value)} placeholder="Mint (base58)" />
                    ) : null}
                    <Input value={burnSplAmount} onChange={(e) => setBurnSplAmount(e.target.value)} placeholder="Amount UI (e.g. 1)" />
                    <div className="space-y-1">
                      <Label className="text-xs">Decimals</Label>
                      <select
                        className={selectClassName}
                        value={burnSplDecimals}
                        onChange={(e) => setBurnSplDecimals(e.target.value)}
                        disabled={busy}
                      >
                        {['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map((d) => (
                          <option key={`bd-${d}`} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button variant="outline" onClick={() => void onBurnSpl()} disabled={busy}>
                      Burn SPL
                    </Button>
                  </div>

                  <div className="grid gap-2 border-t border-border pt-4">
                    <div className="font-semibold">Close empty ATA</div>
                    <div className="space-y-1">
                      <Label className="text-xs">Token account</Label>
                      <select
                        className={selectClassName}
                        value={closeAtaChoice}
                        onChange={(e) => setCloseAtaChoice(e.target.value)}
                        disabled={busy}
                      >
                        {tokenAccountOptions.map((o) => (
                          <option key={o.token_account} value={o.token_account}>
                            {o.label}
                          </option>
                        ))}
                        <option value={CUSTOM}>Custom token account…</option>
                      </select>
                    </div>
                    {closeAtaChoice === CUSTOM ? (
                      <Input
                        value={closeAtaCustom}
                        onChange={(e) => setCloseAtaCustom(e.target.value)}
                        placeholder="Token account (base58)"
                      />
                    ) : null}
                    <div className="space-y-1">
                      <Label className="text-xs">Rent destination</Label>
                      <select
                        className={selectClassName}
                        value={closeDestChoice}
                        onChange={(e) => setCloseDestChoice(e.target.value)}
                        disabled={busy}
                      >
                        {destPubkeys.map((p) => (
                          <option key={`close-${p}`} value={p}>
                            {short(p, 44)}
                          </option>
                        ))}
                        <option value={CUSTOM}>Custom pubkey…</option>
                      </select>
                    </div>
                    {closeDestChoice === CUSTOM ? (
                      <Input
                        value={closeDestCustom}
                        onChange={(e) => setCloseDestCustom(e.target.value)}
                        placeholder="Destination (base58)"
                      />
                    ) : null}
                    <Button variant="outline" onClick={() => void onCloseAta()} disabled={busy}>
                      Close empty ATA (rent)
                    </Button>
                  </div>
                </div>

                <div className="pt-2">
                  <div className="font-semibold mb-2">Token accounts</div>
                  <div className="grid gap-2">
                    {(overview.token_accounts || []).length ? (
                      overview.token_accounts.map((t) => (
                        <Card key={t.token_account} className="rounded-2xl">
                          <CardContent className="py-4 space-y-2">
                            <div className="text-xs text-muted-foreground">Mint</div>
                            <div className="font-mono text-xs break-all">{t.mint || '—'}</div>
                            <div className="text-xs text-muted-foreground">Token account</div>
                            <div className="font-mono text-xs break-all">{t.token_account}</div>
                            <div className="text-xs text-muted-foreground">Balance</div>
                            <div className="font-mono text-xs">{t.ui_amount_string || (t.ui_amount == null ? '—' : String(t.ui_amount))}</div>
                          </CardContent>
                        </Card>
                      ))
                    ) : (
                      <div className="text-sm text-muted-foreground">No SPL token accounts found.</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
