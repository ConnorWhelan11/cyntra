import { useReducer, useCallback, useMemo, useEffect, useRef } from "react";
import type {
  StageWorld,
  StageState,
  GameStatus,
  ConsoleEntry,
  ConsoleFilter,
  ConsoleLogLevel,
} from "@/types/ui";

// ============================================================================
// Mock Data (Phase A - will be replaced with real data source)
// ============================================================================

const MOCK_WORLDS: StageWorld[] = [
  {
    id: "walkable_library_v0.1",
    name: "Walkable Library v0.1",
    runtime: "godot",
    status: "complete",
    generation: 12,
    fitness: 0.92,
    hasGameBuild: true,
    gamePath: "/viewer/assets/games/walkable_library_v0.1/index.html",
    updatedAt: Date.now() - 1000 * 60 * 60 * 2,
  },
  {
    id: "gothic_library_full",
    name: "Gothic Library (Full)",
    runtime: "godot",
    status: "complete",
    generation: 8,
    fitness: 0.88,
    hasGameBuild: true,
    gamePath: "/viewer/assets/games/gothic_library_full/index.html",
    updatedAt: Date.now() - 1000 * 60 * 60 * 24,
  },
  {
    id: "gothic_crossing",
    name: "Gothic Crossing",
    runtime: "godot",
    status: "complete",
    generation: 5,
    fitness: 0.85,
    hasGameBuild: true,
    gamePath: "/viewer/assets/games/gothic_crossing/index.html",
    updatedAt: Date.now() - 1000 * 60 * 60 * 48,
  },
  {
    id: "outora_library",
    name: "Outora Library",
    runtime: "godot",
    status: "building",
    generation: 15,
    fitness: 0.78,
    hasGameBuild: false,
    updatedAt: Date.now() - 1000 * 60 * 5,
  },
  {
    id: "urban_demo",
    name: "Urban Demo",
    runtime: "three",
    status: "idle",
    hasGameBuild: false,
    updatedAt: Date.now() - 1000 * 60 * 60 * 72,
  },
];

// ============================================================================
// Action Types
// ============================================================================

type StageAction =
  | { type: "SET_WORLDS"; worlds: StageWorld[] }
  | { type: "SELECT_WORLD"; id: string | null }
  | { type: "SET_GAME_URL"; url: string | null }
  | { type: "SET_GAME_STATUS"; status: GameStatus }
  | { type: "SET_ERROR"; message: string | null }
  | { type: "PLAY" }
  | { type: "STOP" }
  | { type: "RESTART" }
  | { type: "ADD_LOG"; entry: ConsoleEntry }
  | { type: "CLEAR_LOGS" }
  | { type: "TOGGLE_CONSOLE" }
  | { type: "SET_CONSOLE_OPEN"; open: boolean }
  | { type: "SET_CONSOLE_FILTER"; filter: ConsoleFilter };

// ============================================================================
// Initial State
// ============================================================================

const initialState: StageState = {
  selectedWorldId: null,
  worlds: [],
  gameUrl: null,
  gameStatus: "idle",
  errorMessage: null,
  consoleLogs: [],
  consoleOpen: true,
  consoleFilter: "all",
};

// ============================================================================
// Reducer
// ============================================================================

function stageReducer(state: StageState, action: StageAction): StageState {
  switch (action.type) {
    case "SET_WORLDS":
      return { ...state, worlds: action.worlds };

    case "SELECT_WORLD": {
      const world = state.worlds.find((w) => w.id === action.id);
      return {
        ...state,
        selectedWorldId: action.id,
        gameUrl: world?.gamePath ?? null,
        gameStatus: "idle",
        errorMessage: null,
      };
    }

    case "SET_GAME_URL":
      return { ...state, gameUrl: action.url };

    case "SET_GAME_STATUS":
      return { ...state, gameStatus: action.status };

    case "SET_ERROR":
      return {
        ...state,
        errorMessage: action.message,
        gameStatus: action.message ? "error" : state.gameStatus,
      };

    case "PLAY":
      return {
        ...state,
        gameStatus: state.gameUrl ? "loading" : "idle",
      };

    case "STOP":
      return {
        ...state,
        gameStatus: "idle",
      };

    case "RESTART":
      return {
        ...state,
        gameStatus: state.gameUrl ? "loading" : "idle",
      };

    case "ADD_LOG":
      return {
        ...state,
        consoleLogs: [...state.consoleLogs, action.entry].slice(-500), // Keep last 500
      };

    case "CLEAR_LOGS":
      return { ...state, consoleLogs: [] };

    case "TOGGLE_CONSOLE":
      return { ...state, consoleOpen: !state.consoleOpen };

    case "SET_CONSOLE_OPEN":
      return { ...state, consoleOpen: action.open };

    case "SET_CONSOLE_FILTER":
      return { ...state, consoleFilter: action.filter };

    default:
      return state;
  }
}

// ============================================================================
// Hook
// ============================================================================

export function useStageState(baseUrl?: string) {
  const [state, dispatch] = useReducer(stageReducer, initialState);
  const restartKeyRef = useRef(0);

  // Load mock worlds on mount
  useEffect(() => {
    dispatch({ type: "SET_WORLDS", worlds: MOCK_WORLDS });
  }, []);

  // Derived state
  const selectedWorld = useMemo(() => {
    if (!state.selectedWorldId) return null;
    return state.worlds.find((w) => w.id === state.selectedWorldId) ?? null;
  }, [state.worlds, state.selectedWorldId]);

  const playableWorlds = useMemo(() => {
    return state.worlds.filter((w) => w.runtime === "godot");
  }, [state.worlds]);

  const readyWorlds = useMemo(() => {
    return playableWorlds.filter((w) => w.hasGameBuild);
  }, [playableWorlds]);

  const filteredLogs = useMemo(() => {
    if (state.consoleFilter === "all") return state.consoleLogs;
    return state.consoleLogs.filter((log) => log.level === state.consoleFilter);
  }, [state.consoleLogs, state.consoleFilter]);

  const fullGameUrl = useMemo(() => {
    if (!state.gameUrl || !baseUrl) return state.gameUrl;
    return `${baseUrl}${state.gameUrl}`;
  }, [state.gameUrl, baseUrl]);

  // Actions
  const selectWorld = useCallback((id: string | null) => {
    dispatch({ type: "SELECT_WORLD", id });
  }, []);

  const play = useCallback(() => {
    dispatch({ type: "PLAY" });
  }, []);

  const stop = useCallback(() => {
    dispatch({ type: "STOP" });
  }, []);

  const restart = useCallback(() => {
    restartKeyRef.current += 1;
    dispatch({ type: "RESTART" });
  }, []);

  const setGameStatus = useCallback((status: GameStatus) => {
    dispatch({ type: "SET_GAME_STATUS", status });
  }, []);

  const setError = useCallback((message: string | null) => {
    dispatch({ type: "SET_ERROR", message });
  }, []);

  const addLog = useCallback((level: ConsoleLogLevel, message: string, source?: string) => {
    const entry: ConsoleEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      level,
      message,
      timestamp: Date.now(),
      source,
    };
    dispatch({ type: "ADD_LOG", entry });
  }, []);

  const clearLogs = useCallback(() => {
    dispatch({ type: "CLEAR_LOGS" });
  }, []);

  const toggleConsole = useCallback(() => {
    dispatch({ type: "TOGGLE_CONSOLE" });
  }, []);

  const setConsoleOpen = useCallback((open: boolean) => {
    dispatch({ type: "SET_CONSOLE_OPEN", open });
  }, []);

  const setConsoleFilter = useCallback((filter: ConsoleFilter) => {
    dispatch({ type: "SET_CONSOLE_FILTER", filter });
  }, []);

  return {
    // State
    ...state,
    restartKey: restartKeyRef.current,

    // Derived
    selectedWorld,
    playableWorlds,
    readyWorlds,
    filteredLogs,
    fullGameUrl,

    // Actions
    selectWorld,
    play,
    stop,
    restart,
    setGameStatus,
    setError,
    addLog,
    clearLogs,
    toggleConsole,
    setConsoleOpen,
    setConsoleFilter,
  };
}

export type StageStateReturn = ReturnType<typeof useStageState>;
