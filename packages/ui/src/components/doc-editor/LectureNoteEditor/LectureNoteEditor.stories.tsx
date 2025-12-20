import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, useEffect } from "react";
import { LectureNoteEditor, LectureSegment } from "./LectureNoteEditor";

const meta: Meta<typeof LectureNoteEditor> = {
  title: "Docs/LectureNoteEditor",
  component: LectureNoteEditor,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Specialized editor for lecture notes with optional professor stream sidebar for AI/ASR-generated insights.",
      },
    },
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sampleLectureNotes: any[] = [
  {
    type: "heading",
    props: { level: 1 },
    content: [{ type: "text", text: "Cardiomyopathy – Part 1" }],
  },
  {
    type: "paragraph",
    content: [
      { type: "text", text: "Three main types: dilated, hypertrophic, restrictive." },
    ],
  },
];

const sampleStreamContent: LectureSegment[] = [
  { id: "1", timestamp: 120, type: "insight", content: "Key distinction: systolic vs diastolic dysfunction" },
  { id: "2", timestamp: 180, type: "question", content: "What are the genetic markers for HCM?" },
  { id: "3", timestamp: 240, type: "note", content: "Treatment: beta-blockers, CCBs, avoid dehydration" },
];

/** Static lecture notes */
export const StaticLecture: Story = {
  args: {
    lectureTitle: "Cardiomyopathy – Part 1",
    lectureDate: new Date("2025-01-15"),
    initialContent: sampleLectureNotes,
    tags: ["Cardiology", "Step 1"],
  },
};

/** With professor stream enabled */
export const WithProfessorStream: Story = {
  args: {
    lectureTitle: "Cardiomyopathy – Part 1",
    lectureDate: new Date(),
    professorStreamEnabled: true,
    professorStreamContent: sampleStreamContent,
    tags: ["Cardiology"],
  },
};

/** Simulated live lecture */
export const LiveFeeling: Story = {
  render: () => {
    const [streamContent, setStreamContent] = useState<LectureSegment[]>([]);
    const [currentTime, setCurrentTime] = useState(0);

    useEffect(() => {
      const interval = setInterval(() => {
        setCurrentTime((t) => t + 1);
      }, 1000);

      const addSegment = setInterval(() => {
        const newSegment: LectureSegment = {
          id: Date.now().toString(),
          timestamp: currentTime,
          type: ["insight", "note", "question"][Math.floor(Math.random() * 3)] as LectureSegment["type"],
          content: `Auto-generated insight at ${Math.floor(currentTime / 60)}:${(currentTime % 60).toString().padStart(2, "0")}`,
        };
        setStreamContent((prev) => [...prev.slice(-4), newSegment]);
      }, 5000);

      return () => {
        clearInterval(interval);
        clearInterval(addSegment);
      };
    }, [currentTime]);

    return (
      <LectureNoteEditor
        lectureTitle="Live Lecture Simulation"
        lectureDate={new Date()}
        professorStreamEnabled
        professorStreamContent={streamContent}
        currentTimestamp={currentTime}
        onInsertSegment={(seg) => console.log("Insert segment:", seg)}
        tags={["Live", "Demo"]}
      />
    );
  },
};
