import type { Meta, StoryObj } from "@storybook/react-vite";
import { MissionShell } from "./MissionShell";
import { MissionRuntimeProvider } from "../../../missions/provider";
import {
  MasterOrganicChemistry,
  FrankStarlingPodWorkshop,
  UWorldPracticeSession,
} from "../../../fixtures/missions/definitions";
import { setupMissionSystem } from "../setup";
import { ObjectiveStepper, FocusTimer, ProgressBar } from "../widgets";

// Initialize mission system
setupMissionSystem();

const meta: Meta<typeof MissionShell> = {
  title: "Missions/Shell/MissionShell",
  component: MissionShell,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The main mission UI orchestrator. Renders HUD, tool dock/rail, and the selected layout preset based on mission definition.",
      },
    },
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <MissionRuntimeProvider initialDefinition={MasterOrganicChemistry} enableTimer={false}>
        <div className="h-screen bg-background">
          <Story />
        </div>
      </MissionRuntimeProvider>
    ),
  ],
  argTypes: {
    showDevPanel: {
      control: { type: "boolean" },
      description: "Show runtime debug panel",
    },
    disableAnimations: {
      control: { type: "boolean" },
      description: "Disable all animations",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────────────────────────

export const Default: Story = {
  args: {
    showDevPanel: true,
  },
};

export const SoloStudyMission: Story = {
  args: {
    showDevPanel: false,
  },
  decorators: [
    (Story) => (
      <MissionRuntimeProvider initialDefinition={MasterOrganicChemistry} enableTimer={false}>
        <div className="h-screen bg-background">
          <Story />
        </div>
      </MissionRuntimeProvider>
    ),
  ],
};

export const PodLectureMission: Story = {
  args: {
    showDevPanel: false,
  },
  decorators: [
    (Story) => (
      <MissionRuntimeProvider initialDefinition={FrankStarlingPodWorkshop} enableTimer={false}>
        <div className="h-screen bg-background">
          <Story />
        </div>
      </MissionRuntimeProvider>
    ),
  ],
};

export const ExternalPracticeMission: Story = {
  args: {
    showDevPanel: false,
  },
  decorators: [
    (Story) => (
      <MissionRuntimeProvider initialDefinition={UWorldPracticeSession} enableTimer={false}>
        <div className="h-screen bg-background">
          <Story />
        </div>
      </MissionRuntimeProvider>
    ),
  ],
};

export const WithWidgets: Story = {
  args: {
    showDevPanel: false,
    customWidgets: (
      <div className="space-y-4">
        <ObjectiveStepper compact />
        <FocusTimer size="sm" />
        <ProgressBar />
      </div>
    ),
  },
};

export const WithDevPanel: Story = {
  args: {
    showDevPanel: true,
  },
};

export const ReducedMotion: Story = {
  args: {
    showDevPanel: false,
    disableAnimations: true,
  },
};
