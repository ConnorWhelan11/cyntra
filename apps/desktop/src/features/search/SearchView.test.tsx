import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SearchView } from "./SearchView";

describe("SearchView", () => {
  it("should search artifacts and deep-link to a run artifact", async () => {
    const onOpenRunArtifact = vi.fn();
    const user = userEvent.setup();

    const fetchMock = vi.fn(async (input: any) => {
      const url = typeof input === "string" ? input : String(input?.url ?? input);

      if (url.endsWith("/healthz")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: "ok", version: "test" }),
        } as any;
      }

      if (url.includes("/queryHandlers/search_artifacts")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [
              {
                repo_path: ".cyntra/runs/run-test-123/terminal.log",
                run_id: "run-test-123",
                score: 0.9,
                snippet: "hello cocoindex",
              },
            ],
          }),
        } as any;
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    (globalThis as any).fetch = fetchMock;

    render(
      <SearchView
        activeProject={{
          root: "/tmp/project",
          viewer_dir: null,
          cyntra_kernel_dir: null,
          immersa_data_dir: null,
        }}
        onOpenRunArtifact={onOpenRunArtifact}
      />
    );

    await user.type(screen.getByPlaceholderText("Search artifacts…"), "hello");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await screen.findByText(".cyntra/runs/run-test-123/terminal.log");

    const openButtons = screen.getAllByRole("button", { name: "Open" });
    expect(openButtons).toHaveLength(1);
    await user.click(openButtons[0]);

    expect(onOpenRunArtifact).toHaveBeenCalledWith("run-test-123", "terminal.log");
  });
});
