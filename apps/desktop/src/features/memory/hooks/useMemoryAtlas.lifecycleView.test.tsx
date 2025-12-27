import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MemoryItem } from "@/types";
import { MemoryAtlasContext, useMemoryAtlas } from "./useMemoryAtlas";

function Harness({ memories }: { memories: MemoryItem[] }) {
  const ctx = useMemoryAtlas(memories, { layout: "lifecycle" });
  return (
    <MemoryAtlasContext.Provider value={ctx}>
      <div data-testid="view">{ctx.state.lifecycleView}</div>
      <div data-testid="camera-target">{ctx.state.camera.target.join(",")}</div>
      <div data-testid="camera-position">{ctx.state.camera.position.join(",")}</div>
      <button type="button" onClick={() => ctx.actions.selectMemory(memories[0].id)}>
        Select
      </button>
      <button type="button" onClick={() => ctx.actions.setLifecycleView("lifecycle")}>
        Lifecycle
      </button>
    </MemoryAtlasContext.Provider>
  );
}

describe("lifecycle view interactions", () => {
  it("toggles lifecycle view and reframes camera deterministically", async () => {
    const user = userEvent.setup();
    const memories: MemoryItem[] = [
      {
        id: "mem-a",
        type: "pattern",
        agent: "claude",
        scope: "individual",
        importance: 0.9,
        content: "Alpha",
      },
      {
        id: "mem-b",
        type: "failure",
        agent: "codex",
        scope: "collective",
        importance: 0.6,
        content: "Beta",
      },
    ];

    render(<Harness memories={memories} />);

    expect(screen.getByTestId("view").textContent).toBe("vault");
    expect(screen.getByTestId("camera-target").textContent).toBe("0,0,0");
    expect(screen.getByTestId("camera-position").textContent).toBe("0,3.5,10");

    await user.click(screen.getByRole("button", { name: "Select" }));

    const targetAfterSelect = screen.getByTestId("camera-target").textContent;
    expect(targetAfterSelect).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Lifecycle" }));

    expect(screen.getByTestId("view").textContent).toBe("lifecycle");

    const target = screen.getByTestId("camera-target").textContent!.split(",").map(Number);
    const position = screen.getByTestId("camera-position").textContent!.split(",").map(Number);

    expect(position[0]).toBeCloseTo(target[0] + 0);
    expect(position[1]).toBeCloseTo(target[1] + 6.5);
    expect(position[2]).toBeCloseTo(target[2] + 15.5);
  });
});
