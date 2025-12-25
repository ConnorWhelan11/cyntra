import { Panel } from "@/components/layout/Panel";
import { PanelHeader } from "@/components/layout/PanelHeader";
import { Button } from "@/components/ui/Button";

interface NewRunModalProps {
  isOpen: boolean;
  newRunCommand: string;
  newRunLabel: string;
  setNewRunCommand: (cmd: string) => void;
  setNewRunLabel: (label: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Modal for creating a new run
 */
export function NewRunModal({
  isOpen,
  newRunCommand,
  newRunLabel,
  setNewRunCommand,
  setNewRunLabel,
  onClose,
  onConfirm,
}: NewRunModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <Panel className="modal" onClick={(e) => e.stopPropagation()}>
        <PanelHeader
          title="New Run"
          actions={
            <Button onClick={onClose}>
              Close
            </Button>
          }
        />
        <div className="form">
          <div className="muted">Command runs in the project root and writes to `.cyntra/runs/…`.</div>
          <input
            className="text-input"
            autoFocus
            value={newRunCommand}
            onChange={(e) => setNewRunCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirm();
            }}
            placeholder="fab-gate --config …"
          />
          <input
            className="text-input"
            value={newRunLabel}
            onChange={(e) => setNewRunLabel(e.target.value)}
            placeholder="Label (optional)"
          />
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <Button onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={onConfirm}>
              Start
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
