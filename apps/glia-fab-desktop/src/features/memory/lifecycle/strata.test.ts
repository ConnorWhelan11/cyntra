import { describe, expect, it } from "vitest";
import { VAULT_LAYER_INDEX, getLifecycleLayerY, getLifecycleStrataSpacing } from "./strata";

describe("lifecycle strata layout", () => {
  it("anchors vault layer at y=0 in all views", () => {
    expect(getLifecycleLayerY(VAULT_LAYER_INDEX, "vault")).toBe(0);
    expect(getLifecycleLayerY(VAULT_LAYER_INDEX, "lifecycle")).toBe(0);
  });

  it("uses wider spacing in lifecycle view than vault view", () => {
    const vaultSpacing = getLifecycleStrataSpacing("vault");
    const lifecycleSpacing = getLifecycleStrataSpacing("lifecycle");
    expect(lifecycleSpacing).toBeGreaterThan(vaultSpacing);

    expect(getLifecycleLayerY(VAULT_LAYER_INDEX + 1, "vault")).toBe(vaultSpacing);
    expect(getLifecycleLayerY(VAULT_LAYER_INDEX + 1, "lifecycle")).toBe(lifecycleSpacing);
  });
});

