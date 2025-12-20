"use client";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import React from "react";
import { MorphingSidebar } from "../expanded/MorphingSidebar";
import type { DesktopSidebarProps } from "../types";
import { ANIMATION_CONFIG, ms } from "./animations";
import { SidebarProvider, useSidebar } from "./SidebarContext";

export const SidebarBody = (props: DesktopSidebarProps) => {
  return <DesktopSidebar {...props} />;
};

export const DesktopSidebar = ({
  className,
  children,
  shardMode = false,
  activeRealm,
  realms,
  studioDocks = [],
  socialDocks = [],
  onDockClick,
  onRealmChange,
  sessionProgress,
  ...restProps
}: DesktopSidebarProps) => {
  const { open, setOpen, animate, animationDirection } = useSidebar();

  // During animation or when open, we show the morphing panel
  // Only show pure shard when collapsed AND not animating
  if (shardMode && activeRealm) {
    return (
      <MorphingSidebar
        className={className}
        activeRealm={activeRealm}
        realms={realms}
        studioDocks={studioDocks}
        socialDocks={socialDocks}
        onDockClick={onDockClick}
        onRealmChange={onRealmChange}
        sessionProgress={sessionProgress}
      >
        {children as React.ReactNode}
      </MorphingSidebar>
    );
  }

  // Panel transition timing for non-shard mode
  const panelTransition = {
    duration: ms(
      animationDirection === "opening"
        ? ANIMATION_CONFIG.open.phase1.end
        : ANIMATION_CONFIG.close.phase4.end -
            ANIMATION_CONFIG.close.phase4.start
    ),
    ease:
      animationDirection === "opening"
        ? ANIMATION_CONFIG.easing.open
        : ANIMATION_CONFIG.easing.close,
  };

  // Non-shard mode: simple animated sidebar
  return (
    <motion.div
      className={cn(
        "h-full px-4 py-4 flex flex-col bg-neutral-100 dark:bg-neutral-800 w-[300px] shrink-0",
        className
      )}
      animate={{
        width: animate ? (open ? "300px" : "50px") : "300px",
      }}
      transition={panelTransition}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      {...(restProps as any)}
    >
      {children}
    </motion.div>
  );
};

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
      {children}
    </SidebarProvider>
  );
};
