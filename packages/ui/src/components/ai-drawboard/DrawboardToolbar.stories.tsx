import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { DrawboardToolbar } from "./DrawboardToolbar";

const meta: Meta<typeof DrawboardToolbar> = {
  title: "AI Drawboard/DrawboardToolbar",
  component: DrawboardToolbar,
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => {
    const [tool, setTool] = useState("select");
    return (
      <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
        <DrawboardToolbar
          activeTool={tool}
          onToolChange={setTool}
          onUndo={() => console.info("[story] undo")}
          onRedo={() => console.info("[story] redo")}
          onZoomIn={() => console.info("[story] zoom in")}
          onZoomOut={() => console.info("[story] zoom out")}
          onResetView={() => console.info("[story] reset view")}
        />
      </div>
    );
  },
};

export const WithAgentButton: Story = {
  render: () => {
    const [tool, setTool] = useState("select");
    return (
      <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
        <DrawboardToolbar
          activeTool={tool}
          onToolChange={setTool}
          onUndo={() => console.info("[story] undo")}
          onRedo={() => console.info("[story] redo")}
          onZoomIn={() => console.info("[story] zoom in")}
          onZoomOut={() => console.info("[story] zoom out")}
          onResetView={() => console.info("[story] reset view")}
          onMagic={() => console.info("[story] agent assist")}
        />
      </div>
    );
  },
};

