import { describe, expect, it } from "vitest";
import { getGlowForImportance, getScopeStyle, getSigilForType } from "./mappings";

describe("lifecycle mappings", () => {
  it("maps type → sigil deterministically", () => {
    expect(getSigilForType("pattern")).toBe("diamond");
    expect(getSigilForType("failure")).toBe("tetra");
    expect(getSigilForType("dynamic")).toBe("ring");
    expect(getSigilForType("context")).toBe("slab");
    expect(getSigilForType("playbook")).toBe("pill");
    expect(getSigilForType("frontier")).toBe("poly");
  });

  it("maps importance → glow (clamped)", () => {
    expect(getGlowForImportance(-1)).toBeCloseTo(getGlowForImportance(0));
    expect(getGlowForImportance(2)).toBeCloseTo(getGlowForImportance(1));
    expect(getGlowForImportance(0.8)).toBeGreaterThan(getGlowForImportance(0.2));
  });

  it("maps scope → style", () => {
    expect(getScopeStyle("individual")).toEqual({ elevation: 0, crowned: false });
    const collective = getScopeStyle("collective");
    expect(collective.elevation).toBeGreaterThan(0);
    expect(collective.crowned).toBe(true);
  });
});

