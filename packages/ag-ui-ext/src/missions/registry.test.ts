/**
 * Glia Missions v0.1 — Registry Unit Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  registerTool,
  getTool,
  getAllTools,
  hasToolRegistered,
  unregisterTool,
  clearToolRegistry,
  registerLayout,
  getLayout,
  getAllLayouts,
  hasLayoutRegistered,
  unregisterLayout,
  clearLayoutRegistry,
  registerTools,
  registerLayouts,
  TOOL_IDS,
} from "./registry";
import type { MissionTool, MissionLayoutPreset } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const mockTool: MissionTool = {
  id: "test.tool",
  title: "Test Tool",
  description: "A test tool",
  Panel: () => null,
};

const mockTool2: MissionTool = {
  id: "test.tool2",
  title: "Test Tool 2",
  Panel: () => null,
};

const mockLayout: MissionLayoutPreset = {
  id: "FocusSplit",
  title: "Focus Split",
  description: "Test layout",
  Component: () => null,
};

const mockLayout2: MissionLayoutPreset = {
  id: "TabsWorkspace",
  title: "Tabs Workspace",
  Component: () => null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Tool Registry
// ─────────────────────────────────────────────────────────────────────────────

describe("Tool Registry", () => {
  beforeEach(() => {
    clearToolRegistry();
  });

  describe("registerTool", () => {
    it("registers a tool", () => {
      registerTool(mockTool);
      expect(getTool(mockTool.id)).toBe(mockTool);
    });

    it("overwrites existing tool with same id", () => {
      registerTool(mockTool);
      const updatedTool = { ...mockTool, title: "Updated Title" };
      registerTool(updatedTool);
      expect(getTool(mockTool.id)?.title).toBe("Updated Title");
    });
  });

  describe("getTool", () => {
    it("returns undefined for unregistered tool", () => {
      expect(getTool("nonexistent")).toBeUndefined();
    });

    it("returns registered tool", () => {
      registerTool(mockTool);
      expect(getTool(mockTool.id)).toBe(mockTool);
    });
  });

  describe("getAllTools", () => {
    it("returns empty array when no tools registered", () => {
      expect(getAllTools()).toEqual([]);
    });

    it("returns all registered tools", () => {
      registerTool(mockTool);
      registerTool(mockTool2);
      const tools = getAllTools();
      expect(tools).toHaveLength(2);
      expect(tools).toContain(mockTool);
      expect(tools).toContain(mockTool2);
    });
  });

  describe("hasToolRegistered", () => {
    it("returns false for unregistered tool", () => {
      expect(hasToolRegistered("nonexistent")).toBe(false);
    });

    it("returns true for registered tool", () => {
      registerTool(mockTool);
      expect(hasToolRegistered(mockTool.id)).toBe(true);
    });
  });

  describe("unregisterTool", () => {
    it("returns false for unregistered tool", () => {
      expect(unregisterTool("nonexistent")).toBe(false);
    });

    it("removes and returns true for registered tool", () => {
      registerTool(mockTool);
      expect(unregisterTool(mockTool.id)).toBe(true);
      expect(getTool(mockTool.id)).toBeUndefined();
    });
  });

  describe("clearToolRegistry", () => {
    it("removes all tools", () => {
      registerTool(mockTool);
      registerTool(mockTool2);
      clearToolRegistry();
      expect(getAllTools()).toEqual([]);
    });
  });

  describe("registerTools", () => {
    it("registers multiple tools at once", () => {
      registerTools([mockTool, mockTool2]);
      expect(getAllTools()).toHaveLength(2);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Layout Registry
// ─────────────────────────────────────────────────────────────────────────────

describe("Layout Registry", () => {
  beforeEach(() => {
    clearLayoutRegistry();
  });

  describe("registerLayout", () => {
    it("registers a layout", () => {
      registerLayout(mockLayout);
      expect(getLayout(mockLayout.id)).toBe(mockLayout);
    });

    it("overwrites existing layout with same id", () => {
      registerLayout(mockLayout);
      const updatedLayout = { ...mockLayout, title: "Updated Title" };
      registerLayout(updatedLayout);
      expect(getLayout(mockLayout.id)?.title).toBe("Updated Title");
    });
  });

  describe("getLayout", () => {
    it("returns undefined for unregistered layout", () => {
      expect(getLayout("ExternalSidecar")).toBeUndefined();
    });

    it("returns registered layout", () => {
      registerLayout(mockLayout);
      expect(getLayout(mockLayout.id)).toBe(mockLayout);
    });
  });

  describe("getAllLayouts", () => {
    it("returns empty array when no layouts registered", () => {
      expect(getAllLayouts()).toEqual([]);
    });

    it("returns all registered layouts", () => {
      registerLayout(mockLayout);
      registerLayout(mockLayout2);
      const layouts = getAllLayouts();
      expect(layouts).toHaveLength(2);
      expect(layouts).toContain(mockLayout);
      expect(layouts).toContain(mockLayout2);
    });
  });

  describe("hasLayoutRegistered", () => {
    it("returns false for unregistered layout", () => {
      expect(hasLayoutRegistered("ExternalSidecar")).toBe(false);
    });

    it("returns true for registered layout", () => {
      registerLayout(mockLayout);
      expect(hasLayoutRegistered(mockLayout.id)).toBe(true);
    });
  });

  describe("unregisterLayout", () => {
    it("returns false for unregistered layout", () => {
      expect(unregisterLayout("ExternalSidecar")).toBe(false);
    });

    it("removes and returns true for registered layout", () => {
      registerLayout(mockLayout);
      expect(unregisterLayout(mockLayout.id)).toBe(true);
      expect(getLayout(mockLayout.id)).toBeUndefined();
    });
  });

  describe("clearLayoutRegistry", () => {
    it("removes all layouts", () => {
      registerLayout(mockLayout);
      registerLayout(mockLayout2);
      clearLayoutRegistry();
      expect(getAllLayouts()).toEqual([]);
    });
  });

  describe("registerLayouts", () => {
    it("registers multiple layouts at once", () => {
      registerLayouts([mockLayout, mockLayout2]);
      expect(getAllLayouts()).toHaveLength(2);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Constants
// ─────────────────────────────────────────────────────────────────────────────

describe("TOOL_IDS", () => {
  it("has expected tool IDs", () => {
    expect(TOOL_IDS.NOTES).toBe("glia.notes");
    expect(TOOL_IDS.DRAWBOARD).toBe("glia.drawboard");
    expect(TOOL_IDS.PRACTICE_QUESTION).toBe("glia.practiceQuestion");
    expect(TOOL_IDS.COMMS).toBe("glia.comms");
    expect(TOOL_IDS.STUDY_TIMELINE).toBe("glia.studyTimeline");
    expect(TOOL_IDS.TUTOR).toBe("glia.tutor");
  });
});
