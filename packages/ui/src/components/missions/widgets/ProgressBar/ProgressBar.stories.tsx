import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProgressBar } from "./ProgressBar";
import { MissionRuntimeProvider } from "../../../../missions/provider";
import { MasterOrganicChemistry } from "../../../../fixtures/missions/definitions";
import { setupMissionSystem } from "../../setup";

setupMissionSystem();

const meta: Meta<typeof ProgressBar> = {
  title: "Missions/Widgets/Progress",
  component: ProgressBar,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "Shows mission progress and optional XP earned.",
      },
    },
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <MissionRuntimeProvider
        initialDefinition={MasterOrganicChemistry}
        enableTimer={false}
      >
        <div className="w-64 p-4 bg-card rounded-lg border border-border/40">
          <Story />
        </div>
      </MissionRuntimeProvider>
    ),
  ],
  argTypes: {
    showXP: {
      control: { type: "boolean" },
      description: "Show XP indicator",
    },
    compact: {
      control: { type: "boolean" },
      description: "Compact layout",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    showXP: true,
    compact: false,
  },
};

export const WithoutXP: Story = {
  args: {
    showXP: false,
    compact: false,
  },
};

export const Compact: Story = {
  args: {
    showXP: true,
    compact: true,
  },
};

