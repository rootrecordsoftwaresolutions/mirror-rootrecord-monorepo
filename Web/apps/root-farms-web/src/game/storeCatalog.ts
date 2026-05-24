export type ProtectionKind = "gopher" | "mice" | "rabbit" | "birds";

export type StoreToggleKind = ProtectionKind | "lightning_meteorologist" | "cypress_trees";

export type StoreProtectionItem = {
  kind: StoreToggleKind;
  title: string;
  blurb: string;
  feePctLabel: string;
  feePct: number;
  oneTimeCost?: number;
};

export const LIGHTNING_ROD_COST = 1_000_000;

export const STORE_PROTECTIONS: StoreProtectionItem[] = [
  {
    kind: "gopher",
    title: "Gopher protection",
    blurb: "Stops gophers gnawing rows across the unlocked field. −1% income rate.",
    feePctLabel: "−1% income rate",
    feePct: 0.01,
  },
  {
    kind: "mice",
    title: "Field mice protection",
    blurb: "Stops mice destroying row slots across the unlocked field. −1% income rate.",
    feePctLabel: "−1% income rate",
    feePct: 0.01,
  },
  {
    kind: "rabbit",
    title: "Rabbit protection",
    blurb: "Stops rabbits wiping rows across the unlocked field. −3% income rate.",
    feePctLabel: "−3% income rate",
    feePct: 0.03,
  },
  {
    kind: "birds",
    title: "Hire Uncle",
    blurb: "Uncle swats at birds with his cane to keep flocks away from the whole field. −10% income rate.",
    feePctLabel: "−10% income rate",
    feePct: 0.10,
  },
  {
    kind: "lightning_meteorologist",
    title: "Lightning meteorologist",
    blurb: "Grounds shared lightning row strikes across the unlocked field. −1% income rate.",
    feePctLabel: "−1% income rate",
    feePct: 0.01,
  },
  {
    kind: "cypress_trees",
    title: "Cypress windbreak",
    blurb: "Greatly reduces wind crop loss across the unlocked field. −5% income rate (shade).",
    feePctLabel: "−5% income rate",
    feePct: 0.05,
  },
];

export type FarmsStoreData = {
  protections: FarmsProtections;
  lightning_rod_owned: boolean;
  lightning_meteorologist: boolean;
  cypress_trees: boolean;
  root_clusters: boolean[];
};

export type FarmsProtections = {
  gopher: boolean;
  mice: boolean;
  rabbit: boolean;
  birds: boolean;
};

export function defaultFarmsStore(): FarmsStoreData {
  return {
    protections: { gopher: false, mice: false, rabbit: false, birds: false },
    lightning_rod_owned: false,
    lightning_meteorologist: false,
    cypress_trees: false,
    root_clusters: [],
  };
}

export function parseFarmsStoreFromApi(
  protections?: FarmsProtections,
  store?: Partial<FarmsStoreData>,
): FarmsStoreData {
  const base = defaultFarmsStore();
  if (protections) base.protections = { ...base.protections, ...protections };
  if (store) {
    if (store.lightning_rod_owned != null) base.lightning_rod_owned = Boolean(store.lightning_rod_owned);
    if (store.lightning_meteorologist != null) base.lightning_meteorologist = Boolean(store.lightning_meteorologist);
    if (store.cypress_trees != null) base.cypress_trees = Boolean(store.cypress_trees);
    if (Array.isArray(store.root_clusters)) base.root_clusters = store.root_clusters.map(Boolean);
  }
  return base;
}

export function rootClusterIncomeMultiplier(store: FarmsStoreData): number {
  const active = Array.isArray(store.root_clusters) ? store.root_clusters.filter(Boolean).length : 0;
  return 1 + active * 0.05;
}

export function hasActiveFarmhand(store: FarmsStoreData): boolean {
  return Boolean(
    store.protections.gopher ||
      store.protections.mice ||
      store.protections.rabbit ||
      store.protections.birds ||
      store.lightning_meteorologist ||
      store.cypress_trees,
  );
}

export function vegetablesProtected(store: FarmsStoreData): boolean {
  return store.lightning_rod_owned && hasActiveFarmhand(store);
}

/** Multiplier on earnings (1 = full income rate). */
export function protectionIncomeMultiplier(store: FarmsStoreData): number {
  let reduction = 0;
  if (store.protections.gopher) reduction += 0.01;
  if (store.protections.mice) reduction += 0.01;
  if (store.protections.rabbit) reduction += 0.03;
  if (store.protections.birds) reduction += 0.10;
  if (store.lightning_meteorologist) reduction += 0.01;
  if (store.cypress_trees) reduction += 0.05;
  return Math.max(0, 1 - reduction);
}

export type VarmintEvent = {
  id: string;
  kind: string;
  plot_id: number | null;
  message: string;
  created_at: string;
};

export function isAdvisoryEvent(kind: string): boolean {
  return kind.startsWith("advisory_");
}

export function isAttackEvent(kind: string): boolean {
  return !isAdvisoryEvent(kind) && (kind.endsWith("_attack") || kind === "protection_disabled");
}

export function isBlockEvent(kind: string): boolean {
  return kind.endsWith("_blocked");
}
