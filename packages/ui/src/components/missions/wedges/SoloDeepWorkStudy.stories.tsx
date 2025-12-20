import type { Meta, StoryObj } from "@storybook/react-vite";
import { MissionShell } from "../MissionShell";
import { MissionRuntimeProvider, useMissionRuntime } from "../../../missions/provider";
import { MasterOrganicChemistry } from "../../../fixtures/missions/definitions";
import { setupMissionSystem } from "../setup";
import { ObjectiveStepper, FocusTimer, ProgressBar } from "../widgets";
import React, { useEffect } from "react";

setupMissionSystem();

const meta: Meta = {
  title: "Missions/Wedges/SoloDeepWorkStudy",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "End-to-end Solo Deep Work Study mission (Wedge A). Features FocusSplit layout with notes + practice questions.",
      },
    },
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj;

// Auto-start wrapper
function AutoStartMission({ children }: { children: React.ReactNode }) {
  const { startMission, state } = useMissionRuntime();
  
  useEffect(() => {
    // Auto-start after a brief delay
    const timer = setTimeout(() => {
      if (state?.status === "idle") {
        startMission();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [startMission, state?.status]);
  
  return <>{children}</>;
}

function WidgetsPanel() {
  return (
    <div className="space-y-4">
      <ObjectiveStepper compact />
      <FocusTimer size="sm" />
      <ProgressBar />
    </div>
  );
}

export const Default: Story = {
  render: () => (
    <MissionRuntimeProvider
      initialDefinition={MasterOrganicChemistry}
      enableTimer={true}
      timerInterval={1000}
    >
      <AutoStartMission>
        <div className="h-screen bg-background">
          <MissionShell
            showDevPanel={true}
            customWidgets={<WidgetsPanel />}
          />
        </div>
      </AutoStartMission>
    </MissionRuntimeProvider>
  ),
};

export const IdleState: Story = {
  render: () => (
    <MissionRuntimeProvider
      initialDefinition={MasterOrganicChemistry}
      enableTimer={false}
    >
      <div className="h-screen bg-background">
        <MissionShell
          showDevPanel={false}
          customWidgets={<WidgetsPanel />}
        />
      </div>
    </MissionRuntimeProvider>
  ),
};

export const WithTimerRunning: Story = {
  render: () => (
    <MissionRuntimeProvider
      initialDefinition={MasterOrganicChemistry}
      enableTimer={true}
      timerInterval={100} // Fast timer for demo
    >
      <AutoStartMission>
        <div className="h-screen bg-background">
          <MissionShell
            showDevPanel={true}
            customWidgets={<WidgetsPanel />}
          />
        </div>
      </AutoStartMission>
    </MissionRuntimeProvider>
  ),
};

export const ReducedMotion: Story = {
  render: () => (
    <MissionRuntimeProvider
      initialDefinition={MasterOrganicChemistry}
      enableTimer={false}
    >
      <AutoStartMission>
        <div className="h-screen bg-background">
          <MissionShell
            disableAnimations={true}
            customWidgets={<WidgetsPanel />}
          />
        </div>
      </AutoStartMission>
    </MissionRuntimeProvider>
  ),
};

