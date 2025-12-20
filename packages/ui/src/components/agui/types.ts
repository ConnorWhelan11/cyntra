export type AgUiWorkspaceAction =
  | {
      action: "open_tool";
      targetId: string;
      label?: string;
      source:
        | { kind: "toast"; id: string }
        | { kind: "checkpoint_modal"; id: string; actionId: string };
    }
  | {
      action: "dismiss";
      source: { kind: "checkpoint_modal"; id: string; actionId: string };
    }
  | {
      action: "complete_step";
      targetId: string;
      source: { kind: "checkpoint_modal"; id: string; actionId: string };
    };

export type AgUiWorkspaceActionHandler = (action: AgUiWorkspaceAction) => void;

