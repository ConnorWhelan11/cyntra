/**
 * RecentWorldsRow - Horizontal scroll of recent worlds
 *
 * Displays recent world entries with status and resume actions.
 */

import React, { useRef } from "react";
import type { RecentWorld } from "@/types";
import { RecentWorldCard } from "./RecentWorldCard";

interface RecentWorldsRowProps {
  worlds: RecentWorld[];
  onResume: (world: RecentWorld) => void;
  onRemove?: (worldId: string) => void;
}

export function RecentWorldsRow({
  worlds,
  onResume,
  onRemove,
}: RecentWorldsRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll buttons for non-touch devices
  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const scrollAmount = 280; // Card width + gap
    scrollRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  if (worlds.length === 0) {
    return null;
  }

  return (
    <section className="recent-worlds-row" aria-labelledby="recent-worlds-title">
      <div className="recent-worlds-header">
        <h2 id="recent-worlds-title" className="recent-worlds-title">
          Recent worlds
        </h2>
        <div className="recent-worlds-scroll-controls">
          <button
            onClick={() => scroll("left")}
            className="recent-worlds-scroll-btn"
            aria-label="Scroll left"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M9.78 12.78a.75.75 0 0 1-1.06 0L4.47 8.53a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 1.06L6.06 8l3.72 3.72a.75.75 0 0 1 0 1.06Z"/>
            </svg>
          </button>
          <button
            onClick={() => scroll("right")}
            className="recent-worlds-scroll-btn"
            aria-label="Scroll right"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"/>
            </svg>
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="recent-worlds-scroll"
        role="list"
        aria-label="Recent worlds list"
      >
        {worlds.map((world) => (
          <RecentWorldCard
            key={world.id}
            world={world}
            onResume={() => onResume(world)}
            onRemove={onRemove ? () => onRemove(world.id) : undefined}
          />
        ))}
      </div>
    </section>
  );
}
