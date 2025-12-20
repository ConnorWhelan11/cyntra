import type { Meta, StoryObj } from "@storybook/react-vite";
import { OutOfScopeScene } from "./OutOfScopeScene";
import { type ComponentProps, type ReactNode, useState } from "react";

const meta = {
  title: "Three/OutOfScopeScene",
  component: OutOfScopeScene,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Parallax-scrolling Three.js scene used by the Out of Scope experience. The Storybook example renders the canvas plus the matching HTML scroll content so contributors can iterate on copy or layout.",
      },
    },
  },
  argTypes: {
    onSectionChange: {
      description: "Fires with the current scroll section (0-3).",
      action: "sectionChange",
    },
    children: {
      control: false,
      description: "HTML overlay rendered inside the ScrollControls html slot.",
    },
  },
} satisfies Meta<typeof OutOfScopeScene>;

export default meta;
type Story = StoryObj<typeof meta>;

const sections = [
  { title: "Origin Story", body: "A candid look at the projects that sparked the Out of Scope universe." },
  { title: "Hyperfocus Mode", body: "Neurodivergent friendly rituals, timers, and breathing loops." },
  { title: "Agent Collabs", body: "Composable AI agents that co-write outlines or remix prompts." },
  { title: "Creative Debrief", body: "Podcast-ready show notes auto-synced into the CMS." },
];

const ScrollDemo = ({
  content,
  ...sceneProps
}: {
  content: ReactNode;
} & ComponentProps<typeof OutOfScopeScene>) => {
  const [section, setSection] = useState(0);

  return (
    <div className="relative h-[640px] w-full overflow-hidden rounded-3xl border border-border/50 bg-black">
      <OutOfScopeScene
        {...sceneProps}
        className={["!min-h-[640px]", sceneProps.className].filter(Boolean).join(" ")}
        pinToViewport={false}
        onSectionChange={(value) => {
          setSection(value);
          sceneProps.onSectionChange?.(value);
        }}
      >
        {content}
      </OutOfScopeScene>

      <div className="pointer-events-auto absolute right-4 top-4 rounded-full border border-white/20 bg-black/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white/80 backdrop-blur">
        Active Section: {section + 1}
      </div>
    </div>
  );
};

export const ScrollableShowcase: Story = {
  render: (args) => (
    <ScrollDemo
      {...args}
      content={
        <div className="pointer-events-none flex flex-col gap-24 px-6 py-32 sm:px-16">
          {sections.map((entry, index) => (
            <section key={entry.title} className="flex min-h-[60vh] items-center">
              <div className="space-y-4 text-white/90">
                <p className="text-xs uppercase tracking-[0.3em] text-cyan-200">
                  Section {index + 1 < 10 ? `0${index + 1}` : index + 1}
                </p>
                <h3 className="text-3xl font-semibold sm:text-5xl">{entry.title}</h3>
                <p className="max-w-2xl text-base text-white/70 sm:text-lg">{entry.body}</p>
              </div>
            </section>
          ))}
        </div>
      }
    />
  ),
};

export const WithCustomContent: Story = {
  render: (args) => (
    <ScrollDemo
      {...args}
      content={
        <div className="pointer-events-none flex min-h-[60vh] flex-col gap-20 px-6 py-28 sm:px-14">
          {["Editorial Moodboards", "Podcast Pipeline", "Personal Experiments"].map((title, idx) => (
            <section key={title} className="flex items-center">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80 shadow-neon-cyan/30 backdrop-blur">
                <p className="text-sm text-cyan-200">{idx === 0 ? "Journal" : idx === 1 ? "Audio" : "Play"}</p>
                <h3 className="text-3xl font-semibold">{title}</h3>
                <p className="text-sm text-white/60">
                  Scroll to let the camera pan across the hologram box while the copy updates.
                </p>
              </div>
            </section>
          ))}
        </div>
      }
    />
  ),
  parameters: {
    docs: {
      description: {
        story: "Demonstrates custom HTML overlays for the ScrollControls html slot.",
      },
    },
  },
};

export const IntroSequence: Story = {
  render: (args) => (
    <ScrollDemo
      {...args}
      scopeBoxProps={{ forceIntro: true, enableIntro: true }}
      content={<div className="min-h-[80vh]" />}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: "Forces the cinematic intro flow on the ScopeBox within the scene for quick iteration.",
      },
    },
  },
};
