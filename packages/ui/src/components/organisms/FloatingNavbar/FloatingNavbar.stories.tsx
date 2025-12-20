import type { Meta, StoryObj } from "@storybook/react-vite";
import { FloatingNav } from "./FloatingNavbar";
import { Home, User, MessageCircle } from "lucide-react";

const meta = {
  title: "Organisms/FloatingNavbar",
  component: FloatingNav,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof FloatingNav>;

export default meta;
type Story = StoryObj<typeof meta>;

const navItems = [
  {
    name: "Home",
    link: "/",
    icon: <Home className="h-4 w-4 text-neutral-500 dark:text-white" />,
  },
  {
    name: "About",
    link: "/about",
    icon: <User className="h-4 w-4 text-neutral-500 dark:text-white" />,
  },
  {
    name: "Contact",
    link: "/contact",
    icon: <MessageCircle className="h-4 w-4 text-neutral-500 dark:text-white" />,
  },
];

export const Default: Story = {
  args: {
    navItems: navItems,
  },
  render: (args) => (
    <div className="relative w-full">
      <FloatingNav {...args} />
      <div className="h-[150vh] w-full bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center flex-col pt-32">
        <p className="text-2xl mb-8">Scroll down to reveal the navbar</p>
        <div className="w-full max-w-2xl p-4 space-y-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="h-32 w-full bg-white dark:bg-black rounded-lg shadow-sm"
            />
          ))}
        </div>
      </div>
    </div>
  ),
};

