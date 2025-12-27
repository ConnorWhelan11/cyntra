import type { Meta, StoryObj } from "@storybook/react-vite";
import { FocusSplitLayout } from "./FocusSplitLayout";
import { MissionRuntimeProvider } from "../../../../missions/provider";
import { MasterOrganicChemistry } from "../../../../fixtures/missions/definitions";
import { setupMissionSystem } from "../../setup";
import { ObjectiveStepper, FocusTimer, ProgressBar } from "../../widgets";

// Initialize mission system
setupMissionSystem();

const meta: Meta<typeof FocusSplitLayout> = {
  title: "Missions/LayoutPresets/FocusSplit",
  component: FocusSplitLayout,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "FocusSplit layout for deep focus on a primary tool with a stable right rail. Ideal for solo study missions.",
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
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    // This is a simplified render since the layout needs runtime context
    return (
      <div className="h-full p-4">
        <div className="rounded-lg border border-border/40 bg-card/40 p-8 text-center">
          <h3 className="text-lg font-semibold mb-2">FocusSplit Layout</h3>
          <p className="text-sm text-muted-foreground">
            See the MissionShell story for full interactive demo.
          </p>
        </div>
      </div>
    );
  },
};

export const WithWidgets: Story = {
  render: () => (
    <div className="h-full p-4">
      <div className="flex gap-4 h-full">
        {/* Primary area placeholder */}
        <div className="flex-1 rounded-lg border border-border/40 bg-card/40 p-4">
          <div className="h-full flex items-center justify-center text-muted-foreground">
            Primary Tool Area
          </div>
        </div>

        {/* Right rail with widgets */}
        <div className="w-72 space-y-4">
          <div className="rounded-lg border border-border/40 bg-card/40 p-4">
            <ObjectiveStepper compact />
          </div>
          <div className="rounded-lg border border-border/40 bg-card/40 p-4">
            <FocusTimer size="sm" />
          </div>
          <div className="rounded-lg border border-border/40 bg-card/40 p-4">
            <ProgressBar />
          </div>
        </div>
      </div>
    </div>
  ),
};
