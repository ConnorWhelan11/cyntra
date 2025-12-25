import { useState, useEffect, useMemo, useCallback } from "react";
import { getArtifactsTree } from "@/services";
import { ArtifactViewer } from "./ArtifactViewer";
import type { ArtifactNode } from "@/types";

interface ArtifactBrowserProps {
  runId: string | null;
  projectRoot: string | null;
  serverBaseUrl: string;
}

function getKindIcon(kind: string, isDir: boolean): string {
  if (isDir) return "📁";
  switch (kind) {
    case "json": return "📋";
    case "image": return "🖼️";
    case "glb": return "🎲";
    case "html": return "🌐";
    case "text": return "📄";
    default: return "📎";
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "—";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

interface TreeNodeProps {
  node: ArtifactNode;
  depth: number;
  selectedPath: string | null;
  expandedPaths: Set<string>;
  onSelect: (node: ArtifactNode) => void;
  onToggle: (path: string) => void;
}

function TreeNode({
  node,
  depth,
  selectedPath,
  expandedPaths,
  onSelect,
  onToggle,
}: TreeNodeProps) {
  const isExpanded = expandedPaths.has(node.relPath);
  const isSelected = selectedPath === node.relPath;
  const hasChildren = node.isDir && node.children.length > 0;

  const handleClick = () => {
    if (node.isDir) {
      onToggle(node.relPath);
    } else {
      onSelect(node);
    }
  };

  const handleDoubleClick = () => {
    if (!node.isDir) {
      onSelect(node);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`artifact-tree-node ${isSelected ? "selected" : ""}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        {node.isDir && (
          <span className={`artifact-tree-chevron ${isExpanded ? "expanded" : ""}`}>
            {hasChildren ? "▸" : " "}
          </span>
        )}
        <span className="artifact-tree-icon">{getKindIcon(node.kind, node.isDir)}</span>
        <span className="artifact-tree-name">{node.name}</span>
        <span className="artifact-tree-size">{formatBytes(node.sizeBytes)}</span>
      </button>
      {isExpanded && node.children.map((child) => (
        <TreeNode
          key={child.relPath}
          node={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          expandedPaths={expandedPaths}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      ))}
    </>
  );
}

/**
 * Hierarchical file browser for run artifacts.
 * Two-pane layout: tree (left) + viewer (right).
 */
export function ArtifactBrowser({
  runId,
  projectRoot,
  serverBaseUrl,
}: ArtifactBrowserProps) {
  const [tree, setTree] = useState<ArtifactNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<ArtifactNode | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set([""]));

  // Load artifact tree
  useEffect(() => {
    if (!runId || !projectRoot) {
      setTree(null);
      setSelectedNode(null);
      return;
    }

    setLoading(true);
    setError(null);

    getArtifactsTree({ projectRoot, runId })
      .then((result) => {
        setTree(result);
        // Auto-expand root
        setExpandedPaths(new Set([""]));
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [runId, projectRoot]);

  const handleToggle = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleSelect = useCallback((node: ArtifactNode) => {
    setSelectedNode(node);
  }, []);

  // Count total files
  const fileCount = useMemo(() => {
    if (!tree) return 0;
    const countFiles = (node: ArtifactNode): number => {
      if (!node.isDir) return 1;
      return node.children.reduce((sum, child) => sum + countFiles(child), 0);
    };
    return countFiles(tree);
  }, [tree]);

  if (!runId || !projectRoot) {
    return (
      <div className="artifact-browser-empty">
        <span className="artifact-browser-empty-icon">📁</span>
        <span>Select a run to browse artifacts</span>
      </div>
    );
  }

  if (!serverBaseUrl) {
    return (
      <div className="artifact-browser-loading">
        <span className="artifact-browser-loading-spinner" />
        <span>Starting local server...</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="artifact-browser-loading">
        <span className="artifact-browser-loading-spinner" />
        <span>Loading artifacts...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="artifact-browser-error">
        <span className="artifact-browser-error-icon">⚠️</span>
        <span>Failed to load: {error}</span>
      </div>
    );
  }

  if (!tree || tree.children.length === 0) {
    return (
      <div className="artifact-browser-empty">
        <span className="artifact-browser-empty-icon">📭</span>
        <span>No artifacts in this run</span>
      </div>
    );
  }

  return (
    <div className="artifact-browser">
      {/* Tree pane */}
      <div className="artifact-browser-tree">
        <div className="artifact-browser-tree-header">
          <span className="artifact-browser-tree-title">Files</span>
          <span className="artifact-browser-tree-count">{fileCount}</span>
        </div>
        <div className="artifact-browser-tree-content">
          {tree.children.map((child) => (
            <TreeNode
              key={child.relPath}
              node={child}
              depth={0}
              selectedPath={selectedNode?.relPath ?? null}
              expandedPaths={expandedPaths}
              onSelect={handleSelect}
              onToggle={handleToggle}
            />
          ))}
        </div>
      </div>

      {/* Viewer pane */}
      <div className="artifact-browser-viewer">
        <ArtifactViewer
          artifact={selectedNode}
          serverBaseUrl={serverBaseUrl}
        />
      </div>
    </div>
  );
}
