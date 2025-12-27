import { ReactElement } from "react";
import { render, RenderOptions } from "@testing-library/react";

/**
 * Custom render function that wraps components with providers
 * Can be extended later to include AppContext, ServerContext, etc.
 */
export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  // For now, just render directly
  // Will be extended when we create Context providers in Phase 7
  return render(ui, { ...options });
}

/**
 * Re-export everything from React Testing Library
 */
export * from "@testing-library/react";
export { renderWithProviders as render };
