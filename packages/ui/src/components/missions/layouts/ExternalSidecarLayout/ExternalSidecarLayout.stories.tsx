import type { Meta, StoryObj } from "@storybook/react-vite";
import { ExternalSidecarLayout } from "./ExternalSidecarLayout";
import { MissionRuntimeProvider } from "../../../../missions/provider";
import { UWorldPracticeSession } from "../../../../fixtures/missions/definitions";
import { setupMissionSystem } from "../../setup";

// Initialize mission system
setupMissionSystem();

const meta: Meta<typeof ExternalSidecarLayout> = {
  title: "Missions/LayoutPresets/ExternalSidecar",
  component: ExternalSidecarLayout,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "ExternalSidecar layout for missions where the user works in an external app (UWorld, Anki, etc.).",
      },
    },
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <MissionRuntimeProvider
        initialDefinition={UWorldPracticeSession}
        enableTimer={false}
      >
        <div className="h-screen bg-background">
          <Story />
        </div>
      </MissionRuntimeProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="h-full p-4">
      <div className="rounded-lg border border-border/40 bg-card/40 p-8 text-center">
        <h3 className="text-lg font-semibold mb-2">ExternalSidecar Layout</h3>
        <p className="text-sm text-muted-foreground">
          See the MissionShell story for full interactive demo with external practice mission.
        </p>
      </div>
    </div>
  ),
};

