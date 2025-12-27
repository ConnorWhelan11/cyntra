import type { Meta, StoryObj } from "@storybook/react-vite";
import { MissionShell } from "../MissionShell";
import { MissionRuntimeProvider, useMissionRuntime } from "../../../missions/provider";
import { FrankStarlingPodWorkshop } from "../../../fixtures/missions/definitions";
import { setupMissionSystem } from "../setup";
import { FocusTimer, ProgressBar } from "../widgets";
import React, { useEffect } from "react";

setupMissionSystem();

const meta: Meta = {
  title: "Missions/Wedges/PodLectureMission",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "End-to-end Pod Lecture mission (Wedge B). Features TabsWorkspace layout with notes + drawboard + comms.",
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
    <div className="flex items-center gap-4">
      <FocusTimer size="sm" showCountdown={true} />
      <ProgressBar compact showXP={true} />
    </div>
  );
}

export const Default: Story = {
  render: () => (
    <MissionRuntimeProvider
      initialDefinition={FrankStarlingPodWorkshop}
      enableTimer={true}
      timerInterval={1000}
    >
      <AutoStartMission>
        <div className="h-screen bg-background">
          <MissionShell showDevPanel={true} customWidgets={<WidgetsPanel />} />
        </div>
      </AutoStartMission>
    </MissionRuntimeProvider>
  ),
};

export const IdleState: Story = {
  render: () => (
    <MissionRuntimeProvider initialDefinition={FrankStarlingPodWorkshop} enableTimer={false}>
      <div className="h-screen bg-background">
        <MissionShell showDevPanel={false} />
      </div>
    </MissionRuntimeProvider>
  ),
};

export const WithTimerRunning: Story = {
  render: () => (
    <MissionRuntimeProvider
      initialDefinition={FrankStarlingPodWorkshop}
      enableTimer={true}
      timerInterval={100}
    >
      <AutoStartMission>
        <div className="h-screen bg-background">
          <MissionShell showDevPanel={true} customWidgets={<WidgetsPanel />} />
        </div>
      </AutoStartMission>
    </MissionRuntimeProvider>
  ),
};

export const PodInfoHeader: Story = {
  render: () => (
    <MissionRuntimeProvider initialDefinition={FrankStarlingPodWorkshop} enableTimer={false}>
      <AutoStartMission>
        <div className="h-screen bg-background">
          <MissionShell
            showDevPanel={false}
            customWidgets={
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-neon" />
                  <span className="text-emerald-neon">3 online</span>
                </div>
                <span className="text-muted-foreground">•</span>
                <FocusTimer size="sm" showCountdown={true} />
              </div>
            }
          />
        </div>
      </AutoStartMission>
    </MissionRuntimeProvider>
  ),
};
