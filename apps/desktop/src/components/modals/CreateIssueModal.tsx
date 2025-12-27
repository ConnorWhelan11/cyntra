import { Panel } from "@/components/layout/Panel";
import { PanelHeader } from "@/components/layout/PanelHeader";
import { Button } from "@/components/ui/Button";

interface CreateIssueModalProps {
  isOpen: boolean;
  newIssueTitle: string;
  newIssueDescription: string;
  newIssueTags: string;
  newIssueTagSet: Set<string>;
  newIssuePriority: string;
  newIssueToolHint: string;
  newIssueRisk: string;
  newIssueSize: string;
  setNewIssueTitle: (title: string) => void;
  setNewIssueDescription: (desc: string) => void;
  setNewIssueTags: (tags: string) => void;
  setNewIssuePriority: (priority: string) => void;
  setNewIssueToolHint: (hint: string) => void;
  setNewIssueRisk: (risk: string) => void;
  setNewIssueSize: (size: string) => void;
  parseTagsInput: (input: string) => string[];
  onClose: () => void;
  onCreate: () => void;
}

/**
 * Modal for creating a new Beads issue
 */
export function CreateIssueModal({
  isOpen,
  newIssueTitle,
  newIssueDescription,
  newIssueTags,
  newIssueTagSet,
  newIssuePriority,
  newIssueToolHint,
  newIssueRisk,
  newIssueSize,
  setNewIssueTitle,
  setNewIssueDescription,
  setNewIssueTags,
  setNewIssuePriority,
  setNewIssueToolHint,
  setNewIssueRisk,
  setNewIssueSize,
  parseTagsInput,
  onClose,
  onCreate,
}: CreateIssueModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <Panel className="modal" onClick={(e) => e.stopPropagation()}>
        <PanelHeader title="New Beads Issue" actions={<Button onClick={onClose}>Close</Button>} />
        <div className="form">
          <div className="muted">
            Creates an issue in <code>.beads/issues.jsonl</code> (file mode).
          </div>
          <input
            className="text-input"
            autoFocus
            value={newIssueTitle}
            onChange={(e) => setNewIssueTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCreate();
            }}
            placeholder="Title (what should improve?)"
          />
          <textarea
            className="text-input"
            value={newIssueDescription}
            onChange={(e) => setNewIssueDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={5}
          />
          <input
            className="text-input"
            value={newIssueTags}
            onChange={(e) => setNewIssueTags(e.target.value)}
            placeholder="Tags (comma-separated), e.g. asset:interior, gate:godot"
          />

          <div className="row" style={{ flexWrap: "wrap" }}>
            {[
              "asset:interior",
              "gate:asset-only",
              "gate:godot",
              "gate:config:interior_library_v001",
              "gate:godot-config:godot_integration_v001",
            ].map((tag) => (
              <button
                key={tag}
                className={newIssueTagSet.has(tag) ? "chip active" : "chip"}
                onClick={() => {
                  const tags = parseTagsInput(newIssueTags);
                  const existingIndex = tags.indexOf(tag);
                  if (existingIndex >= 0) {
                    tags.splice(existingIndex, 1);
                  } else {
                    tags.push(tag);
                  }
                  setNewIssueTags(tags.join(", "));
                }}
              >
                {newIssueTagSet.has(tag) ? "✓" : "+"} {tag}
              </button>
            ))}
          </div>

          <div className="grid-2">
            <div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                Priority
              </div>
              <select
                className="text-input"
                value={newIssuePriority}
                onChange={(e) => setNewIssuePriority(e.target.value)}
              >
                {["P0", "P1", "P2", "P3"].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                Tool Hint (optional)
              </div>
              <select
                className="text-input"
                value={newIssueToolHint}
                onChange={(e) => setNewIssueToolHint(e.target.value)}
              >
                <option value="">auto</option>
                <option value="codex">codex</option>
                <option value="claude">claude</option>
                <option value="opencode">opencode</option>
                <option value="crush">crush</option>
              </select>
            </div>
          </div>

          <div className="grid-2">
            <div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                Risk
              </div>
              <select
                className="text-input"
                value={newIssueRisk}
                onChange={(e) => setNewIssueRisk(e.target.value)}
              >
                {["low", "medium", "high", "critical"].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                Size
              </div>
              <select
                className="text-input"
                value={newIssueSize}
                onChange={(e) => setNewIssueSize(e.target.value)}
              >
                {["XS", "S", "M", "L", "XL"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="row" style={{ justifyContent: "flex-end" }}>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={onCreate}>
              Create
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
