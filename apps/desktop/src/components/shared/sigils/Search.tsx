import React from "react";

interface SigilProps {
  size?: number;
  className?: string;
}

/**
 * Search Sigil - Search Route
 * Archetype: "Lens"
 * A simple magnifying glass.
 */
export function Search({ size = 24, className }: SigilProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Lens */}
      <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.5" />

      {/* Handle */}
      <path d="M 15.5 15.5 L 20 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default Search;
