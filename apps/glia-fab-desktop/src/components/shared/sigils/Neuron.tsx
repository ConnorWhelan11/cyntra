import React from "react";

interface SigilProps {
  size?: number;
  className?: string;
}

/**
 * Neuron Sigil - Memory Route
 * Archetype: "Synaptic Web"
 * Central circle with 3 branching dendrites (2 upper, 1 lower),
 * each terminating in small nodes
 */
export function Neuron({ size = 24, className }: SigilProps) {
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
      {/* Central soma (cell body) */}
      <circle
        cx="12"
        cy="12"
        r="3"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />

      {/* Upper-left dendrite */}
      <path
        d="M 9.5 9.5 L 6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="5" cy="5" r="1.5" fill="currentColor" />

      {/* Upper-right dendrite */}
      <path
        d="M 14.5 9.5 L 18 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="19" cy="5" r="1.5" fill="currentColor" />

      {/* Lower axon (single, longer) */}
      <path
        d="M 12 15 L 12 19"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="12" cy="20" r="1.5" fill="currentColor" />

      {/* Additional small dendrite branches */}
      <path
        d="M 6 6 L 4 4"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path
        d="M 6 6 L 6 3"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path
        d="M 18 6 L 20 4"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path
        d="M 18 6 L 18 3"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default Neuron;
