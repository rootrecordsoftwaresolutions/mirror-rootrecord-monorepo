import { useEffect, useMemo, useState } from "react";
import { useGame } from "../contexts/GameContext";
import { formatRu } from "../game/format";
import {
  fetchDiceMarket,
  postDiceJoin,
  postDiceRequest,
  postMarketHiLoPlay,
  postMarketDonation,
  postMarketRouletteSpin,
  postMarketWheelSpin,
  type DiceMarketRequest,
} from "../lib/farmsApi";

const ATOMIC_PER_ROOT = 100_000_000;
const MIN_DICE_STAKE = 100_000;
const MAX_DICE_STAKE = 100_000_000;
const MARKET_GAME_MIN_STAKE = 100_000;
const MARKET_GAME_MAX_STAKE = 100_000_000;
const WHEEL_SPIN_COST = 100_000;
const ROULETTE_NUMBERS = Array.from({ length: 37 }, (_, i) => i);
const WHEEL_SEGMENTS = [
  ...Array.from({ length: 52 }, () => ({ label: "0.0001", className: "wheel-segment--common" })),
  ...Array.from({ length: 18 }, () => ({ label: "0.0005", className: "wheel-segment--small" })),
  ...Array.from({ length: 14 }, () => ({ label: "0.001", className: "wheel-segment--break-even" })),
  ...Array.from({ length: 10 }, () => ({ label: "0.0015", className: "wheel-segment--small-win" })),
  ...Array.from({ length: 4 }, () => ({ label: "0.0025", className: "wheel-segment--rare" })),
  { label: "0.01", className: "wheel-segment--rare" },
  { label: "1", className: "wheel-segment--jackpot" },
];

function parseRootsAmount(raw: string): number {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d{0,8})?$/.test(trimmed)) return 0;
  const [whole, frac = ""] = trimmed.split(".");
  const wholeAtomic = Number(whole) * ATOMIC_PER_ROOT;
  const fracAtomic = Number((frac + "00000000").slice(0, 8));
  const total = wholeAtomic + fracAtomic;
  return Number.isFinite(total) ? Math.floor(total) : 0;
}

function formatDate(raw: string | null): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatSignedRu(n: number): string {
  if (n === 0) return formatRu(0);
  const sign = n > 0 ? "+" : "-";
  return `${sign}${formatRu(Math.abs(n))}`;
}

function resultLabel(req: DiceMarketRequest): string {
  if (req.status === "open") return "Open";
  if (req.status === "tie") return "Tie, both stakes refunded";
  return req.winner_label ? `${req.winner_label} won` : "Resolved";
}

export function MarketScreen() {
  const { rootLevel, balanceReady, spendableBalance, refreshServerBalance, handleInsufficientFunds } = useGame();
  const [stakeInput, setStakeInput] = useState("0.001");
  const [donationInput, setDonationInput] = useState("0.001");
  const [rouletteStakeInput, setRouletteStakeInput] = useState("0.001");
  const [rouletteBet, setRouletteBet] = useState("red");
  const [rouletteNumber, setRouletteNumber] = useState("7");
  const [rouletteNote, setRouletteNote] = useState("");
  const [hiLoStakeInput, setHiLoStakeInput] = useState("0.001");
  const [hiLoGuess, setHiLoGuess] = useState<"high" | "low">("high");
  const [hiLoNote, setHiLoNote] = useState("");
  const [requests, setRequests] = useState<DiceMarketRequest[]>([]);
  const [note, setNote] = useState("");
  const [wheelNote, setWheelNote] = useState("");
  const [wheelRotation, setWheelRotation] = useState(0);
  const [wheelPrize, setWheelPrize] = useState("");
  const [wheelSpinning, setWheelSpinning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const stakeAtomic = useMemo(() => parseRootsAmount(stakeInput), [stakeInput]);
  const donationAtomic = useMemo(() => parseRootsAmount(donationInput), [donationInput]);
  const rouletteStakeAtomic = useMemo(() => parseRootsAmount(rouletteStakeInput), [rouletteStakeInput]);
  const hiLoStakeAtomic = useMemo(() => parseRootsAmount(hiLoStakeInput), [hiLoStakeInput]);
  const stakeValid = stakeAtomic >= MIN_DICE_STAKE && stakeAtomic <= MAX_DICE_STAKE;
  const donationValid = donationAtomic > 0;
  const rouletteStakeValid = rouletteStakeAtomic >= MARKET_GAME_MIN_STAKE && rouletteStakeAtomic <= MARKET_GAME_MAX_STAKE;
  const hiLoStakeValid = hiLoStakeAtomic >= MARKET_GAME_MIN_STAKE && hiLoStakeAtomic <= MARKET_GAME_MAX_STAKE;
  const mintLevelReady = rootLevel >= 30;

  const load = async () => {
    setLoading(true);
    const data = await fetchDiceMarket();
    if (data) {
      setRequests(data.requests);
      setNote(data.detail || "");
    } else {
      setNote("Could not load The Well. Try again after reconnecting.");
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const applyMarketResponse = async (data: Awaited<ReturnType<typeof postDiceRequest>>) => {
    if (!data) {
      setNote("The Well action failed. Try again after reconnecting.");
      return;
    }
    setRequests(data.requests);
    setNote(data.detail || "The Well updated.");
    await refreshServerBalance();
    if (data.detail?.toLowerCase().includes("insufficient")) {
      await handleInsufficientFunds();
    }
  };

  const createRequest = async () => {
    if (!stakeValid || busy) return;
    setBusy(true);
    try {
      await applyMarketResponse(await postDiceRequest(stakeAtomic));
    } finally {
      setBusy(false);
    }
  };

  const joinRequest = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await applyMarketResponse(await postDiceJoin(id));
    } finally {
      setBusy(false);
    }
  };

  const donateToFarmers = async () => {
    if (!donationValid || busy) return;
    const ok = window.confirm(`Donate ${formatRu(donationAtomic)} split equally across all other Root Farms players?`);
    if (!ok) return;
    setBusy(true);
    try {
      await applyMarketResponse(await postMarketDonation(donationAtomic));
    } finally {
      setBusy(false);
    }
  };

  const spinWheel = async () => {
    if (busy || wheelSpinning) return;
    setBusy(true);
    setWheelSpinning(true);
    setWheelNote("");
    setWheelPrize("");
    try {
      const result = await postMarketWheelSpin();
      if (!result) {
        setWheelNote("Wheel spin failed. Try again after reconnecting.");
        return;
      }
      if (result.detail) {
        setWheelNote(result.detail);
        if (result.detail.toLowerCase().includes("insufficient")) await handleInsufficientFunds();
        return;
      }
      const targetRotation = 360 - (result.visual_index * 360) / WHEEL_SEGMENTS.length;
      setWheelRotation((current) => current + 1440 + targetRotation);
      setWheelPrize(result.label || formatRu(result.prize));
      setWheelNote(`Cost ${formatRu(result.cost)} · prize ${formatRu(result.prize)} · net ${formatSignedRu(result.net)}`);
      await refreshServerBalance();
    } finally {
      window.setTimeout(() => setWheelSpinning(false), 1700);
      setBusy(false);
    }
  };

  const playRoulette = async () => {
    if (!rouletteStakeValid || busy) return;
    setBusy(true);
    setRouletteNote("");
    try {
      const result = await postMarketRouletteSpin(
        rouletteStakeAtomic,
        rouletteBet,
        rouletteBet === "straight" ? Math.max(0, Math.min(36, Math.floor(Number(rouletteNumber) || 0))) : undefined,
      );
      if (!result) {
        setRouletteNote("Roulette failed. Try again after reconnecting.");
        return;
      }
      if (result.detail) {
        setRouletteNote(result.detail);
        if (result.detail.toLowerCase().includes("insufficient")) await handleInsufficientFunds();
        return;
      }
      const outcome = `${result.outcome_number} ${result.outcome_color}`;
      setRouletteNote(
        `${result.won ? "Won" : "Lost"} on ${outcome}. Payout ${formatRu(result.payout)} · net ${formatSignedRu(result.net)}`,
      );
      await refreshServerBalance();
    } finally {
      setBusy(false);
    }
  };

  const playHiLo = async () => {
    if (!hiLoStakeValid || busy) return;
    setBusy(true);
    setHiLoNote("");
    try {
      const result = await postMarketHiLoPlay(hiLoStakeAtomic, hiLoGuess);
      if (!result) {
        setHiLoNote("Hi-Lo failed. Try again after reconnecting.");
        return;
      }
      if (result.detail) {
        setHiLoNote(result.detail);
        if (result.detail.toLowerCase().includes("insufficient")) await handleInsufficientFunds();
        return;
      }
      const outcome = result.tie ? "Push" : result.won ? "Won" : "Lost";
      setHiLoNote(
        `${outcome}: ${result.first_label} → ${result.next_label}. Payout ${formatRu(result.payout)} · net ${formatSignedRu(result.net)}`,
      );
      await refreshServerBalance();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen market-screen">
      <header className="screen-header">
        <h1>The Well</h1>
        <p className="screen-lead">
          Gather around The Well to post ROOTS dice requests, spin the wheel, play roulette, try Hi-Lo, or donate to
          other farmers.
        </p>
      </header>

      <section className="market-panel market-panel--dice">
        <div className="market-panel-head">
          <div>
            <h2>Dice requests</h2>
            <p>Minimum stake 0.001 ROOTS. Maximum stake 1 ROOTS.</p>
          </div>
          <div className="market-balance">
            <span>Available</span>
            <strong>{balanceReady ? formatRu(spendableBalance) : "Loading..."}</strong>
          </div>
        </div>

        <div className="dice-create-row">
          <label className="dice-stake-field">
            Stake
            <input
              value={stakeInput}
              inputMode="decimal"
              placeholder="0.001"
              onChange={(e) => setStakeInput(e.target.value)}
            />
          </label>
          <button type="button" className="btn btn-primary" disabled={busy || !stakeValid} onClick={() => void createRequest()}>
            {busy ? "Posting..." : `Post dice request (${stakeValid ? formatRu(stakeAtomic) : "invalid"})`}
          </button>
        </div>
        {!stakeValid ? <p className="market-note market-note--warn">Enter 0.001 to 1 ROOTS.</p> : null}
        {note ? <p className="market-note">{note}</p> : null}
      </section>

      <section className="market-panel market-panel--wheel">
        <div className="market-panel-head">
          <div>
            <h2>Spin the wheel</h2>
            <p>
              Costs {formatRu(WHEEL_SPIN_COST)} per spin. The wheel has 100 visual pegs, about 30% break-even or better,
              and a rare 1 ROOT jackpot.
            </p>
          </div>
          <span className="market-lock-badge">100 pegs</span>
        </div>
        <div className="wheel-layout">
          <div className="market-wheel-wrap">
            <div className="market-wheel-pointer" aria-hidden />
            <div className="market-wheel" style={{ transform: `rotate(${wheelRotation}deg)` }}>
              {WHEEL_SEGMENTS.map((segment, i) => (
                <span
                  key={i}
                  className={`wheel-segment ${segment.className}`}
                  style={{ transform: `rotate(${(i * 360) / WHEEL_SEGMENTS.length}deg) translateY(-8.25rem)` }}
                >
                  {segment.label}
                </span>
              ))}
            </div>
            <div className="market-wheel-center">ROOTS</div>
          </div>
          <div className="wheel-actions">
            <p className="market-note">
              Long-run return is about 93%, so The Well still has a small house edge while the spin can actually pay.
            </p>
            <button type="button" className="btn btn-primary" disabled={busy || wheelSpinning} onClick={() => void spinWheel()}>
              {wheelSpinning ? "Spinning..." : `Spin for ${formatRu(WHEEL_SPIN_COST)}`}
            </button>
            {wheelPrize ? <p className="wheel-prize">Landed on {wheelPrize}</p> : null}
            {wheelNote ? <p className="market-note">{wheelNote}</p> : null}
          </div>
        </div>
      </section>

      <div className="market-game-grid">
        <section className="market-panel market-panel--roulette">
          <div className="market-panel-head">
            <div>
              <h2>Roulette table</h2>
              <p>
                Bet 0.001 to 1 ROOTS. Red/black, odd/even, and low/high pay 2x. Zero and straight numbers pay 36x.
              </p>
            </div>
            <span className="market-lock-badge">0-36</span>
          </div>
          <div className="dice-create-row">
            <label className="dice-stake-field">
              Stake
              <input
                value={rouletteStakeInput}
                inputMode="decimal"
                placeholder="0.001"
                onChange={(e) => setRouletteStakeInput(e.target.value)}
              />
            </label>
            <label className="dice-stake-field">
              Bet
              <select value={rouletteBet} onChange={(e) => setRouletteBet(e.target.value)}>
                <option value="red">Red</option>
                <option value="black">Black</option>
                <option value="green">Zero</option>
                <option value="odd">Odd</option>
                <option value="even">Even</option>
                <option value="low">Low 1-18</option>
                <option value="high">High 19-36</option>
                <option value="straight">Straight number</option>
              </select>
            </label>
            {rouletteBet === "straight" ? (
              <label className="dice-stake-field dice-stake-field--small">
                Number
                <select value={rouletteNumber} onChange={(e) => setRouletteNumber(e.target.value)}>
                  {ROULETTE_NUMBERS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button type="button" className="btn btn-primary" disabled={busy || !rouletteStakeValid} onClick={() => void playRoulette()}>
              {busy ? "Spinning..." : `Play roulette (${rouletteStakeValid ? formatRu(rouletteStakeAtomic) : "invalid"})`}
            </button>
          </div>
          {!rouletteStakeValid ? <p className="market-note market-note--warn">Enter 0.001 to 1 ROOTS.</p> : null}
          {rouletteNote ? <p className="market-result">{rouletteNote}</p> : null}
        </section>

        <section className="market-panel market-panel--hilo">
          <div className="market-panel-head">
            <div>
              <h2>Hi-Lo</h2>
              <p>
                Guess if the next card is higher or lower. Wins pay 1.95x, ties push and refund the stake.
              </p>
            </div>
            <span className="market-lock-badge">A-K</span>
          </div>
          <div className="dice-create-row">
            <label className="dice-stake-field">
              Stake
              <input
                value={hiLoStakeInput}
                inputMode="decimal"
                placeholder="0.001"
                onChange={(e) => setHiLoStakeInput(e.target.value)}
              />
            </label>
            <label className="dice-stake-field">
              Guess
              <select value={hiLoGuess} onChange={(e) => setHiLoGuess(e.target.value === "low" ? "low" : "high")}>
                <option value="high">Higher</option>
                <option value="low">Lower</option>
              </select>
            </label>
            <button type="button" className="btn btn-primary" disabled={busy || !hiLoStakeValid} onClick={() => void playHiLo()}>
              {busy ? "Drawing..." : `Play Hi-Lo (${hiLoStakeValid ? formatRu(hiLoStakeAtomic) : "invalid"})`}
            </button>
          </div>
          {!hiLoStakeValid ? <p className="market-note market-note--warn">Enter 0.001 to 1 ROOTS.</p> : null}
          {hiLoNote ? <p className="market-result">{hiLoNote}</p> : null}
        </section>
      </div>

      <section className="market-panel market-panel--donate">
        <div className="market-panel-head">
          <div>
            <h2>Community donation</h2>
            <p>
              Donate internal ROOTS to The Well. The amount is split evenly across every other signed-in Root
              Farms account.
            </p>
          </div>
        </div>
        <div className="dice-create-row">
          <label className="dice-stake-field">
            Donation amount
            <input
              value={donationInput}
              inputMode="decimal"
              placeholder="0.001"
              onChange={(e) => setDonationInput(e.target.value)}
            />
          </label>
          <button type="button" className="btn btn-primary" disabled={busy || !donationValid} onClick={() => void donateToFarmers()}>
            {busy ? "Donating..." : `Donate to everyone (${donationValid ? formatRu(donationAtomic) : "invalid"})`}
          </button>
        </div>
      </section>

      <section className="market-section">
        <div className="section-head">
          <span>Dice board</span>
          <button type="button" className="btn btn-ghost btn-sm" disabled={loading || busy} onClick={() => void load()}>
            Refresh
          </button>
        </div>
        {loading ? (
          <p className="market-note">Loading The Well...</p>
        ) : requests.length === 0 ? (
          <article className="plot-card market-empty-card">
            <p className="plot-sub">No dice requests yet. Post the first one.</p>
          </article>
        ) : (
          <div className="market-dice-grid">
            {requests.map((req) => (
              <article key={req.id} className={`plot-card market-dice-card${req.status === "open" ? " market-dice-card--open" : ""}`}>
                <div className="plot-card-top">
                  <div className="plot-card-main">
                    <span className="plot-name">
                      {formatRu(req.stake)} dice request
                      {req.status === "open" ? <span className="plot-dot" aria-label="open" /> : null}
                    </span>
                    <span className="plot-sub plot-sub--sci">{req.creator_label}</span>
                    <span className="plot-sub">{formatDate(req.created_at)}</span>
                  </div>
                  <span className="plot-yield">
                    {req.status === "open" ? "D6" : `${req.creator_roll ?? "-"}-${req.joiner_roll ?? "-"}`}
                    <small>{req.status === "open" ? "open" : "rolls"}</small>
                  </span>
                </div>
                <p className={`market-result${req.status === "open" ? "" : " market-result--done"}`}>{resultLabel(req)}</p>
                {req.joiner_label ? <p className="plot-sub">Joined by {req.joiner_label}</p> : null}
                {req.status === "open" && req.can_join ? (
                  <button type="button" className="btn btn-primary btn-sm market-join-btn" disabled={busy} onClick={() => void joinRequest(req.id)}>
                    Join for {formatRu(req.stake)}
                  </button>
                ) : req.status === "open" && req.is_mine ? (
                  <p className="market-note">Waiting for another farmer to join.</p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={`market-panel market-panel--mint${mintLevelReady ? "" : " market-panel--locked"}`}>
        <div className="market-panel-head">
          <div>
            <h2>Mint Machine</h2>
            <p>
              Coming soon for farm level 30. Combined root and vegetable plots plus row counts all contribute to this
              level.
            </p>
          </div>
          <span className="market-lock-badge">{mintLevelReady ? "Level 30 ready" : `Level ${rootLevel}/30`}</span>
        </div>
      </section>
    </div>
  );
}
