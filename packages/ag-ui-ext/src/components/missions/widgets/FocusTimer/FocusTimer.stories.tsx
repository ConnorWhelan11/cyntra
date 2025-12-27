import type { Meta, StoryObj } from "@storybook/react-vite";
import { FocusTimer } from "./FocusTimer";
import { MissionRuntimeProvider } from "../../../../missions/provider";
import { MasterOrganicChemistry } from "../../../../fixtures/missions/definitions";
import { setupMissionSystem } from "../../setup";

setupMissionSystem();

const meta: Meta<typeof FocusTimer> = {
  title: "Missions/Widgets/FocusTimer",
  component: FocusTimer,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "Displays countdown/elapsed time based on mission duration and current step.",
      },
    },
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <MissionRuntimeProvider initialDefinition={MasterOrganicChemistry} enableTimer={false}>
        <div className="w-64 p-4 bg-card rounded-lg border border-border/40">
          <Story />
        </div>
      </MissionRuntimeProvider>
    ),
  ],
  argTypes: {
    showCountdown: {
      control: { type: "boolean" },
      description: "Show countdown vs elapsed time",
    },
    size: {
      control: { type: "select" },
      options: ["sm", "md", "lg"],
      description: "Timer size variant",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    showCountdown: true,
    size: "md",
  },
};

export const Elapsed: Story = {
  args: {
    showCountdown: false,
    size: "md",
  },
};

export const Small: Story = {
  args: {
    showCountdown: true,
    size: "sm",
  },
};

export const Large: Story = {
  args: {
    showCountdown: true,
    size: "lg",
  },
};
