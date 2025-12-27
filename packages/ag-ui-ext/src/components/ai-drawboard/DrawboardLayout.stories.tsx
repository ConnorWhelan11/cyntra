import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { Button } from "../ui/button";
import { DrawboardLayout } from "./DrawboardLayout";
import type { DrawboardToolbarProps } from "./DrawboardToolbar";
import { DrawboardCanvas, type DrawboardCanvasHandle } from "./DrawboardCanvas";
import { PremedShapesPanel } from "./premedShapes";

const sampleDiagram = `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="Welcome" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EEF2FF;fontSize=16;fontColor=#312E81;" vertex="1" parent="1"><mxGeometry x="200" y="180" width="180" height="80" as="geometry"/></mxCell><mxCell id="3" value="Canvas + Sidebar" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ECFEFF;fontColor=#0F172A" vertex="1" parent="1"><mxGeometry x="420" y="320" width="200" height="80" as="geometry"/></mxCell><mxCell id="4" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;endArrow=block;endFill=1;strokeColor=#312E81;" edge="1" parent="1" source="2" target="3"><mxGeometry relative="1" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`;

const meta: Meta<typeof DrawboardLayout> = {
  title: "AI Drawboard/DrawboardLayout",
  component: DrawboardLayout,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "High-level shell combining toolbar, canvas, and sidebar. Stories provide mocked data and callbacks—no live API calls.",
      },
    },
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

function useToolbarMocks(): DrawboardToolbarProps {
  const [activeTool, setActiveTool] = useState("select");
  return {
    activeTool,
    onToolChange: setActiveTool,
    onUndo: () => console.info("[story] undo"),
    onRedo: () => console.info("[story] redo"),
    onZoomIn: () => console.info("[story] zoom in"),
    onZoomOut: () => console.info("[story] zoom out"),
    onResetView: () => console.info("[story] reset view"),
  };
}

export const Default: Story = {
  render: () => {
    const toolbarProps = useToolbarMocks();
    return (
      <div className="h-[760px] p-6 bg-gradient-to-br from-slate-50 to-slate-100">
        <DrawboardLayout
          mode="default"
          toolbarProps={toolbarProps}
          canvasProps={{ initialXml: sampleDiagram }}
          sidebar={{
            title: "Side Panel",
            description: "Use this area for notes, chat, or metadata.",
            content: (
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• Placeholder content</li>
                <li>• No network calls</li>
                <li>• Pure client-side state</li>
              </ul>
            ),
          }}
        />
      </div>
    );
  },
};

export const LectureMode: Story = {
  render: () => {
    const toolbarProps = useToolbarMocks();
    const lectureNotes = [
      "Autonomic nervous system overview",
      "Parasympathetic vs sympathetic pathways",
      "Pharmacology interactions",
    ];
    return (
      <div className="h-[760px] p-6 bg-gradient-to-br from-indigo-50 to-slate-100">
        <DrawboardLayout
          mode="lecture"
          toolbarProps={toolbarProps}
          canvasProps={{ initialXml: sampleDiagram }}
          sidebar={{
            title: "Lecture Notes",
            description: "Capture key bullets alongside the canvas.",
            content: (
              <div className="space-y-3 text-sm">
                {lectureNotes.map((note) => (
                  <div
                    key={note}
                    className="rounded-xl border border-border/60 bg-white/70 px-3 py-2 shadow-sm"
                  >
                    {note}
                  </div>
                ))}
              </div>
            ),
          }}
        />
      </div>
    );
  },
};

export const AgentAssistMode: Story = {
  render: () => {
    const toolbarProps = useToolbarMocks();
    const suggestions = [
      "Generate respiratory flow diagram",
      "Add vitals stream panel",
      "Annotate receptors by organ system",
    ];
    const [status, setStatus] = useState("Idle");
    return (
      <div className="h-[760px] p-6 bg-gradient-to-br from-cyan-50 via-white to-emerald-50">
        <DrawboardLayout
          mode="agent"
          toolbarProps={{
            ...toolbarProps,
            onMagic: () => {
              setStatus("Thinking...");
              setTimeout(() => setStatus("Agent suggested a new diagram. (stubbed)"), 800);
            },
          }}
          canvasProps={{ initialXml: sampleDiagram }}
          sidebar={{
            title: "Agent Suggestions",
            description: "Mocked responses for Storybook demos.",
            content: (
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground">Status: {status}</div>
                {suggestions.map((item) => (
                  <div
                    key={item}
                    className="flex items-center justify-between rounded-xl border border-border/60 bg-white/80 px-3 py-2 shadow-sm"
                  >
                    <span className="text-sm text-foreground">{item}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setStatus(`Queued: ${item}`);
                        setTimeout(() => setStatus(`Applied suggestion "${item}" (stubbed)`), 700);
                      }}
                    >
                      Run
                    </Button>
                  </div>
                ))}
              </div>
            ),
          }}
        />
      </div>
    );
  },
};

export const PremedShapesMode: Story = {
  render: function PremedShapesModeRender() {
    const canvasRef = useRef<DrawboardCanvasHandle>(null);
    const [insertLog, setInsertLog] = useState<string[]>([]);

    const getDrawioRef = () => canvasRef.current?.getInstance() ?? null;

    return (
      <div className="h-[760px] p-6 bg-gradient-to-br from-purple-50 via-white to-cyan-50">
        <div className="flex h-full gap-4">
          {/* Main Canvas */}
          <div className="flex-1 flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm backdrop-blur">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <span className="rounded-full bg-purple-500/10 px-3 py-1 text-purple-400">
                Premed Mode
              </span>
              <span>Click shapes in the sidebar to insert them</span>
            </div>
            <div className="flex-1 min-h-[500px]">
              <DrawboardCanvas
                ref={canvasRef}
                initialXml={sampleDiagram}
                urlParameters={{ libraries: false, ui: "min" }}
                className="h-full"
              />
            </div>
            {insertLog.length > 0 && (
              <div className="text-xs text-muted-foreground border-t border-border/40 pt-2">
                Recent: {insertLog.slice(-3).join(", ")}
              </div>
            )}
          </div>

          {/* Premed Shapes Sidebar */}
          <div className="w-[300px] rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur">
            <PremedShapesPanel
              drawioRef={getDrawioRef()}
              onInsert={(shape) => {
                console.info("[story] Inserted shape:", shape.name);
                setInsertLog((prev) => [...prev, shape.name]);
              }}
              onInsertError={(shape, error) => {
                console.error("[story] Insert failed:", shape.name, error);
              }}
            />
          </div>
        </div>
      </div>
    );
  },
};
