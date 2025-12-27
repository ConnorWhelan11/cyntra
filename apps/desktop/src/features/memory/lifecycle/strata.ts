export type LifecycleViewMode = "vault" | "lifecycle";

export const LIFECYCLE_LAYERS = [
  { id: "runs", label: "RUNS / INGRESS" },
  { id: "extraction", label: "EXTRACTION" },
  { id: "dedup", label: "DEDUP / VECTOR GATE" },
  { id: "vault", label: "VAULT" },
  { id: "linking", label: "LINKING LOOM" },
  { id: "sleeptime", label: "SLEEPTIME FORGE" },
  { id: "collective", label: "COLLECTIVE SHELF" },
] as const;

export type LifecycleLayerId = (typeof LIFECYCLE_LAYERS)[number]["id"];

export const VAULT_LAYER_ID: LifecycleLayerId = "vault";
export const VAULT_LAYER_INDEX = LIFECYCLE_LAYERS.findIndex((l) => l.id === VAULT_LAYER_ID);

const STRATA_SPACING: Record<LifecycleViewMode, number> = {
  vault: 0.22,
  lifecycle: 1.15,
};

export function getLifecycleStrataSpacing(view: LifecycleViewMode): number {
  return STRATA_SPACING[view];
}

export function getLifecycleLayerY(index: number, view: LifecycleViewMode): number {
  const spacing = getLifecycleStrataSpacing(view);
  return (index - VAULT_LAYER_INDEX) * spacing;
}
