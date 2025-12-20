import type { Meta, StoryObj } from "@storybook/react-vite";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useState } from "react";
import { EpisodeTimeline, type TimelineEpisode } from "./EpisodeTimeline";

const sampleEpisodes: TimelineEpisode[] = [
  { id: "ep-01", number: 1, track: "HUMAN", title: "Cognitive Load" },
  { id: "ep-02", number: 2, track: "MODEL", title: "Prompt Alchemy" },
  { id: "ep-03", number: 3, track: "BRIDGE", title: "Agents IRL" },
  { id: "ep-04", number: 4, track: "HUMAN", title: "Deep Focus" },
  { id: "ep-05", number: 5, track: "MODEL", title: "Ethical Guardrails" },
  { id: "ep-06", number: 6, track: "BRIDGE", title: "Debrief + Drop" },
];

const meta = {
  title: "Three/EpisodeTimeline",
  component: EpisodeTimeline,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Animated episode rails rendered in Three.js. Use this story to iterate on show outlines or test different HUMAN/MODEL/BRIDGE combinations.",
      },
    },
  },
  argTypes: {
    episodes: {
      control: false,
      description: "Array of episode metadata rendered along the scope rail.",
    },
    selectedEpisode: {
      control: false,
      description: "Currently highlighted episode id.",
    },
    onEpisodeClick: {
      action: "episodeClick",
      description: "Triggered when a node is clicked.",
    },
  },
} satisfies Meta<typeof EpisodeTimeline>;

export default meta;
type Story = StoryObj<typeof meta>;

const TimelinePreview = (args: Story["args"]) => {
  const [selected, setSelected] = useState<string | undefined>(args?.selectedEpisode ?? sampleEpisodes[0].id);

  return (
    <div className="relative h-[480px] w-full max-w-4xl overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-black via-gray-950 to-slate-900">
      <Canvas camera={{ position: [0, 1.5, 7], fov: 45 }}>
        <color attach="background" args={["#05060a"]} />
        <ambientLight intensity={0.6} />
        <pointLight position={[4, 3, 4]} intensity={0.8} />
        <pointLight position={[-4, -3, -2]} intensity={0.4} color="#f000ff" />
        <EpisodeTimeline
          {...args}
          episodes={args?.episodes ?? sampleEpisodes}
          selectedEpisode={selected}
          onEpisodeClick={(id) => {
            setSelected(id);
            args?.onEpisodeClick?.(id);
          }}
        />
        <OrbitControls enablePan={false} />
      </Canvas>

      <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/10 bg-black/60 px-4 py-1 text-xs uppercase tracking-widest text-white/70 backdrop-blur">
        Active: {selected?.toUpperCase()}
      </div>
    </div>
  );
};

export const ShowEpisodes: Story = {
  render: (args) => <TimelinePreview {...args} />,
};

export const AlternateTracks: Story = {
  render: (args) => (
    <TimelinePreview
      {...args}
      episodes={[
        { id: "ep-aa", number: 11, track: "BRIDGE", title: "Ambient Journals" },
        { id: "ep-bb", number: 12, track: "MODEL", title: "Fine-tune Diaries" },
        { id: "ep-cc", number: 13, track: "HUMAN", title: "Studio Rituals" },
        { id: "ep-dd", number: 14, track: "MODEL", title: "Latency Myths" },
        { id: "ep-ee", number: 15, track: "BRIDGE", title: "Aftercare + Publishing" },
      ]}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: "Demonstrates a shortened run with different track mixes.",
      },
    },
  },
};
