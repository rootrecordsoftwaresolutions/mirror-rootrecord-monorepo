export type ProtectionKind = "gopher" | "mice" | "rabbit";

export type StoreProtectionItem = {
  kind: ProtectionKind;
  title: string;
  blurb: string;
  feePctLabel: string;
  feePct: number;
};

export const STORE_PROTECTIONS: StoreProtectionItem[] = [
  {
    kind: "gopher",
    title: "Gopher protection",
    blurb: "Stops gophers from gnawing a random active row on any plot. Lowers your farm income rate by 1% while on.",
    feePctLabel: "−1% income rate",
    feePct: 0.01,
  },
  {
    kind: "mice",
    title: "Field mice protection",
    blurb: "Stops mice from destroying an entire row (leaves and slot). Lowers your farm income rate by 1% while on.",
    feePctLabel: "−1% income rate",
    feePct: 0.01,
  },
  {
    kind: "rabbit",
    title: "Rabbit protection",
    blurb: "Stops rabbits from wiping every row on a random plot. Lower attack chance, but devastating. Lowers income rate by 3% while on.",
    feePctLabel: "−3% income rate",
    feePct: 0.03,
  },
];

/** Multiplier on earnings (1 = full income rate). */
export function protectionIncomeMultiplier(protections: FarmsProtections): number {
  let reduction = 0;
  if (protections.gopher) reduction += 0.01;
  if (protections.mice) reduction += 0.01;
  if (protections.rabbit) reduction += 0.03;
  return Math.max(0, 1 - reduction);
}

export type VarmintEvent = {
  id: string;
  kind: string;
  plot_id: number | null;
  message: string;
  created_at: string;
};

export type FarmsProtections = {
  gopher: boolean;
  mice: boolean;
  rabbit: boolean;
};

export function isAttackEvent(kind: string): boolean {
  return kind.endsWith("_attack") || kind === "protection_disabled";
}

export function isBlockEvent(kind: string): boolean {
  return kind.endsWith("_blocked");
}
