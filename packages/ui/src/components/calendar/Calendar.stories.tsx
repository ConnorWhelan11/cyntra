"use client";

import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { CalendarBody } from "./calendar-body";
import { CalendarProvider } from "./contexts/calendar-context";
import { DndProvider } from "./contexts/dnd-context";
import { CalendarHeader } from "./header/calendar-header";
import { CALENDAR_ITEMS_MOCK, USERS_MOCK } from "./mocks";
import type { TCalendarView } from "./types";

type CalendarStoryProps = {
  view: TCalendarView;
  showConfirmation: boolean;
  badgeVariant: "dot" | "colored";
  eventCount: number;
};

const CalendarDemo = ({
  view,
  showConfirmation,
  badgeVariant,
  eventCount,
}: CalendarStoryProps) => {
  const events = React.useMemo(
    () =>
      CALENDAR_ITEMS_MOCK.slice(
        0,
        Math.min(eventCount, CALENDAR_ITEMS_MOCK.length),
      ),
    [eventCount],
  );

  return (
    <div className="w-full max-w-6xl h-[720px]">
      <CalendarProvider
        events={events}
        users={USERS_MOCK}
        view={view}
        badge={badgeVariant}
      >
        <DndProvider showConfirmation={showConfirmation}>
          <div className="h-full w-full overflow-hidden rounded-xl border bg-background shadow-sm">
            <CalendarHeader />
            <CalendarBody />
          </div>
        </DndProvider>
      </CalendarProvider>
    </div>
  );
};

const meta: Meta<typeof CalendarDemo> = {
  title: "Calendar/FullCalendar",
  component: CalendarDemo,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Full calendar experience with drag-and-drop, filtering, and multiple views powered by the shadcn-based calendar module.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    view: {
      control: { type: "select" },
      options: ["month", "week", "day", "agenda", "year"],
      description: "Initial view for the calendar header and body.",
    },
    badgeVariant: {
      control: { type: "inline-radio" },
      options: ["colored", "dot"],
      description: "Style of event badges in list views.",
    },
    showConfirmation: {
      control: "boolean",
      description:
        "Show a confirmation dialog before dropping an event to a new slot.",
    },
    eventCount: {
      control: { type: "range", min: 5, max: 80, step: 5 },
      description: "Number of mock events rendered from CALENDAR_ITEMS_MOCK.",
    },
  },
  args: {
    view: "month",
    badgeVariant: "colored",
    showConfirmation: false,
    eventCount: 30,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const MonthView: Story = {};

export const WeekView: Story = {
  args: {
    view: "week",
  },
};

export const AgendaView: Story = {
  args: {
    view: "agenda",
    badgeVariant: "dot",
    eventCount: 20,
  },
  parameters: {
    docs: {
      description: {
        story: "Agenda list mode with dot badges for a compact timeline read.",
      },
    },
  },
};

export const YearGlance: Story = {
  args: {
    view: "year",
    eventCount: 60,
  },
};

export const WithDropConfirmation: Story = {
  args: {
    view: "week",
    showConfirmation: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Simulates the drag-and-drop confirmation flow when repositioning events.",
      },
    },
  },
};
