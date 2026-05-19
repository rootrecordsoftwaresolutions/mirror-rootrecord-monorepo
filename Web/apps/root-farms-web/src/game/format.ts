export function formatRu(n: number): string {
  const v = Math.max(0, Math.floor(n));
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 10_000) return `${(v / 1_000).toFixed(1)}K`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(2)}K`;
  return String(v);
}

export function formatRuRate(n: number): string {
  if (n >= 1000) return `${formatRu(n)}/s`;
  if (n >= 10) return `${Math.round(n)}/s`;
  return `${n.toFixed(1)}/s`;
}

export function formatGrowTime(sec: number): string {
  if (sec < 10) return `${sec.toFixed(2)}s`;
  if (sec < 120) return `${sec.toFixed(1)}s`;
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  if (sec < 86_400) {
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(sec / 86_400);
  const h = Math.round((sec % 86_400) / 3600);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}
