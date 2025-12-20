import type { ProjectInfo } from "@/types";

type Nav = "projects" | "runs" | "terminals" | "viewer" | "kernel";

interface SidebarProps {
  nav: Nav;
  setNav: (nav: Nav) => void;
  serverInfo: { base_url: string } | null;
  activeProject: ProjectInfo | null;
}

/**
 * Application sidebar with navigation
 */
export function Sidebar({ nav, setNav, serverInfo, activeProject }: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="brand">
        <div className="brand-badge">GF</div>
        <div>
          <div className="brand-title">Glia Fab Desktop</div>
          <div className="brand-subtitle">Mission Control</div>
        </div>
      </div>

      <div className="nav">
        <button
          className={nav === "projects" ? "active" : ""}
          onClick={() => setNav("projects")}
        >
          Projects
        </button>
        <button
          className={nav === "runs" ? "active" : ""}
          onClick={() => setNav("runs")}
        >
          Runs
        </button>
        <button
          className={nav === "kernel" ? "active" : ""}
          onClick={() => setNav("kernel")}
        >
          Kernel
        </button>
        <button
          className={nav === "terminals" ? "active" : ""}
          onClick={() => setNav("terminals")}
        >
          Terminals
        </button>
        <button
          className={nav === "viewer" ? "active" : ""}
          onClick={() => setNav("viewer")}
        >
          Viewer
        </button>
      </div>

      <div style={{ marginTop: 14 }} className="muted">
        <div>Server: {serverInfo ? serverInfo.base_url : "…"}</div>
        <div>
          Active:{" "}
          {activeProject ? activeProject.root.split("/").slice(-1)[0] : "—"}
        </div>
      </div>
    </div>
  );
}
