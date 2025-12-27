import type { Meta, StoryObj } from "@storybook/react-vite";
import { TabsWorkspaceLayout } from "./TabsWorkspaceLayout";
import { MissionRuntimeProvider } from "../../../../missions/provider";
import { FrankStarlingPodWorkshop } from "../../../../fixtures/missions/definitions";
import { setupMissionSystem } from "../../setup";

// Initialize mission system
setupMissionSystem();

const meta: Meta<typeof TabsWorkspaceLayout> = {
  title: "Missions/LayoutPresets/TabsWorkspace",
  component: TabsWorkspaceLayout,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "TabsWorkspace layout for fast switching between multiple tool surfaces. Ideal for pod/lecture missions.",
      },
    },
  },
  tags: ["autodocs"],
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

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="h-full p-4">
      <div className="rounded-lg border border-border/40 bg-card/40 p-8 text-center">
        <h3 className="text-lg font-semibold mb-2">TabsWorkspace Layout</h3>
        <p className="text-sm text-muted-foreground">
          See the MissionShell story for full interactive demo with pod mission.
        </p>
      </div>
    </div>
  ),
};
