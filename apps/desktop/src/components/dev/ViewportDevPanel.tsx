import React, { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { ViewportEventEnvelope } from "@/types";
import {
  closeViewport,
  listenViewportEvents,
  loadScene,
  openViewport,
  shutdownViewport,
} from "@/services";

type PocPongPayload = {
  nonce: string;
  sent_at: number;
  received_at: number;
  pong_at: number;
  rtt_ms: number;
};

function isViewportDevPanelEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("viewportDev") === "1") return true;
    return window.localStorage.getItem("glia.viewportDev") === "1";
  } catch {
    return false;
  }
}

function formatEnvelope(envelope: ViewportEventEnvelope): string {
  const suffix =
    envelope.message_type === "Error"
      ? ` (${envelope.payload.code})`
      : envelope.message_type === "ViewportClosed"
        ? ` (${envelope.payload.reason ?? "unknown"})`
        : "";

  return `${new Date(envelope.timestamp).toLocaleTimeString()} ${envelope.message_type}${suffix}`;
}

export function ViewportDevPanel() {
  const enabled = useMemo(() => isViewportDevPanelEnabled(), []);
  const [events, setEvents] = useState<ViewportEventEnvelope[]>([]);
  const [pocPongs, setPocPongs] = useState<PocPongPayload[]>([]);
  const [scenePath, setScenePath] = useState("");
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);
  const [lastPocNonce, setLastPocNonce] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      try {
        unlisten = await listenViewportEvents((evt) => {
          setEvents((prev) => {
            const next = [evt, ...prev];
            return next.slice(0, 200);
          });
        });
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      try {
        unlisten = await listen<PocPongPayload>("poc:pong", (event) => {
          setPocPongs((prev) => {
            const next = [event.payload, ...prev];
            return next.slice(0, 50);
          });
        });
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        width: 520,
        maxWidth: "calc(100vw - 24px)",
        maxHeight: "calc(100vh - 24px)",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 12,
        background: "rgba(8,10,14,0.92)",
        backdropFilter: "blur(8px)",
        color: "rgba(255,255,255,0.9)",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          padding: 10,
          borderBottom: "1px solid rgba(255,255,255,0.10)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.85 }}>Viewport Dev</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            style={buttonStyle}
            onClick={async () => {
              setError(null);
              try {
                const req = await openViewport({ fresh: false });
                setLastRequestId(req);
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            Open
          </button>
          <button
            style={buttonStyle}
            onClick={async () => {
              setError(null);
              try {
                const req = await closeViewport({ unload: false });
                setLastRequestId(req);
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            Close
          </button>
          <button
            style={buttonStyle}
            onClick={async () => {
              setError(null);
              try {
                const req = await shutdownViewport({ reason: "user_request", deadline_ms: 5000 });
                setLastRequestId(req);
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            Shutdown
          </button>
          <button
            style={buttonStyle}
            onClick={() => {
              setEvents([]);
              setError(null);
              setLastRequestId(null);
            }}
          >
            Clear
          </button>
        </div>
      </div>

      <div style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.85 }}>Spike A: Multi-Window PoC</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={buttonStyle}
              onClick={async () => {
                setError(null);
                try {
                  const nonce = await invoke<string>("poc_open_viewport_poc_window");
                  setLastPocNonce(nonce);
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              Open Window
            </button>
            <button
              style={buttonStyle}
              onClick={async () => {
                setError(null);
                try {
                  const nonce = await invoke<string>("poc_ping_viewport_poc_window");
                  setLastPocNonce(nonce);
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              Ping
            </button>
            <button
              style={buttonStyle}
              onClick={async () => {
                setError(null);
                try {
                  await invoke("poc_close_viewport_poc_window");
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              Close Window
            </button>
          </div>
        </div>
        {lastPocNonce && (
          <div style={{ marginTop: 8, fontSize: 11, opacity: 0.9 }}>
            last ping nonce: {lastPocNonce}
          </div>
        )}
        {pocPongs.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 11, opacity: 0.9 }}>
            last pong rtt: {pocPongs[0].rtt_ms}ms
          </div>
        )}
      </div>

      <div style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={scenePath}
            onChange={(e) => setScenePath(e.target.value)}
            placeholder="LoadScene path (e.g. /abs/path/to/model.glb)"
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.25)",
              color: "rgba(255,255,255,0.9)",
              outline: "none",
              fontSize: 12,
            }}
          />
          <button
            style={buttonStyle}
            onClick={async () => {
              setError(null);
              try {
                const req = await loadScene(scenePath);
                setLastRequestId(req);
              } catch (e) {
                setError(String(e));
              }
            }}
            disabled={!scenePath.trim()}
          >
            LoadScene
          </button>
        </div>
        {(error || lastRequestId) && (
          <div style={{ marginTop: 8, fontSize: 11, opacity: 0.9 }}>
            {lastRequestId && <div>last request_id: {lastRequestId}</div>}
            {error && <div style={{ color: "rgba(255,120,120,0.95)" }}>{error}</div>}
          </div>
        )}
      </div>

      <div style={{ padding: 10, overflow: "auto", maxHeight: 420 }}>
        {events.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.7 }}>No viewport events yet.</div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 12 }}>
            {events.map((evt, idx) => {
              const isMatch = lastRequestId && evt.request_id === lastRequestId;
              return (
                <li
                  key={`${evt.message_id}-${idx}`}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 8,
                    marginBottom: 6,
                    background: isMatch ? "rgba(100,180,255,0.15)" : "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ opacity: 0.95 }}>{formatEnvelope(evt)}</div>
                    <div style={{ opacity: 0.55 }}>{evt.request_id ?? "—"}</div>
                  </div>
                  <details style={{ marginTop: 6, opacity: 0.9 }}>
                    <summary style={{ cursor: "pointer", opacity: 0.75 }}>payload</summary>
                    <pre
                      style={{
                        margin: "8px 0 0 0",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontSize: 11,
                        opacity: 0.85,
                      }}
                    >
                      {JSON.stringify(evt.payload, null, 2)}
                    </pre>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pocPongs.length > 0 && (
        <div style={{ padding: 10, borderTop: "1px solid rgba(255,255,255,0.10)" }}>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>PoC pong log</div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 11, opacity: 0.9 }}>
            {pocPongs.map((pong) => (
              <li
                key={pong.nonce}
                style={{
                  padding: "6px 8px",
                  borderRadius: 8,
                  marginBottom: 6,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ opacity: 0.95 }}>
                    {new Date(pong.pong_at).toLocaleTimeString()} pong rtt={pong.rtt_ms}ms
                  </div>
                  <div style={{ opacity: 0.55 }}>{pong.nonce}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.9)",
  fontSize: 12,
  cursor: "pointer",
};
