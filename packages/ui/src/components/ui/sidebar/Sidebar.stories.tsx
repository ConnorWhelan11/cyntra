import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Book,
  Calendar,
  Compass,
  Flower,
  Group,
  Home,
  LayoutDashboard,
  Link2,
  MessageSquare,
  Radio,
  Settings,
  Users,
  Zap,
} from "lucide-react";
import { useState } from "react";
import {
  Sidebar,
  SidebarBody,
  SidebarFeaturedCard,
  SidebarLink,
  SidebarRealmsSection,
  SidebarSection,
  SidebarToolsSlab,
} from "./index";
import { MobileSidebar } from "./mobile/MobileSidebar";
import type { DockItem, RealmDef } from "./types";

// Dummy Data
const studioDocks: DockItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "#",
    icon: <LayoutDashboard className="h-5 w-5" />,
  },
  {
    id: "calendar",
    label: "Calendar",
    href: "#",
    icon: <Calendar className="h-5 w-5" />,
  },
  {
    id: "library",
    label: "Library",
    href: "#",
    icon: <Book className="h-5 w-5" />,
  },
];

const socialDocks: DockItem[] = [
  {
    id: "messages",
    label: "Messages",
    href: "#",
    icon: <MessageSquare className="h-5 w-5" />,
    hasActivity: true,
  },
  {
    id: "community",
    label: "Community",
    href: "#",
    icon: <Users className="h-5 w-5" />,
  },
  {
    id: "settings",
    label: "Settings",
    href: "#",
    icon: <Settings className="h-5 w-5" />,
  },
];

const realms: RealmDef[] = [
  {
    id: "outora",
    name: "Outora",
    shortName: "OUTORA",
    pixelColors: ["#06b6d4", "#3b82f6", "#8b5cf6"],
    accentColor: "cyan",
  },
  {
    id: "medica",
    name: "Medica",
    shortName: "MEDICA",
    pixelColors: ["#10b981", "#34d399", "#6ee7b7"],
    accentColor: "emerald",
  },
];

const activeRealm = realms[0];

// Wrapper component to handle state
const SidebarWrapper = (props: any) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex h-[600px] w-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
      <Sidebar open={open} setOpen={setOpen}>
        <SidebarBody {...props}>
          <div className="flex flex-col gap-2 mt-4">
            <SidebarLink
              link={{
                label: "Dashboard",
                href: "#",
                icon: <Home className="h-5 w-5" />,
              }}
            />
            <SidebarLink
              link={{
                label: "Profile",
                href: "#",
                icon: <Users className="h-5 w-5" />,
              }}
            />
            <SidebarLink
              link={{
                label: "Settings",
                href: "#",
                icon: <Settings className="h-5 w-5" />,
              }}
            />
          </div>
        </SidebarBody>
      </Sidebar>
      <div className="flex-1 p-8">
        <div className="h-full w-full rounded-lg border-2 border-dashed border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 flex items-center justify-center text-neutral-500">
          Main Content Area
        </div>
      </div>
    </div>
  );
};

const meta: Meta<typeof SidebarBody> = {
  title: "UI/Sidebar",
  component: SidebarBody,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "A versatile sidebar component that supports expanded, collapsed, and shard modes. It handles animations and state management via the SidebarContext.",
      },
    },
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="h-screen w-full flex items-center justify-center bg-neutral-100 dark:bg-neutral-950 p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SidebarBody>;

export const Default: Story = {
  render: (args) => <SidebarWrapper {...args} />,
  args: {
    activeRealm,
    realms,
    studioDocks,
    socialDocks,
  },
};

export const ShardMode: Story = {
  render: (args) => <SidebarWrapper {...args} />,
  args: {
    shardMode: true,
    activeRealm,
    realms,
    studioDocks,
    socialDocks,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Shard mode displays a compact, interactive rail when the sidebar is closed, expanding into the full menu on interaction.",
      },
    },
  },
};

export const WithActivity: Story = {
  render: (args) => <SidebarWrapper {...args} />,
  args: {
    shardMode: true,
    activeRealm,
    realms,
    studioDocks,
    socialDocks: socialDocks.map((dock) =>
      dock.id === "messages" ? { ...dock, hasActivity: true } : dock
    ),
  },
};

export const Mobile: StoryObj<typeof MobileSidebar> = {
  render: (args) => {
    return (
      <div className="relative h-[600px] w-[375px] border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden mx-auto">
        <MobileSidebar {...args} />
        <div className="h-full w-full p-4 pt-20">
          <div className="h-full w-full rounded-lg border-2 border-dashed border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 flex items-center justify-center text-neutral-500">
            Mobile Content
          </div>
        </div>
      </div>
    );
  },
  args: {
    activeRealm,
    realms,
    studioDocks,
    socialDocks,
  },
  parameters: {
    viewport: {
      defaultViewport: "mobile1",
    },
  },
};

// App Usage Story Data
const appRealmCards = [
  {
    link: {
      label: "Outora Library",
      href: "#",
      icon: (
        <div className="h-5 w-5 flex-shrink-0 rounded-full bg-teal-500/20 border border-teal-500/50" />
      ),
    },
    subtitle: "Your sanctuary of wisdom and discoveries.",
    pixelColors: ["#0f766e", "#14b8a6", "#2dd4bf", "#99f6e4"],
    accentColor: "teal" as const,
    locked: false,
  },
  {
    link: {
      label: "Astren Garden",
      href: "#",
      icon: <Flower className="h-5 w-5 flex-shrink-0" />,
    },
    subtitle: "Cultivate habits that bloom.",
    pixelColors: ["#7c3aed", "#8b5cf6", "#a78bfa", "#c4b5fd"],
    accentColor: "violet" as const,
    locked: true,
  },
  {
    link: {
      label: "Lunara Rooftop",
      href: "#",
      icon: (
        <div className="h-5 w-5 flex-shrink-0 rounded-full bg-amber-500/20 border border-amber-500/50" />
      ),
    },
    subtitle: "Reflect under the night sky.",
    pixelColors: ["#b45309", "#d97706", "#f59e0b", "#fbbf24"],
    accentColor: "amber" as const,
    locked: true,
  },
];

const appRealmDefs: RealmDef[] = [
  {
    id: "outora",
    name: "Outora Library",
    shortName: "OUTORA",
    pixelColors: ["#0f766e", "#14b8a6", "#2dd4bf", "#99f6e4"],
    accentColor: "#14b8a6",
    isLocked: false,
  },
  {
    id: "astren",
    name: "Astren Garden",
    shortName: "ASTREN",
    pixelColors: ["#7c3aed", "#8b5cf6", "#a78bfa", "#c4b5fd"],
    accentColor: "#8b5cf6",
    isLocked: true,
  },
  {
    id: "lunara",
    name: "Lunara Rooftop",
    shortName: "LUNARA",
    pixelColors: ["#b45309", "#d97706", "#f59e0b", "#fbbf24"],
    accentColor: "#f59e0b",
    isLocked: true,
  },
];

const appSidebarGroups = [
  {
    title: "Studio",
    accent: "cyan" as const,
    items: [
      {
        label: "Hyperfocus Lab",
        href: "#",
        icon: <Zap className="h-4 w-4 flex-shrink-0" />,
        hasActivity: true,
      },
      {
        label: "Broadcasts",
        href: "#",
        icon: <Radio className="h-4 w-4 flex-shrink-0" />,
        hasActivity: false,
      },
      {
        label: "Connections",
        href: "#",
        icon: <Link2 className="h-4 w-4 flex-shrink-0" />,
        hasActivity: false,
      },
    ],
  },
  {
    title: "Social",
    accent: "moonlit_orchid" as const,
    items: [
      {
        label: "Co-Conspirators",
        href: "#",
        icon: <Users className="h-4 w-4 flex-shrink-0" />,
        hasActivity: false,
      },
      {
        label: "Syndicates",
        href: "#",
        icon: <Group className="h-4 w-4 flex-shrink-0" />,
        hasActivity: false,
      },
      {
        label: "Comms",
        href: "#",
        icon: <MessageSquare className="h-4 w-4 flex-shrink-0" />,
        hasActivity: true,
      },
      {
        label: "Discover",
        href: "#",
        icon: <Compass className="h-4 w-4 flex-shrink-0" />,
        hasActivity: false,
      },
    ],
  },
];

const appStudioDocks: DockItem[] =
  appSidebarGroups
    .find((g) => g.title === "Studio")
    ?.items.map((item) => ({
      id: item.label.toLowerCase().replace(/\s+/g, "-"),
      label: item.label,
      href: item.href,
      icon: item.icon,
      hasActivity: item.hasActivity,
    })) || [];

const appSocialDocks: DockItem[] =
  appSidebarGroups
    .find((g) => g.title === "Social")
    ?.items.map((item) => ({
      id: item.label.toLowerCase().replace(/\s+/g, "-"),
      label: item.label,
      href: item.href,
      icon: item.icon,
      hasActivity: item.hasActivity,
    })) || [];

const AppUsageWrapper = (props: any) => {
  const [open, setOpen] = useState(false);
  const [activeRealmId, setActiveRealmId] = useState("outora");
  const activeRealm =
    appRealmDefs.find((r) => r.id === activeRealmId) || appRealmDefs[0];

  return (
    <div className="flex h-[800px] w-full border border-neutral-200 dark:border-neutral-800 bg-[#050609] overflow-visible text-white">
      <Sidebar open={open} setOpen={setOpen}>
        <SidebarBody
          className={`justify-between gap-10 text-white h-full pt-4 pb-24 ${
            open ? "px-3" : "px-1"
          }`}
          shardMode
          activeRealm={activeRealm}
          realms={appRealmDefs}
          studioDocks={appStudioDocks}
          socialDocks={appSocialDocks}
          onRealmChange={(realm) => setActiveRealmId(realm.id)}
          sessionProgress={0.35}
        >
          <div className="flex flex-1 flex-col overflow-visible">
            {open ? (
              <div className="flex items-center gap-3 py-1 text-xs font-display font-semibold uppercase tracking-[0.35em] text-slate-300">
                <div className="h-6 w-6 flex-shrink-0 rounded-full border border-white/20 bg-cyan-500/25 shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
                <span className="whitespace-pre font-medium text-white">
                  Out-of-Scope
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-center py-1">
                <div className="h-6 w-6 flex-shrink-0 rounded-full border border-white/20 bg-cyan-500/25 shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
              </div>
            )}
            <div className="mt-[24px] flex flex-col gap-3">
              {/* Tools Slab: Single container for Studio + Social sections */}
              <SidebarToolsSlab index={0}>
                {appSidebarGroups.map((group, groupIdx) => (
                  <div key={groupIdx} className="flex flex-col">
                    <SidebarSection
                      title={group.title}
                      accent={group.accent}
                      index={groupIdx}
                    />
                    <div className="flex flex-col gap-0.5">
                      {group.items.map((item, linkIdx) => (
                        <SidebarLink
                          key={linkIdx}
                          link={item}
                          accent={group.accent}
                          hasActivity={item.hasActivity}
                          index={groupIdx * 10 + linkIdx}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </SidebarToolsSlab>

              {/* Realms Section: Distinct portal cards */}
              <SidebarRealmsSection>
                {appRealmCards.map((realm, idx) => (
                  <SidebarFeaturedCard
                    key={idx}
                    link={realm.link}
                    title={realm.link.label}
                    subtitle={realm.subtitle}
                    pixelColors={realm.pixelColors}
                    accentColor={realm.accentColor}
                    locked={realm.locked}
                    compact
                    pixelGap={5}
                    pixelSpeed={35}
                    index={idx}
                  />
                ))}
              </SidebarRealmsSection>
            </div>
          </div>
          <div>
            <SidebarLink
              link={{
                label: "Connor",
                href: "#",
                icon: (
                  <div className="h-7 w-7 flex-shrink-0 rounded-full border border-cyan-500/40 bg-white/10 shadow-[0_0_16px_rgba(34,211,238,0.35)]" />
                ),
              }}
            />
          </div>
        </SidebarBody>
      </Sidebar>
      <div className="flex-1 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-[#050609] to-[#0a0c14]" />
        <div className="relative h-full w-full flex items-center justify-center text-neutral-500">
          App Content
        </div>
      </div>
    </div>
  );
};

export const AppUsage: Story = {
  render: (args) => <AppUsageWrapper {...args} />,
  parameters: {
    docs: {
      description: {
        story:
          "A complex example mimicking the actual application usage, featuring custom styling, modules, featured cards, and shard mode.",
      },
    },
  },
};
