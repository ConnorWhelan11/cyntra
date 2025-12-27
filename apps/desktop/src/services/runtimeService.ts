/**
 * Runtime Service - Godot Runtime Communication
 *
 * Provides real-time communication with running Godot games for:
 * - Objective progress tracking
 * - Trigger activation events
 * - Flag state updates
 * - Inventory changes
 *
 * Supports multiple communication methods:
 * - WebSocket (preferred for real-time)
 * - HTTP polling (fallback)
 * - Window messaging (for embedded iframes)
 */

import type { RuntimeState, TriggerEvent, InventoryItem, ObjectiveStatus } from "@/types";

export type ConnectionMethod = "websocket" | "polling" | "iframe";

export interface RuntimeMessage {
  type: "state_update" | "trigger_activated" | "objective_changed" | "flag_set" | "error";
  payload: unknown;
  timestamp: number;
}

export interface RuntimeServiceConfig {
  method: ConnectionMethod;
  wsUrl?: string;
  pollUrl?: string;
  pollInterval?: number;
  iframeSelector?: string;
}

type RuntimeEventHandler = (state: RuntimeState) => void;
type TriggerEventHandler = (triggerId: string, action: string) => void;
type ErrorEventHandler = (error: Error) => void;

const DEFAULT_CONFIG: RuntimeServiceConfig = {
  method: "iframe",
  wsUrl: "ws://localhost:9876/runtime",
  pollUrl: "http://localhost:9876/runtime/state",
  pollInterval: 1000,
  iframeSelector: ".game-frame-iframe",
};

class RuntimeService {
  private config: RuntimeServiceConfig;
  private ws: WebSocket | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isConnected = false;
  private currentState: RuntimeState | null = null;

  // Event handlers
  private stateHandlers: Set<RuntimeEventHandler> = new Set();
  private triggerHandlers: Set<TriggerEventHandler> = new Set();
  private errorHandlers: Set<ErrorEventHandler> = new Set();

  constructor(config: Partial<RuntimeServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.handleWindowMessage = this.handleWindowMessage.bind(this);
  }

  /**
   * Connect to Godot runtime
   */
  async connect(): Promise<void> {
    if (this.isConnected) return;

    switch (this.config.method) {
      case "websocket":
        await this.connectWebSocket();
        break;
      case "polling":
        await this.connectPolling();
        break;
      case "iframe":
        await this.connectIframe();
        break;
    }
  }

  /**
   * Disconnect from runtime
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.config.method === "iframe") {
      window.removeEventListener("message", this.handleWindowMessage);
    }

    this.isConnected = false;
    this.currentState = null;
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Get current runtime state
   */
  getCurrentState(): RuntimeState | null {
    return this.currentState;
  }

  /**
   * Subscribe to state updates
   */
  onStateUpdate(handler: RuntimeEventHandler): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  /**
   * Subscribe to trigger events
   */
  onTriggerActivated(handler: TriggerEventHandler): () => void {
    this.triggerHandlers.add(handler);
    return () => this.triggerHandlers.delete(handler);
  }

  /**
   * Subscribe to errors
   */
  onError(handler: ErrorEventHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  /**
   * Send a command to the runtime (e.g., set flag, complete objective)
   */
  sendCommand(command: string, payload: unknown): void {
    const message = JSON.stringify({
      type: "command",
      command,
      payload,
      timestamp: Date.now(),
    });

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else if (this.config.method === "iframe") {
      const { iframe, origin } = this.getIframeTarget();
      iframe?.contentWindow?.postMessage({ type: "fab_command", command, payload }, origin);
    }
  }

  // Private methods

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.config.wsUrl) {
        reject(new Error("WebSocket URL not configured"));
        return;
      }

      this.ws = new WebSocket(this.config.wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        resolve();
      };

      this.ws.onerror = (_event) => {
        const error = new Error("WebSocket connection failed");
        this.emitError(error);
        reject(error);
      };

      this.ws.onclose = () => {
        this.isConnected = false;
      };

      this.ws.onmessage = (event) => {
        try {
          const message: RuntimeMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch {
          this.emitError(new Error("Failed to parse message"));
        }
      };
    });
  }

  private async connectPolling(): Promise<void> {
    if (!this.config.pollUrl) {
      throw new Error("Poll URL not configured");
    }

    // Initial fetch to verify connection
    await this.fetchState();

    this.isConnected = true;
    this.pollTimer = setInterval(() => {
      this.fetchState().catch((e) => {
        this.emitError(e);
      });
    }, this.config.pollInterval!);
  }

  private async fetchState(): Promise<void> {
    const response = await fetch(this.config.pollUrl!);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const state = await response.json();
    this.updateState(state);
  }

  private async connectIframe(): Promise<void> {
    window.addEventListener("message", this.handleWindowMessage);
    this.isConnected = true;

    // Request initial state from iframe
    const { iframe, origin } = this.getIframeTarget();
    if (iframe?.contentWindow)
      iframe.contentWindow.postMessage({ type: "fab_request_state" }, origin);
  }

  private handleWindowMessage(event: MessageEvent): void {
    // Validate message source (should be from our game iframe)
    if (!event.data || typeof event.data !== "object") return;
    const { iframe } = this.getIframeTarget();
    if (iframe?.contentWindow && event.source !== iframe.contentWindow) return;

    const data = event.data as Record<string, unknown>;
    const type = data.type;
    const payload = data.payload;
    if (typeof type !== "string") return;

    switch (type) {
      case "fab_state_update":
        this.updateState(payload);
        break;
      case "fab_trigger_activated":
        if (!payload || typeof payload !== "object") return;
        {
          const payloadObj = payload as Record<string, unknown>;
          const triggerId = String(payloadObj.trigger_id ?? payloadObj.triggerId ?? "");
          const action = String(payloadObj.action ?? "activated");
          this.emitTrigger(triggerId, action);
        }
        break;
      case "fab_error":
        if (!payload || typeof payload !== "object") return;
        this.emitError(
          new Error(String((payload as Record<string, unknown>).message ?? "Runtime error"))
        );
        break;
    }
  }

  private handleMessage(message: RuntimeMessage): void {
    switch (message.type) {
      case "state_update":
        this.updateState(message.payload);
        break;
      case "trigger_activated":
        if (!message.payload || typeof message.payload !== "object") return;
        {
          const payloadObj = message.payload as Record<string, unknown>;
          const triggerId = String(payloadObj.trigger_id ?? payloadObj.triggerId ?? "");
          const action = String(payloadObj.action ?? "activated");
          this.emitTrigger(triggerId, action);
        }
        break;
      case "error":
        if (!message.payload || typeof message.payload !== "object") return;
        {
          const payloadObj = message.payload as Record<string, unknown>;
          this.emitError(new Error(String(payloadObj.message ?? "Runtime error")));
        }
        break;
    }
  }

  private updateState(rawState: unknown): void {
    const state = normalizeRuntimeState(rawState);
    if (!state) return;

    // Detect trigger activations by comparing with previous state
    if (this.currentState) {
      const prevIds = new Set(this.currentState.activated_triggers.map((t) => t.trigger_id));
      state.activated_triggers.forEach((trigger) => {
        if (!prevIds.has(trigger.trigger_id)) this.emitTrigger(trigger.trigger_id, "activated");
      });
    }

    this.currentState = state;
    this.stateHandlers.forEach((handler) => handler(state));
  }

  private emitTrigger(triggerId: string, action: string): void {
    this.triggerHandlers.forEach((handler) => handler(triggerId, action));
  }

  private emitError(error: Error): void {
    this.errorHandlers.forEach((handler) => handler(error));
  }

  private getIframeTarget(): { iframe: HTMLIFrameElement | null; origin: string } {
    const selector = this.config.iframeSelector ?? DEFAULT_CONFIG.iframeSelector!;
    const iframe = document.querySelector(selector) as HTMLIFrameElement | null;
    const origin = getPostMessageOrigin(iframe?.src);
    return { iframe, origin };
  }
}

// Singleton instance
let instance: RuntimeService | null = null;

/**
 * Get or create the runtime service instance
 */
export function getRuntimeService(config?: Partial<RuntimeServiceConfig>): RuntimeService {
  if (!instance) {
    instance = new RuntimeService(config);
  }
  return instance;
}

/**
 * Reset the runtime service (useful for testing)
 */
export function resetRuntimeService(): void {
  if (instance) {
    instance.disconnect();
    instance = null;
  }
}

/**
 * Create a mock runtime state for testing/demo purposes
 */
export function createMockRuntimeState(overrides: Partial<RuntimeState> = {}): RuntimeState {
  const now = Date.now();
  return {
    connected: true,
    objective_states: {
      explore_library: "completed",
      find_librarian: "active",
      find_key: "locked",
      open_vault: "locked",
      escape_library: "locked",
    },
    flags: {
      met_librarian: true,
      has_key: false,
      vault_open: false,
      alarm_triggered: false,
    },
    activated_triggers: [
      { trigger_id: "entrance_trigger", timestamp: now - 10_000, actions_executed: [] },
      { trigger_id: "hint_trigger", timestamp: now - 5_000, actions_executed: [] },
    ],
    inventory: [
      { item_id: "torch", quantity: 1, acquired_at: now - 60_000 },
      { item_id: "notebook", quantity: 1, acquired_at: now - 30_000 },
    ],
    play_time_seconds: 123,
    ...overrides,
  };
}

export type { RuntimeState };
export default RuntimeService;

function normalizeRuntimeState(raw: unknown): RuntimeState | null {
  if (!raw || typeof raw !== "object") return null;

  const obj = raw as Record<string, unknown>;
  const connected = typeof obj.connected === "boolean" ? obj.connected : true;

  const objective_states = isRecord(obj.objective_states) ? obj.objective_states : {};
  const flags = isRecord(obj.flags) ? obj.flags : {};

  const activated_triggers = Array.isArray(obj.activated_triggers)
    ? obj.activated_triggers
        .map((value) => normalizeTriggerEvent(value))
        .filter((value): value is TriggerEvent => Boolean(value))
    : [];

  const inventory = Array.isArray(obj.inventory)
    ? obj.inventory
        .map((value) => normalizeInventoryItem(value))
        .filter((value): value is InventoryItem => Boolean(value))
    : [];

  const play_time_seconds = typeof obj.play_time_seconds === "number" ? obj.play_time_seconds : 0;
  const current_zone = typeof obj.current_zone === "string" ? obj.current_zone : undefined;

  return {
    connected,
    objective_states: normalizeObjectiveStates(objective_states),
    flags: normalizeFlags(flags),
    activated_triggers,
    inventory,
    current_zone,
    play_time_seconds,
  };
}

function normalizeObjectiveStates(value: Record<string, unknown>): Record<string, ObjectiveStatus> {
  const entries = Object.entries(value).map(([key, status]) => [
    key,
    normalizeObjectiveStatus(status),
  ]);
  return Object.fromEntries(entries);
}

function normalizeObjectiveStatus(value: unknown): ObjectiveStatus {
  switch (value) {
    case "locked":
    case "active":
    case "completed":
    case "failed":
      return value;
    default:
      return "locked";
  }
}

function normalizeFlags(value: Record<string, unknown>): Record<string, boolean> {
  const entries = Object.entries(value).map(([key, flag]) => [key, Boolean(flag)]);
  return Object.fromEntries(entries);
}

function normalizeTriggerEvent(value: unknown): TriggerEvent | null {
  const now = Date.now();
  if (typeof value === "string") {
    return { trigger_id: value, timestamp: now, actions_executed: [] };
  }
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const trigger_id = obj.trigger_id ?? obj.triggerId;
  if (typeof trigger_id !== "string") return null;
  const timestamp = typeof obj.timestamp === "number" ? obj.timestamp : now;
  const actions_executed = Array.isArray(obj.actions_executed)
    ? obj.actions_executed.map((v) => String(v))
    : [];
  return { trigger_id, timestamp, actions_executed };
}

function normalizeInventoryItem(value: unknown): InventoryItem | null {
  const now = Date.now();
  if (typeof value === "string") {
    return { item_id: value, quantity: 1, acquired_at: now };
  }
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const item_id = obj.item_id ?? obj.itemId;
  if (typeof item_id !== "string") return null;
  const quantity = typeof obj.quantity === "number" ? obj.quantity : 1;
  const acquired_at = typeof obj.acquired_at === "number" ? obj.acquired_at : now;
  return { item_id, quantity, acquired_at };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getPostMessageOrigin(url: string | undefined): string {
  if (!url) return "*";
  try {
    return new URL(url, window.location.href).origin;
  } catch {
    return "*";
  }
}
