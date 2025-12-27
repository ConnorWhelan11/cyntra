import { Panel } from "@/components/layout/Panel";
import { PanelHeader } from "@/components/layout/PanelHeader";
import { Button } from "@/components/ui/Button";

interface AddProjectModalProps {
  isOpen: boolean;
  newProjectPath: string;
  setNewProjectPath: (path: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Modal for adding a new project root
 */
export function AddProjectModal({
  isOpen,
  newProjectPath,
  setNewProjectPath,
  onClose,
  onConfirm,
}: AddProjectModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <Panel className="modal" onClick={(e) => e.stopPropagation()}>
        <PanelHeader title="Add Project" actions={<Button onClick={onClose}>Close</Button>} />
        <div className="form">
          <div className="muted">Paste the repo root path (absolute).</div>
          <input
            className="text-input"
            autoFocus
            value={newProjectPath}
            onChange={(e) => setNewProjectPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirm();
            }}
            placeholder="/Users/…/glia-fab"
          />
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={onConfirm}>
              Add
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
