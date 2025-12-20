import { describe, expect, it } from "vitest";

import { sanitizeGliaWorkspaceState } from "./schema";

describe("agui/schema", () => {
  it("drops unknown panel kinds", () => {
    const workspace = sanitizeGliaWorkspaceState({
      schemaVersion: 1,
      panels: [
        {
          id: "evil_1",
          kind: "evil_component",
          slot: "primary",
          props: { html: "<script>alert(1)</script>" },
        },
      ],
      toasts: [],
    });

    expect(workspace).not.toBeNull();
    expect(workspace?.panels).toHaveLength(0);
  });

  it("accepts objective_stepper and toast actions", () => {
    const workspace = sanitizeGliaWorkspaceState({
      schemaVersion: 1,
      panels: [
        {
          id: "objectives_1",
          kind: "objective_stepper",
          slot: "secondary",
          title: "Objectives",
          props: {
            steps: [
              { id: "s1", title: "Warmup", status: "done" },
              { id: "s2", title: "Deep work", status: "doing" },
            ],
            activeId: "s2",
            showCounts: true,
          },
        },
      ],
      toasts: [
        {
          id: "toast_1",
          kind: "info",
          message: "Open the drawboard",
          ttlMs: 5000,
          action: { label: "Open", action: "open_tool", targetId: "glia.drawboard" },
        },
      ],
    });

    expect(workspace).not.toBeNull();
    expect(workspace?.panels[0]?.kind).toBe("objective_stepper");
    expect(workspace?.toasts[0]?.action?.action).toBe("open_tool");
  });
});

