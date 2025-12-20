"use client";

import React from "react";
import { ConsoleHtml } from "./ConsoleHtml";
import { DripPlane } from "./DripPlane";
import { FocusConstellation } from "./FocusConstellation";
import { GlyphAvatar } from "./GlyphAvatar";
import { TodayLensBand } from "./TodayLensBand";
import type { GlyphConsole3DProps } from "./types";

export const GlyphConsole3D: React.FC<GlyphConsole3DProps> = ({
  // phase, // Not currently used in console view
  htmlPortal,
  todaySummary,
  constellationNodes,
  glyphState,
  isTyping,
  recentExchanges,
  onPromptSubmit,
  onNodeClick,
  onTodayClick,
}) => {
  return (
    <>
      {/* Drip plane behind console */}
      <DripPlane intensity={isTyping ? 1.5 : 0.6} />

      {/* Focus constellation ring behind/around console */}
      <FocusConstellation
        nodes={constellationNodes}
        onNodeClick={onNodeClick}
      />

      {/* Glyph avatar hovering near console */}
      <GlyphAvatar glyphState={glyphState} />

      {/* Today Lens band above console */}
      <TodayLensBand
        todaySummary={todaySummary}
        onClick={onTodayClick}
        htmlPortal={htmlPortal}
      />

      {/* Console HTML in center */}
      <ConsoleHtml
        recentExchanges={recentExchanges}
        glyphState={glyphState}
        onSubmit={onPromptSubmit}
        htmlPortal={htmlPortal}
      />
    </>
  );
};
