import { Panel } from "@/components/layout/Panel";
import { PanelHeader } from "@/components/layout/PanelHeader";
import { Button } from "@/components/ui/Button";

interface ErrorBannerProps {
  error: string | null;
  onDismiss: () => void;
}

/**
 * Error banner component
 */
export function ErrorBanner({ error, onDismiss }: ErrorBannerProps) {
  if (!error) return null;

  return (
    <Panel style={{ marginBottom: 12 }}>
      <PanelHeader
        title="Error"
        actions={
          <Button onClick={onDismiss}>
            Dismiss
          </Button>
        }
      />
      <div style={{ padding: 14 }} className="muted">
        {error}
      </div>
    </Panel>
  );
}
