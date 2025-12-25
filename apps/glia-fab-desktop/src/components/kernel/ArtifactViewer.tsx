import { useState, useEffect } from "react";
import type { ArtifactNode } from "@/types";
import { stripAnsi } from "@/utils/ansi";

interface ArtifactViewerProps {
  artifact: ArtifactNode | null;
  serverBaseUrl: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function JsonViewer({ content }: { content: string }) {
  try {
    const parsed = JSON.parse(content);
    const formatted = JSON.stringify(parsed, null, 2);
    return (
      <pre className="artifact-viewer-json">
        {formatted}
      </pre>
    );
  } catch {
    return (
      <pre className="artifact-viewer-text">
        {content}
      </pre>
    );
  }
}

function TextViewer({ content }: { content: string }) {
  return (
    <pre className="artifact-viewer-text">
      {content}
    </pre>
  );
}

function ImageViewer({ url }: { url: string }) {
  return (
    <div className="artifact-viewer-image-container">
      <img
        src={url}
        alt="Artifact preview"
        className="artifact-viewer-image"
      />
    </div>
  );
}

function HtmlViewer({ url }: { url: string }) {
  return (
    <iframe
      src={url}
      className="artifact-viewer-iframe"
      title="HTML Preview"
      // Avoid `allow-same-origin` so untrusted artifact HTML can't access other local-server files.
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
    />
  );
}

function GlbViewer({ url }: { url: string }) {
  // Placeholder for 3D viewer - would use R3F in full implementation
  return (
    <div className="artifact-viewer-placeholder">
      <span className="artifact-viewer-placeholder-icon">🎲</span>
      <span className="artifact-viewer-placeholder-text">3D Model</span>
      <a
        href={url}
        download
        className="artifact-viewer-download-link"
      >
        Download GLB
      </a>
    </div>
  );
}

function DownloadViewer({ artifact, url }: { artifact: ArtifactNode; url: string }) {
  return (
    <div className="artifact-viewer-placeholder">
      <span className="artifact-viewer-placeholder-icon">📄</span>
      <span className="artifact-viewer-placeholder-text">{artifact.name}</span>
      <span className="artifact-viewer-placeholder-size">
        {formatBytes(artifact.sizeBytes)}
      </span>
      <a
        href={url}
        download
        className="artifact-viewer-download-link"
      >
        Download File
      </a>
    </div>
  );
}

/**
 * Artifact content viewer - displays appropriate viewer based on file type.
 * Supports: images, JSON, text, HTML, GLB (3D), and fallback download.
 */
export function ArtifactViewer({ artifact, serverBaseUrl }: ArtifactViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    if (!artifact || artifact.isDir || !artifact.url || !serverBaseUrl) {
      setContent(null);
      setLoading(false);
      setError(null);
      return;
    }

    // Only fetch content for text-based files
    if (artifact.kind === "json" || artifact.kind === "text") {
      setLoading(true);
      setError(null);

      const url = `${serverBaseUrl}${artifact.url}`;
      fetch(url, { cache: "no-store", signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then((text) => {
          setContent(artifact.kind === "text" ? stripAnsi(text) : text);
        })
        .catch((err) => {
          // Ignore aborts from rapid switching/unmount.
          if ((err as { name?: string } | null)?.name === "AbortError") return;
          setError(String(err));
        })
        .finally(() => setLoading(false));
    } else {
      setContent(null);
      setLoading(false);
      setError(null);
    }

    return () => controller.abort();
  }, [artifact, serverBaseUrl]);

  if (!artifact) {
    return (
      <div className="artifact-viewer-empty">
        <span className="artifact-viewer-empty-icon">📂</span>
        <span>Select a file to preview</span>
      </div>
    );
  }

  if (artifact.isDir) {
    return (
      <div className="artifact-viewer-empty">
        <span className="artifact-viewer-empty-icon">📁</span>
        <span>{artifact.name}</span>
        <span className="artifact-viewer-empty-meta">
          {artifact.children.length} items
        </span>
      </div>
    );
  }

  if (!serverBaseUrl) {
    return (
      <div className="artifact-viewer-empty">
        <span className="artifact-viewer-empty-icon">⚙️</span>
        <span>Local server not ready</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="artifact-viewer-loading">
        <span className="artifact-viewer-loading-spinner" />
        <span>Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="artifact-viewer-error">
        <span className="artifact-viewer-error-icon">⚠️</span>
        <span>Failed to load: {error}</span>
      </div>
    );
  }

  const fullUrl = artifact.url ? `${serverBaseUrl}${artifact.url}` : "";

  switch (artifact.kind) {
    case "image":
      return <ImageViewer url={fullUrl} />;
    case "json":
      return content ? <JsonViewer content={content} /> : null;
    case "text":
      return content ? <TextViewer content={content} /> : null;
    case "html":
      return <HtmlViewer url={fullUrl} />;
    case "glb":
      return <GlbViewer url={fullUrl} />;
    default:
      return <DownloadViewer artifact={artifact} url={fullUrl} />;
  }
}
