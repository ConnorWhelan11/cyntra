import type { Meta, StoryObj } from "@storybook/react-vite";
import { KPIStat } from "./KPIStat";

const meta: Meta<typeof KPIStat> = {
  title: "Molecules/KPIStat",
  component: KPIStat,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "A dashboard KPI card component inspired by Tremor design. Shows key metrics with trend indicators, delta changes, and optional sparkline visualization. Perfect for analytics dashboards and progress tracking.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["default", "success", "warning", "danger", "accent"],
      description: "Card visual style variant",
    },
    size: {
      control: { type: "select" },
      options: ["default", "compact", "expanded"],
      description: "Card size",
    },
    title: {
      control: { type: "text" },
      description: "KPI title/label",
    },
    value: {
      control: { type: "text" },
      description: "Current value",
    },
    previousValue: {
      control: { type: "number" },
      description: "Previous value for delta calculation",
    },
    suffix: {
      control: { type: "text" },
      description: "Value suffix",
    },
    prefix: {
      control: { type: "text" },
      description: "Value prefix",
    },
    deltaType: {
      control: { type: "select" },
      options: ["percentage", "absolute", "none"],
      description: "Delta display type",
    },
    showTrend: {
      control: { type: "boolean" },
      description: "Show trend indicator",
    },
    description: {
      control: { type: "text" },
      description: "Additional description",
    },
    loading: {
      control: { type: "boolean" },
      description: "Loading state",
    },
    disableAnimations: {
      control: { type: "boolean" },
      description: "Disable all animations",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Total Revenue",
    value: 45230,
    previousValue: 42100,
    prefix: "$",
    sparklineData: [35000, 38000, 42000, 39000, 45000, 43000, 45230],
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl">
      <KPIStat
        variant="default"
        title="Study Sessions"
        value={127}
        previousValue={115}
        description="This month"
        sparklineData={[95, 105, 110, 115, 120, 125, 127]}
      />

      <KPIStat
        variant="success"
        title="Accuracy Rate"
        value={94.5}
        previousValue={89.2}
        suffix="%"
        description="Last 30 days"
        sparklineData={[85, 87, 89, 91, 92, 93, 94.5]}
      />

      <KPIStat
        variant="warning"
        title="Study Streak"
        value={22}
        previousValue={28}
        suffix=" days"
        description="Current streak"
        sparklineData={[30, 28, 26, 24, 22, 20, 22]}
      />

      <KPIStat
        variant="danger"
        title="Missed Sessions"
        value={3}
        previousValue={1}
        description="This week"
        sparklineData={[0, 1, 1, 2, 2, 3, 3]}
      />

      <KPIStat
        variant="accent"
        title="XP Earned"
        value={15420}
        previousValue={14200}
        description="Total experience"
        sparklineData={[12000, 13000, 13500, 14000, 14200, 14800, 15420]}
      />

      <KPIStat
        variant="default"
        title="Time Studied"
        value={47.5}
        previousValue={52.3}
        suffix=" hrs"
        description="This week"
        sparklineData={[45, 48, 50, 52, 51, 49, 47.5]}
      />
    </div>
  ),
};

export const TrendDirections: Story = {
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl">
      <KPIStat
        title="Trending Up"
        value={85}
        previousValue={72}
        suffix="%"
        variant="success"
        description="Performance improving"
        sparklineData={[65, 68, 72, 75, 78, 82, 85]}
      />

      <KPIStat
        title="Trending Down"
        value={67}
        previousValue={81}
        suffix="%"
        variant="warning"
        description="Needs attention"
        sparklineData={[85, 83, 81, 78, 74, 70, 67]}
      />

      <KPIStat
        title="Stable"
        value={92}
        previousValue={92}
        suffix="%"
        description="Consistent performance"
        sparklineData={[91, 92, 91, 93, 92, 91, 92]}
      />
    </div>
  ),
};

export const DifferentDeltaTypes: Story = {
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl">
      <KPIStat
        title="Percentage Delta"
        value={1250}
        previousValue={1000}
        deltaType="percentage"
        description="25% increase"
      />

      <KPIStat
        title="Absolute Delta"
        value={1250}
        previousValue={1000}
        deltaType="absolute"
        description="+250 points"
      />

      <KPIStat title="No Delta" value={1250} deltaType="none" description="Just the value" />
    </div>
  ),
};

export const WithSparklines: Story = {
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
      <KPIStat
        title="Daily Questions"
        value={45}
        previousValue={38}
        description="Questions answered per day"
        sparklineData={[25, 30, 35, 38, 42, 40, 45]}
        variant="accent"
      />

      <KPIStat
        title="Accuracy Trend"
        value={87.5}
        previousValue={82.1}
        suffix="%"
        description="7-day rolling average"
        sparklineData={[78, 80, 82, 84, 85, 86, 87.5]}
        variant="success"
      />

      <KPIStat
        title="Study Time"
        value={3.2}
        previousValue={4.1}
        suffix=" hrs"
        description="Daily average"
        sparklineData={[4.5, 4.2, 4.1, 3.8, 3.5, 3.3, 3.2]}
        variant="warning"
      />

      <KPIStat
        title="XP Rate"
        value={156}
        previousValue={143}
        suffix="/hr"
        description="Experience per hour"
        sparklineData={[120, 130, 135, 143, 148, 152, 156]}
        variant="accent"
      />
    </div>
  ),
};

export const LoadingStates: Story = {
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl">
      <KPIStat title="Loading Metric" value={0} loading description="Fetching data..." />

      <KPIStat
        title="Another Metric"
        value={0}
        loading
        variant="accent"
        description="Please wait..."
      />

      <KPIStat title="Third Metric" value={0} loading size="compact" description="Loading..." />
    </div>
  ),
};

export const InteractiveCards: Story = {
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
      <KPIStat
        title="Clickable Metric"
        value={2847}
        previousValue={2654}
        description="Click for details"
        sparklineData={[2400, 2500, 2600, 2654, 2700, 2800, 2847]}
        onClick={() => alert("Metric details clicked!")}
        variant="accent"
      />

      <KPIStat
        title="Interactive Chart"
        value={94.2}
        previousValue={91.8}
        suffix="%"
        description="Click to expand"
        sparklineData={[88, 89, 90, 91.8, 92, 93, 94.2]}
        onClick={() => alert("Chart expanded!")}
        variant="success"
      />
    </div>
  ),
};

export const CompactLayout: Story = {
  render: () => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-6xl">
      <KPIStat
        size="compact"
        title="Questions"
        value={247}
        previousValue={198}
        description="Answered"
      />

      <KPIStat
        size="compact"
        title="Accuracy"
        value={89.5}
        previousValue={87.2}
        suffix="%"
        variant="success"
      />

      <KPIStat
        size="compact"
        title="Streak"
        value={15}
        previousValue={18}
        suffix=" days"
        variant="warning"
      />

      <KPIStat size="compact" title="XP" value={12450} previousValue={11800} variant="accent" />
    </div>
  ),
};

export const ReducedMotion: Story = {
  args: {
    title: "Reduced Motion KPI",
    value: 1337,
    previousValue: 1200,
    description: "No animations",
    sparklineData: [1000, 1100, 1200, 1250, 1300, 1320, 1337],
    disableAnimations: true,
  },
};

export const Interactive: Story = {
  args: {
    title: "Interactive KPI",
    value: 94.7,
    previousValue: 91.2,
    suffix: "%",
    description: "Click to see details",
    sparklineData: [88, 89, 91, 91.2, 92, 93, 94.7],
    onClick: () => alert("KPI clicked!"),
    variant: "accent",
  },
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector("div");
    if (!card) {
      throw new Error("KPIStat not found");
    }

    // Check title is rendered
    const title = card.textContent?.includes("Interactive KPI");
    if (!title) {
      throw new Error("KPI title not rendered");
    }

    // Check value is displayed
    const value = card.textContent?.includes("94.7%");
    if (!value) {
      throw new Error("KPI value not displayed");
    }

    // Check sparkline is present
    const sparkline = card.querySelector("svg");
    if (!sparkline) {
      throw new Error("Sparkline not found");
    }

    // Check trend indicator
    const trendIcon = card.querySelector("svg[class*='h-3']");
    if (!trendIcon) {
      throw new Error("Trend indicator not found");
    }
  },
};

export const DashboardExample: Story = {
  render: () => (
    <div className="w-full max-w-6xl mx-auto p-6 space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Study Analytics</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPIStat
          title="Questions Answered"
          value={2847}
          previousValue={2654}
          description="Total completed"
          sparklineData={[2200, 2350, 2500, 2654, 2700, 2800, 2847]}
          variant="accent"
          onClick={() => alert("View question history")}
        />

        <KPIStat
          title="Overall Accuracy"
          value={87.3}
          previousValue={84.1}
          suffix="%"
          description="All subjects"
          sparklineData={[82, 83, 84, 84.1, 85, 86, 87.3]}
          variant="success"
          onClick={() => alert("View accuracy breakdown")}
        />

        <KPIStat
          title="Study Streak"
          value={28}
          previousValue={32}
          suffix=" days"
          description="Current streak"
          sparklineData={[35, 34, 33, 32, 30, 29, 28]}
          variant="warning"
          onClick={() => alert("View streak details")}
        />

        <KPIStat
          title="Weekly Goal"
          value={156}
          previousValue={140}
          suffix="/200"
          description="Questions this week"
          sparklineData={[120, 125, 130, 140, 145, 150, 156]}
          variant="accent"
          onClick={() => alert("Adjust weekly goal")}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPIStat
          title="Time Studied"
          value={47.5}
          previousValue={52.3}
          suffix=" hours"
          description="This week"
          sparklineData={[45, 48, 50, 52.3, 51, 49, 47.5]}
          variant="warning"
        />

        <KPIStat
          title="XP Earned"
          value={15420}
          previousValue={14200}
          description="Total experience"
          sparklineData={[12000, 13000, 13500, 14200, 14800, 15100, 15420]}
          variant="success"
        />

        <KPIStat
          title="Weak Areas"
          value={3}
          previousValue={5}
          description="Topics needing focus"
          sparklineData={[8, 7, 6, 5, 4, 3, 3]}
          variant="success"
        />
      </div>
    </div>
  ),
};
