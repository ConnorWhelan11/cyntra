import type { Meta, StoryObj } from "@storybook/react-vite";
import { CheckpointModal } from "./CheckpointModal";
import { MissionRuntimeProvider } from "../../../../missions/provider";
import { MasterOrganicChemistry } from "../../../../fixtures/missions/definitions";
import { setupMissionSystem } from "../../setup";
import React from "react";

setupMissionSystem();

const meta: Meta<typeof CheckpointModal> = {
  title: "Missions/Widgets/CheckpointModal",
  component: CheckpointModal,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: "Mid-mission checkpoint modal for self-assessment and reflection.",
      },
    },
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

// Custom wrapper that triggers a checkpoint
function CheckpointWrapper() {
  return (
    <MissionRuntimeProvider
      initialDefinition={MasterOrganicChemistry}
      enableTimer={false}
    >
      <CheckpointModalDemo />
    </MissionRuntimeProvider>
  );
}

function CheckpointModalDemo() {
  const [showModal, setShowModal] = React.useState(true);
  
  // Simulate checkpoint being triggered
  return (
    <div className="h-screen bg-background p-8">
      <p className="text-center text-muted-foreground mb-4">
        The checkpoint modal appears during missions at scheduled intervals.
      </p>
      <button
        onClick={() => setShowModal(true)}
        className="mx-auto block px-4 py-2 rounded-lg bg-amber-400/20 text-amber-400 hover:bg-amber-400/30"
      >
        Show Checkpoint Modal
      </button>
      
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-400/30 bg-card/95 shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-amber-400/20 to-amber-400/5 px-6 py-4 border-b border-amber-400/20">
              <h3 className="text-lg font-semibold">Checkpoint</h3>
              <p className="text-sm text-muted-foreground">Midpoint checkpoint</p>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm">Take a moment to assess your progress. How are you feeling?</p>
              <div className="flex gap-2">
                {["Behind", "On track", "Ahead"].map((option) => (
                  <button
                    key={option}
                    className="flex-1 rounded-lg border border-border/40 bg-card/40 px-3 py-2 text-sm hover:border-amber-400/40"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end px-6 py-4 border-t border-border/40">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg bg-cyan-neon/20 text-cyan-neon hover:bg-cyan-neon/30"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const Default: Story = {
  render: () => <CheckpointWrapper />,
};

