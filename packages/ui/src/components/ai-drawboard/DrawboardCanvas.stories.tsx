import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { Button } from "../ui/button";
import {
  DrawboardCanvas,
  type DrawboardCanvasHandle,
  type DrawboardExportFormat,
} from "./DrawboardCanvas";

const sampleDiagram = `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="Drawboard Canvas" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ECFDF3;fontColor=#065F46" vertex="1" parent="1"><mxGeometry x="200" y="140" width="200" height="80" as="geometry"/></mxCell><mxCell id="3" value="Click Export in story controls" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#E0F2FE;fontColor=#0F172A" vertex="1" parent="1"><mxGeometry x="460" y="260" width="210" height="80" as="geometry"/></mxCell><mxCell id="4" style="edgeStyle=orthogonalEdgeStyle;rounded=1;jettySize=auto;endArrow=classic;endFill=1;" edge="1" parent="1" source="2" target="3"><mxGeometry relative="1" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`;

const meta: Meta<typeof DrawboardCanvas> = {
  title: "AI Drawboard/DrawboardCanvas",
  component: DrawboardCanvas,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithExport: Story = {
  render: () => {
    const canvasRef = useRef<DrawboardCanvasHandle>(null);
    const [lastXml, setLastXml] = useState<string>("");

    const triggerExport = (format: DrawboardExportFormat = "xmlsvg") => {
      canvasRef.current?.exportDiagram(format);
    };

    return (
      <div className="h-[720px] p-6 space-y-4 bg-slate-50">
        <div className="flex items-center gap-3">
          <Button onClick={() => triggerExport("xmlsvg")}>Export XML</Button>
          <Button variant="outline" onClick={() => triggerExport("png")}>
            Export PNG (base64)
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 h-[620px] rounded-2xl border border-border/60 bg-card/80 p-2 shadow-sm">
            <DrawboardCanvas
              ref={canvasRef}
              initialXml={sampleDiagram}
              onXmlChange={setLastXml}
              onExport={({ xml }) => {
                if (xml) setLastXml(xml);
              }}
            />
          </div>
          <div className="h-[620px] rounded-2xl border border-border/60 bg-white/90 p-4 shadow-inner overflow-auto">
            <h3 className="text-sm font-semibold text-foreground mb-2">Most recent XML</h3>
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
              {lastXml || "Export to view XML here."}
            </pre>
          </div>
        </div>
      </div>
    );
  },
};

