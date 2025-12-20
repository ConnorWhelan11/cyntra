import type { Meta, StoryObj } from "@storybook/react-vite";
import { UnitBundleHost } from "@/components/unit";
import { cn } from "@/lib/utils";

const helloWorldBundle = {
  spec: {
    units: {
      helloworld: {
        id: "a9cbed12-9a53-11eb-8c2e-f3146b36128d",
      },
    },
    render: true,
    component: {
      subComponents: {
        helloworld: {},
      },
      children: ["helloworld"],
    },
  },
};

const meta = {
  title: "Widgets/Unit/UnitBundleHost",
  component: UnitBundleHost,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof UnitBundleHost>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HelloWorld: Story = {
  args: {
    bundle: helloWorldBundle,
  },
  render: (args) => (
    <div className="h-[360px] w-[520px] rounded-3xl border border-white/10 bg-gradient-to-br from-background via-background/80 to-primary/10 p-4 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.65)] backdrop-blur-lg">
      <UnitBundleHost
        {...args}
        className={cn("h-full w-full", args.className)}
      />
    </div>
  ),
};

