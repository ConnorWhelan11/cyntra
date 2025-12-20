"use client";

import { cn, prefersReducedMotion } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "framer-motion";
import {
  Bell,
  Book,
  Bot,
  Menu,
  MessageSquare,
  Search,
  Settings,
} from "lucide-react";
import * as React from "react";
import { GlowButton } from "../../atoms/GlowButton";
import { IconPulse } from "../../atoms/IconPulse";
import { ModeToggle } from "../../atoms/ModeToggle";

const headerVariants = cva(
  "sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60",
  {
    variants: {
      variant: {
        default: "",
        floating: "shadow-lg border-border/20",
        transparent: "border-transparent bg-transparent backdrop-blur-0",
      },
      size: {
        default: "h-14",
        compact: "h-12",
        expanded: "h-16",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface HeaderProps
  extends Omit<
      React.HTMLAttributes<HTMLElement>,
      | "children"
      | "onDrag"
      | "onDragEnd"
      | "onDragEnter"
      | "onDragExit"
      | "onDragLeave"
      | "onDragOver"
      | "onDragStart"
      | "onDrop"
      | "onAnimationStart"
      | "onAnimationEnd"
      | "onAnimationIteration"
    >,
    VariantProps<typeof headerVariants> {
  /** Agent online status */
  agentOnline?: boolean;
  /** Agent name */
  agentName?: string;
  /** Show agent orb */
  showAgentOrb?: boolean;
  /** Navigation items */
  navigationItems?: Array<{
    label: string;
    href?: string;
    icon?: React.ReactNode;
    onClick?: () => void;
    active?: boolean;
    badge?: string | number;
  }>;
  /** Action items (right side) */
  actionItems?: Array<{
    icon: React.ReactNode;
    label?: string;
    onClick?: () => void;
    badge?: string | number;
    variant?: "default" | "ghost";
  }>;
  /** Show mobile menu button */
  showMobileMenu?: boolean;
  /** Mobile menu open state */
  mobileMenuOpen?: boolean;
  /** Mobile menu toggle callback */
  onMobileMenuToggle?: () => void;
  /** Search functionality */
  showSearch?: boolean;
  /** Search placeholder */
  searchPlaceholder?: string;
  /** Search value */
  searchValue?: string;
  /** Search onChange callback */
  onSearchChange?: (value: string) => void;
  /** Search onSubmit callback */
  onSearchSubmit?: (value: string) => void;
  /** Disable animations */
  disableAnimations?: boolean;
  /** Logo/brand element */
  logo?: React.ReactNode;
  /** Title */
  title?: string;
}

export function Header({
  className,
  variant,
  size,
  agentOnline = true,
  agentName = "AI Study Tutor",
  showAgentOrb = true,
  navigationItems = [],
  actionItems = [],
  showMobileMenu = false,
  mobileMenuOpen = false,
  onMobileMenuToggle,
  showSearch = false,
  searchPlaceholder = "Search topics, questions...",
  searchValue = "",
  onSearchChange,
  onSearchSubmit,
  disableAnimations = false,
  logo,
  title = "Segrada Medica",
  ...props
}: HeaderProps) {
  const [searchFocused, setSearchFocused] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const reducedMotion = prefersReducedMotion();
  const shouldAnimate = !disableAnimations && !reducedMotion;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim() && onSearchSubmit) {
      onSearchSubmit(searchValue.trim());
    }
  };

  const defaultActionItems = [
    {
      icon: <MessageSquare className="h-4 w-4" />,
      label: "AI Tutor",
      onClick: () => console.log("Open AI Tutor"),
    },
    {
      icon: <Bell className="h-4 w-4" />,
      label: "Notifications",
      badge: 3,
      onClick: () => console.log("Open notifications"),
    },
    {
      icon: <Settings className="h-4 w-4" />,
      label: "Settings",
      onClick: () => console.log("Open settings"),
    },
  ];

  const finalActionItems =
    actionItems.length > 0 ? actionItems : defaultActionItems;

  return (
    <header
      className={cn(headerVariants({ variant, size }), className)}
      {...props}
    >
      <div className="container flex h-full items-center justify-between px-4">
        {/* Left section - Logo/Title and Agent */}
        <div className="flex items-center gap-4">
          {/* Mobile menu button */}
          {showMobileMenu && (
            <GlowButton
              variant="ghost"
              size="sm"
              glow="none"
              onClick={onMobileMenuToggle}
              className="md:hidden"
            >
              <Menu className="h-4 w-4" />
            </GlowButton>
          )}

          {/* Logo/Title */}
          <div className="flex items-center gap-3">
            {logo || (
              <motion.div
                className="flex items-center gap-2"
                initial={shouldAnimate ? { opacity: 0, x: -20 } : {}}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: shouldAnimate ? 0.3 : 0 }}
              >
                <div className="h-8 w-8 rounded-lg bg-cyan-neon/10 flex items-center justify-center">
                  <Book className="h-4 w-4 text-cyan-neon" />
                </div>
                <span className="font-semibold text-foreground hidden sm:block">
                  {title}
                </span>
              </motion.div>
            )}
          </div>

          {/* Agent Orb */}
          {showAgentOrb && (
            <motion.div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card/40 border border-border/20"
              initial={shouldAnimate ? { opacity: 0, scale: 0.8 } : {}}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: shouldAnimate ? 0.4 : 0, delay: 0.1 }}
            >
              <div className="relative">
                <IconPulse
                  icon={<Bot className="h-4 w-4" />}
                  variant="accent"
                  intensity={agentOnline ? "medium" : "none"}
                  pulse={agentOnline}
                  size="sm"
                  className="rounded-full bg-cyan-neon/10 p-1"
                />
                {agentOnline && (
                  <motion.div
                    className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-neon shadow-neon-emerald"
                    animate={{
                      scale: [1, 1.2, 1],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                )}
              </div>
              <div className="hidden sm:block">
                <div className="text-xs font-medium text-foreground">
                  {agentName}
                </div>
                <div className="text-xs text-muted-foreground">
                  {agentOnline ? "Online" : "Offline"}
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Center section - Navigation or Search */}
        <div className="flex-1 max-w-md mx-4">
          {showSearch ? (
            <motion.form
              onSubmit={handleSearchSubmit}
              className="relative"
              initial={shouldAnimate ? { opacity: 0, y: -10 } : {}}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: shouldAnimate ? 0.3 : 0, delay: 0.2 }}
            >
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder={searchPlaceholder}
                  value={searchValue}
                  onChange={(e) => onSearchChange?.(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  className={cn(
                    "w-full rounded-lg border border-border/40 bg-card/40 py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-cyan-neon/40 focus:outline-none focus:ring-1 focus:ring-cyan-neon/20 transition-colors",
                    searchFocused &&
                      "border-cyan-neon/40 ring-1 ring-cyan-neon/20"
                  )}
                />
                {searchValue && (
                  <motion.button
                    type="button"
                    onClick={() => {
                      onSearchChange?.("");
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    initial={shouldAnimate ? { opacity: 0, scale: 0.8 } : {}}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={shouldAnimate ? { opacity: 0, scale: 0.8 } : {}}
                    transition={{ duration: shouldAnimate ? 0.2 : 0 }}
                  >
                    ×
                  </motion.button>
                )}
              </div>
            </motion.form>
          ) : (
            /* Navigation items */
            <nav className="hidden md:flex items-center gap-1">
              {navigationItems.map((item, index) => (
                <motion.div
                  key={item.label}
                  initial={shouldAnimate ? { opacity: 0, y: -10 } : {}}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: shouldAnimate ? 0.3 : 0,
                    delay: shouldAnimate ? 0.1 * index : 0,
                  }}
                >
                  <GlowButton
                    variant={item.active ? "default" : "ghost"}
                    size="sm"
                    glow={item.active ? "low" : "none"}
                    onClick={item.onClick}
                    className="relative"
                  >
                    {item.icon}
                    <span className="ml-2">{item.label}</span>
                    {item.badge && (
                      <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground flex items-center justify-center">
                        {typeof item.badge === "number" && item.badge > 9
                          ? "9+"
                          : item.badge}
                      </span>
                    )}
                  </GlowButton>
                </motion.div>
              ))}
            </nav>
          )}
        </div>

        {/* Right section - Actions and Theme Toggle */}
        <div className="flex items-center gap-2">
          {/* Action items */}
          {finalActionItems.map((item, index) => (
            <motion.div
              key={item.label || index}
              initial={shouldAnimate ? { opacity: 0, x: 10 } : {}}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: shouldAnimate ? 0.3 : 0,
                delay: shouldAnimate ? 0.1 * index : 0,
              }}
            >
              <GlowButton
                variant={(item as any).variant || "ghost"}
                size="sm"
                glow="none"
                onClick={item.onClick}
                className="relative"
                title={item.label}
              >
                {item.icon}
                {item.badge && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground flex items-center justify-center">
                    {typeof item.badge === "number" && item.badge > 9
                      ? "9+"
                      : item.badge}
                  </span>
                )}
              </GlowButton>
            </motion.div>
          ))}

          {/* Theme toggle */}
          <motion.div
            initial={shouldAnimate ? { opacity: 0, x: 10 } : {}}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: shouldAnimate ? 0.3 : 0,
              delay: shouldAnimate ? 0.3 : 0,
            }}
          >
            <ModeToggle />
          </motion.div>
        </div>
      </div>
    </header>
  );
}
