import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  BarChart3,
  Bell,
  Book,
  Home,
  MessageSquare,
  Settings,
  Target,
} from "lucide-react";
import { Header } from "./Header";

const meta: Meta<typeof Header> = {
  title: "Organisms/Header",
  component: Header,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "A comprehensive header component with agent orb, navigation, search functionality, and action items. Features online status indicators, theme toggle integration, and responsive design.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["default", "floating", "transparent"],
      description: "Header visual style variant",
    },
    size: {
      control: { type: "select" },
      options: ["default", "compact", "expanded"],
      description: "Header height size",
    },
    agentOnline: {
      control: { type: "boolean" },
      description: "Agent online status",
    },
    showAgentOrb: {
      control: { type: "boolean" },
      description: "Show agent orb and status",
    },
    showMobileMenu: {
      control: { type: "boolean" },
      description: "Show mobile menu button",
    },
    showSearch: {
      control: { type: "boolean" },
      description: "Show search functionality",
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
    agentOnline: true,
    showAgentOrb: true,
    showSearch: true,
    navigationItems: [
      { label: "Dashboard", icon: <Home className="h-4 w-4" />, active: true },
      { label: "Practice", icon: <Target className="h-4 w-4" /> },
      { label: "Analytics", icon: <BarChart3 className="h-4 w-4" /> },
    ],
    actionItems: [
      { icon: <MessageSquare className="h-4 w-4" />, label: "AI Tutor" },
      { icon: <Bell className="h-4 w-4" />, label: "Notifications", badge: 3 },
      { icon: <Settings className="h-4 w-4" />, label: "Settings" },
    ],
  },
};

export const WithSearch: Story = {
  args: {
    showSearch: true,
    searchPlaceholder: "Search topics, questions, or concepts...",
    navigationItems: [
      { label: "Study", icon: <Book className="h-4 w-4" />, active: true },
      { label: "Practice", icon: <Target className="h-4 w-4" /> },
      { label: "Progress", icon: <BarChart3 className="h-4 w-4" /> },
    ],
  },
};

export const Minimal: Story = {
  args: {
    showAgentOrb: false,
    showSearch: false,
    title: "Segrada",
    navigationItems: [
      { label: "Home", active: true },
      { label: "About" },
      { label: "Contact" },
    ],
  },
};

export const Floating: Story = {
  args: {
    variant: "floating",
    agentOnline: true,
    showSearch: true,
    navigationItems: [
      { label: "Dashboard", active: true },
      { label: "Study Plan" },
      { label: "Resources" },
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          "Floating header variant with enhanced shadow and border styling.",
      },
    },
  },
};

export const Transparent: Story = {
  args: {
    variant: "transparent",
    showAgentOrb: true,
    showSearch: false,
  },
  parameters: {
    docs: {
      description: {
        story: "Transparent header for hero sections with backdrop blur.",
      },
    },
  },
};

export const MobileLayout: Story = {
  args: {
    showMobileMenu: true,
    showSearch: false,
    navigationItems: [
      { label: "Dashboard", active: true },
      { label: "Practice" },
      { label: "Analytics" },
    ],
  },
  parameters: {
    docs: {
      description: {
        story: "Mobile-optimized layout with hamburger menu button.",
      },
    },
  },
};

export const OfflineAgent: Story = {
  args: {
    agentOnline: false,
    showAgentOrb: true,
    showSearch: true,
    navigationItems: [
      { label: "Dashboard", active: true },
      { label: "Practice" },
    ],
  },
};

export const Compact: Story = {
  args: {
    size: "compact",
    showAgentOrb: true,
    showSearch: true,
    navigationItems: [
      { label: "Home", active: true },
      { label: "Study" },
      { label: "Test" },
    ],
  },
};

export const Expanded: Story = {
  args: {
    size: "expanded",
    showAgentOrb: true,
    showSearch: true,
    navigationItems: [
      { label: "Dashboard", active: true },
      { label: "Analytics" },
    ],
  },
};

export const WithBadges: Story = {
  args: {
    showSearch: false,
    navigationItems: [
      { label: "Dashboard", active: true, badge: "New" },
      { label: "Practice", badge: 5 },
      { label: "Messages", badge: 12 },
    ],
    actionItems: [
      { icon: <Bell className="h-4 w-4" />, badge: 7 },
      { icon: <MessageSquare className="h-4 w-4" />, badge: 3 },
    ],
  },
};

export const ReducedMotion: Story = {
  args: {
    disableAnimations: true,
    agentOnline: true,
    showSearch: true,
    navigationItems: [{ label: "Dashboard", active: true }, { label: "Study" }],
  },
};

export const CustomActions: Story = {
  args: {
    showSearch: false,
    actionItems: [
      {
        icon: <MessageSquare className="h-4 w-4" />,
        label: "Chat",
        onClick: () => alert("Open chat"),
      },
      {
        icon: <Bell className="h-4 w-4" />,
        label: "Alerts",
        badge: 2,
        onClick: () => alert("Show alerts"),
      },
      {
        icon: <Settings className="h-4 w-4" />,
        label: "Preferences",
        onClick: () => alert("Open settings"),
      },
    ],
  },
};

export const Interactive: Story = {
  args: {
    showSearch: true,
    navigationItems: [
      {
        label: "Dashboard",
        active: true,
        onClick: () => alert("Navigate to Dashboard"),
      },
      { label: "Practice", onClick: () => alert("Navigate to Practice") },
      { label: "Analytics", onClick: () => alert("Navigate to Analytics") },
    ],
    actionItems: [
      {
        icon: <MessageSquare className="h-4 w-4" />,
        onClick: () => alert("Open AI Tutor"),
      },
      {
        icon: <Bell className="h-4 w-4" />,
        onClick: () => alert("Show notifications"),
      },
      {
        icon: <Settings className="h-4 w-4" />,
        onClick: () => alert("Open settings"),
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const header = canvasElement.querySelector("header");
    if (!header) {
      throw new Error("Header not found");
    }

    // Check agent orb is present
    const agentOrb = header.querySelector("[class*='IconPulse']");
    if (!agentOrb) {
      throw new Error("Agent orb not found");
    }

    // Check search input is present
    const searchInput = header.querySelector("input");
    if (!searchInput) {
      throw new Error("Search input not found");
    }

    // Check navigation items
    const navButtons = header.querySelectorAll("button");
    if (navButtons.length < 3) {
      throw new Error("Navigation buttons not found");
    }
  },
};
