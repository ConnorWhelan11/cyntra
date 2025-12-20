import type { Meta, StoryObj } from "@storybook/react-vite";
import { ObjectiveStepper } from "./ObjectiveStepper";
import { MissionRuntimeProvider } from "../../../../missions/provider";
import { MasterOrganicChemistry } from "../../../../fixtures/missions/definitions";
import { setupMissionSystem } from "../../setup";

setupMissionSystem();

const meta: Meta<typeof ObjectiveStepper> = {
  title: "Missions/Widgets/ObjectiveStepper",
  component: ObjectiveStepper,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "Shows step list and current step state with navigation support.",
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
        <div className="w-80 p-4 bg-card rounded-lg border border-border/40">
          <Story />
        </div>
      </MissionRuntimeProvider>
    ),
  ],
  argTypes: {
    showDescriptions: {
      control: { type: "boolean" },
      description: "Show step descriptions",
    },
    allowNavigation: {
      control: { type: "boolean" },
      description: "Allow clicking to navigate steps",
    },
    compact: {
      control: { type: "boolean" },
      description: "Compact mode for rail display",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    showDescriptions: false,
    allowNavigation: true,
    compact: false,
  },
};

export const WithDescriptions: Story = {
  args: {
    showDescriptions: true,
    allowNavigation: true,
    compact: false,
  },
};

export const Compact: Story = {
  args: {
    showDescriptions: false,
    allowNavigation: true,
    compact: true,
  },
};

export const ReadOnly: Story = {
  args: {
    showDescriptions: false,
    allowNavigation: false,
    compact: false,
  },
};

