/**
 * GameplayContext - Global state management for Gameplay UI
 *
 * Provides:
 * - Loaded gameplay config from gameplay.yaml
 * - Validation report (marker matching)
 * - Runtime state (objectives, flags, triggers)
 * - UI state (selected entities, active tab)
 * - Dirty state tracking for unsaved changes
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  type ReactNode,
} from 'react';
import type {
  GameplayConfig,
  ValidationReport,
  RuntimeState,
  GameplayTab,
  GameplayUIState,
  EntityConfig,
  TriggerConfig,
  ObjectiveConfig,
  InteractionConfig,
} from '@/types';
import {
  loadGameplay,
  saveGameplay,
  validateGameplay,
  createEmptyGameplayConfig,
} from '@/services/gameplayService';

// =============================================================================
// State Types
// =============================================================================

interface GameplayState {
  // Data state
  config: GameplayConfig | null;
  validationReport: ValidationReport | null;
  runtimeState: RuntimeState | null;

  // Loading/error state
  isLoading: boolean;
  isSaving: boolean;
  isValidating: boolean;
  error: string | null;

  // Track changes
  isDirty: boolean;
  worldPath: string | null;

  // UI state
  ui: GameplayUIState;
}

const initialUIState: GameplayUIState = {
  activeTab: 'entities',
  selectedEntityId: null,
  selectedTriggerId: null,
  selectedObjectiveId: null,
  selectedInteractionId: null,
  expandedSections: ['npcs', 'items'],
  showRuntimeMonitor: false,
  showValidationPanel: true,
};

const initialState: GameplayState = {
  config: null,
  validationReport: null,
  runtimeState: null,
  isLoading: false,
  isSaving: false,
  isValidating: false,
  error: null,
  isDirty: false,
  worldPath: null,
  ui: initialUIState,
};

// =============================================================================
// Actions
// =============================================================================

type GameplayAction =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; payload: { config: GameplayConfig; worldPath: string } }
  | { type: 'LOAD_ERROR'; payload: string }
  | { type: 'SAVE_START' }
  | { type: 'SAVE_SUCCESS' }
  | { type: 'SAVE_ERROR'; payload: string }
  | { type: 'VALIDATE_START' }
  | { type: 'VALIDATE_SUCCESS'; payload: ValidationReport }
  | { type: 'VALIDATE_ERROR'; payload: string }
  | { type: 'UPDATE_CONFIG'; payload: Partial<GameplayConfig> }
  | { type: 'UPDATE_ENTITY'; payload: { id: string; entity: EntityConfig } }
  | { type: 'DELETE_ENTITY'; payload: string }
  | { type: 'UPDATE_TRIGGER'; payload: { id: string; trigger: TriggerConfig } }
  | { type: 'DELETE_TRIGGER'; payload: string }
  | { type: 'UPDATE_OBJECTIVE'; payload: { index: number; objective: ObjectiveConfig } }
  | { type: 'DELETE_OBJECTIVE'; payload: number }
  | { type: 'ADD_OBJECTIVE'; payload: ObjectiveConfig }
  | { type: 'UPDATE_INTERACTION'; payload: { id: string; interaction: InteractionConfig } }
  | { type: 'DELETE_INTERACTION'; payload: string }
  | { type: 'SET_RUNTIME_STATE'; payload: RuntimeState }
  | { type: 'SET_UI_STATE'; payload: Partial<GameplayUIState> }
  | { type: 'SELECT_ENTITY'; payload: string | null }
  | { type: 'SELECT_TRIGGER'; payload: string | null }
  | { type: 'SELECT_OBJECTIVE'; payload: string | null }
  | { type: 'SELECT_INTERACTION'; payload: string | null }
  | { type: 'SET_ACTIVE_TAB'; payload: GameplayTab }
  | { type: 'TOGGLE_SECTION'; payload: string }
  | { type: 'RESET' }
  | { type: 'CLEAR_ERROR' };

// =============================================================================
// Reducer
// =============================================================================

function gameplayReducer(state: GameplayState, action: GameplayAction): GameplayState {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, isLoading: true, error: null };

    case 'LOAD_SUCCESS':
      return {
        ...state,
        isLoading: false,
        config: action.payload.config,
        worldPath: action.payload.worldPath,
        isDirty: false,
        error: null,
      };

    case 'LOAD_ERROR':
      return { ...state, isLoading: false, error: action.payload };

    case 'SAVE_START':
      return { ...state, isSaving: true, error: null };

    case 'SAVE_SUCCESS':
      return { ...state, isSaving: false, isDirty: false };

    case 'SAVE_ERROR':
      return { ...state, isSaving: false, error: action.payload };

    case 'VALIDATE_START':
      return { ...state, isValidating: true };

    case 'VALIDATE_SUCCESS':
      return { ...state, isValidating: false, validationReport: action.payload };

    case 'VALIDATE_ERROR':
      return { ...state, isValidating: false, error: action.payload };

    case 'UPDATE_CONFIG':
      if (!state.config) return state;
      return {
        ...state,
        config: { ...state.config, ...action.payload },
        isDirty: true,
      };

    case 'UPDATE_ENTITY':
      if (!state.config) return state;
      return {
        ...state,
        config: {
          ...state.config,
          entities: {
            ...state.config.entities,
            [action.payload.id]: action.payload.entity,
          },
        },
        isDirty: true,
      };

    case 'DELETE_ENTITY': {
      if (!state.config) return state;
      const { [action.payload]: _, ...remainingEntities } = state.config.entities;
      return {
        ...state,
        config: { ...state.config, entities: remainingEntities },
        isDirty: true,
        ui: {
          ...state.ui,
          selectedEntityId:
            state.ui.selectedEntityId === action.payload ? null : state.ui.selectedEntityId,
        },
      };
    }

    case 'UPDATE_TRIGGER':
      if (!state.config) return state;
      return {
        ...state,
        config: {
          ...state.config,
          triggers: {
            ...state.config.triggers,
            [action.payload.id]: action.payload.trigger,
          },
        },
        isDirty: true,
      };

    case 'DELETE_TRIGGER': {
      if (!state.config) return state;
      const { [action.payload]: __, ...remainingTriggers } = state.config.triggers;
      return {
        ...state,
        config: { ...state.config, triggers: remainingTriggers },
        isDirty: true,
        ui: {
          ...state.ui,
          selectedTriggerId:
            state.ui.selectedTriggerId === action.payload ? null : state.ui.selectedTriggerId,
        },
      };
    }

    case 'UPDATE_OBJECTIVE': {
      if (!state.config) return state;
      const updatedObjectives = [...state.config.objectives];
      updatedObjectives[action.payload.index] = action.payload.objective;
      return {
        ...state,
        config: { ...state.config, objectives: updatedObjectives },
        isDirty: true,
      };
    }

    case 'DELETE_OBJECTIVE':
      if (!state.config) return state;
      return {
        ...state,
        config: {
          ...state.config,
          objectives: state.config.objectives.filter((_, i) => i !== action.payload),
        },
        isDirty: true,
      };

    case 'ADD_OBJECTIVE':
      if (!state.config) return state;
      return {
        ...state,
        config: {
          ...state.config,
          objectives: [...state.config.objectives, action.payload],
        },
        isDirty: true,
      };

    case 'UPDATE_INTERACTION':
      if (!state.config) return state;
      return {
        ...state,
        config: {
          ...state.config,
          interactions: {
            ...state.config.interactions,
            [action.payload.id]: action.payload.interaction,
          },
        },
        isDirty: true,
      };

    case 'DELETE_INTERACTION': {
      if (!state.config) return state;
      const { [action.payload]: ___, ...remainingInteractions } = state.config.interactions;
      return {
        ...state,
        config: { ...state.config, interactions: remainingInteractions },
        isDirty: true,
        ui: {
          ...state.ui,
          selectedInteractionId:
            state.ui.selectedInteractionId === action.payload
              ? null
              : state.ui.selectedInteractionId,
        },
      };
    }

    case 'SET_RUNTIME_STATE':
      return { ...state, runtimeState: action.payload };

    case 'SET_UI_STATE':
      return { ...state, ui: { ...state.ui, ...action.payload } };

    case 'SELECT_ENTITY':
      return {
        ...state,
        ui: { ...state.ui, selectedEntityId: action.payload, activeTab: 'entities' },
      };

    case 'SELECT_TRIGGER':
      return {
        ...state,
        ui: { ...state.ui, selectedTriggerId: action.payload, activeTab: 'triggers' },
      };

    case 'SELECT_OBJECTIVE':
      return {
        ...state,
        ui: { ...state.ui, selectedObjectiveId: action.payload, activeTab: 'objectives' },
      };

    case 'SELECT_INTERACTION':
      return {
        ...state,
        ui: { ...state.ui, selectedInteractionId: action.payload, activeTab: 'interactions' },
      };

    case 'SET_ACTIVE_TAB':
      return { ...state, ui: { ...state.ui, activeTab: action.payload } };

    case 'TOGGLE_SECTION': {
      const sections = state.ui.expandedSections;
      const isExpanded = sections.includes(action.payload);
      return {
        ...state,
        ui: {
          ...state.ui,
          expandedSections: isExpanded
            ? sections.filter((s) => s !== action.payload)
            : [...sections, action.payload],
        },
      };
    }

    case 'RESET':
      return initialState;

    case 'CLEAR_ERROR':
      return { ...state, error: null };

    default:
      return state;
  }
}

// =============================================================================
// Context
// =============================================================================

interface GameplayContextValue {
  state: GameplayState;

  // Loading/Saving
  loadConfig: (worldPath: string) => Promise<void>;
  saveConfig: () => Promise<void>;
  validate: () => Promise<void>;
  createNew: (worldId: string, worldPath: string) => void;

  // Entity operations
  updateEntity: (id: string, entity: EntityConfig) => void;
  deleteEntity: (id: string) => void;
  addEntity: (id: string, entity: EntityConfig) => void;

  // Trigger operations
  updateTrigger: (id: string, trigger: TriggerConfig) => void;
  deleteTrigger: (id: string) => void;
  addTrigger: (id: string, trigger: TriggerConfig) => void;

  // Objective operations
  updateObjective: (index: number, objective: ObjectiveConfig) => void;
  deleteObjective: (index: number) => void;
  addObjective: (objective: ObjectiveConfig) => void;

  // Interaction operations
  updateInteraction: (id: string, interaction: InteractionConfig) => void;
  deleteInteraction: (id: string) => void;
  addInteraction: (id: string, interaction: InteractionConfig) => void;

  // UI operations
  selectEntity: (id: string | null) => void;
  selectTrigger: (id: string | null) => void;
  selectObjective: (id: string | null) => void;
  selectInteraction: (id: string | null) => void;
  setActiveTab: (tab: GameplayTab) => void;
  toggleSection: (section: string) => void;

  // Runtime
  setRuntimeState: (state: RuntimeState) => void;

  // Helpers
  clearError: () => void;
  reset: () => void;

  // Computed values
  entityCount: number;
  npcCount: number;
  itemCount: number;
  triggerCount: number;
  objectiveCount: number;
  interactionCount: number;
  audioZoneCount: number;
  isValid: boolean;
}

const GameplayContext = createContext<GameplayContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

interface GameplayProviderProps {
  children: ReactNode;
}

export function GameplayProvider({ children }: GameplayProviderProps) {
  const [state, dispatch] = useReducer(gameplayReducer, initialState);

  // Load config from world path
  const loadConfig = useCallback(async (worldPath: string) => {
    dispatch({ type: 'LOAD_START' });
    try {
      const config = await loadGameplay(worldPath);
      dispatch({ type: 'LOAD_SUCCESS', payload: { config, worldPath } });
    } catch (err) {
      dispatch({ type: 'LOAD_ERROR', payload: String(err) });
    }
  }, []);

  // Save config to file
  const saveConfig = useCallback(async () => {
    if (!state.config || !state.worldPath) return;
    dispatch({ type: 'SAVE_START' });
    try {
      await saveGameplay(state.worldPath, state.config);
      dispatch({ type: 'SAVE_SUCCESS' });
    } catch (err) {
      dispatch({ type: 'SAVE_ERROR', payload: String(err) });
    }
  }, [state.config, state.worldPath]);

  // Validate against markers
  const validate = useCallback(async () => {
    if (!state.worldPath) return;
    dispatch({ type: 'VALIDATE_START' });
    try {
      const report = await validateGameplay(state.worldPath);
      dispatch({ type: 'VALIDATE_SUCCESS', payload: report });
    } catch (err) {
      dispatch({ type: 'VALIDATE_ERROR', payload: String(err) });
    }
  }, [state.worldPath]);

  // Create new empty config
  const createNew = useCallback((worldId: string, worldPath: string) => {
    const config = createEmptyGameplayConfig(worldId);
    dispatch({ type: 'LOAD_SUCCESS', payload: { config, worldPath } });
  }, []);

  // Entity operations
  const updateEntity = useCallback((id: string, entity: EntityConfig) => {
    dispatch({ type: 'UPDATE_ENTITY', payload: { id, entity } });
  }, []);

  const deleteEntity = useCallback((id: string) => {
    dispatch({ type: 'DELETE_ENTITY', payload: id });
  }, []);

  const addEntity = useCallback((id: string, entity: EntityConfig) => {
    dispatch({ type: 'UPDATE_ENTITY', payload: { id, entity } });
  }, []);

  // Trigger operations
  const updateTrigger = useCallback((id: string, trigger: TriggerConfig) => {
    dispatch({ type: 'UPDATE_TRIGGER', payload: { id, trigger } });
  }, []);

  const deleteTrigger = useCallback((id: string) => {
    dispatch({ type: 'DELETE_TRIGGER', payload: id });
  }, []);

  const addTrigger = useCallback((id: string, trigger: TriggerConfig) => {
    dispatch({ type: 'UPDATE_TRIGGER', payload: { id, trigger } });
  }, []);

  // Objective operations
  const updateObjective = useCallback((index: number, objective: ObjectiveConfig) => {
    dispatch({ type: 'UPDATE_OBJECTIVE', payload: { index, objective } });
  }, []);

  const deleteObjective = useCallback((index: number) => {
    dispatch({ type: 'DELETE_OBJECTIVE', payload: index });
  }, []);

  const addObjective = useCallback((objective: ObjectiveConfig) => {
    dispatch({ type: 'ADD_OBJECTIVE', payload: objective });
  }, []);

  // Interaction operations
  const updateInteraction = useCallback((id: string, interaction: InteractionConfig) => {
    dispatch({ type: 'UPDATE_INTERACTION', payload: { id, interaction } });
  }, []);

  const deleteInteraction = useCallback((id: string) => {
    dispatch({ type: 'DELETE_INTERACTION', payload: id });
  }, []);

  const addInteraction = useCallback((id: string, interaction: InteractionConfig) => {
    dispatch({ type: 'UPDATE_INTERACTION', payload: { id, interaction } });
  }, []);

  // UI operations
  const selectEntity = useCallback((id: string | null) => {
    dispatch({ type: 'SELECT_ENTITY', payload: id });
  }, []);

  const selectTrigger = useCallback((id: string | null) => {
    dispatch({ type: 'SELECT_TRIGGER', payload: id });
  }, []);

  const selectObjective = useCallback((id: string | null) => {
    dispatch({ type: 'SELECT_OBJECTIVE', payload: id });
  }, []);

  const selectInteraction = useCallback((id: string | null) => {
    dispatch({ type: 'SELECT_INTERACTION', payload: id });
  }, []);

  const setActiveTab = useCallback((tab: GameplayTab) => {
    dispatch({ type: 'SET_ACTIVE_TAB', payload: tab });
  }, []);

  const toggleSection = useCallback((section: string) => {
    dispatch({ type: 'TOGGLE_SECTION', payload: section });
  }, []);

  // Runtime
  const setRuntimeState = useCallback((runtimeState: RuntimeState) => {
    dispatch({ type: 'SET_RUNTIME_STATE', payload: runtimeState });
  }, []);

  // Helpers
  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  // Computed values
  const entityCount = state.config ? Object.keys(state.config.entities).length : 0;
  const npcCount = state.config
    ? Object.values(state.config.entities).filter((e) => e.type === 'npc').length
    : 0;
  const itemCount = state.config
    ? Object.values(state.config.entities).filter((e) =>
        ['key_item', 'consumable', 'equipment', 'document'].includes(e.type)
      ).length
    : 0;
  const triggerCount = state.config ? Object.keys(state.config.triggers).length : 0;
  const objectiveCount = state.config ? state.config.objectives.length : 0;
  const interactionCount = state.config ? Object.keys(state.config.interactions).length : 0;
  const audioZoneCount = state.config ? Object.keys(state.config.audio_zones).length : 0;
  const isValid = state.validationReport?.valid ?? false;

  const value: GameplayContextValue = {
    state,
    loadConfig,
    saveConfig,
    validate,
    createNew,
    updateEntity,
    deleteEntity,
    addEntity,
    updateTrigger,
    deleteTrigger,
    addTrigger,
    updateObjective,
    deleteObjective,
    addObjective,
    updateInteraction,
    deleteInteraction,
    addInteraction,
    selectEntity,
    selectTrigger,
    selectObjective,
    selectInteraction,
    setActiveTab,
    toggleSection,
    setRuntimeState,
    clearError,
    reset,
    entityCount,
    npcCount,
    itemCount,
    triggerCount,
    objectiveCount,
    interactionCount,
    audioZoneCount,
    isValid,
  };

  return <GameplayContext.Provider value={value}>{children}</GameplayContext.Provider>;
}

// =============================================================================
// Hook
// =============================================================================

export function useGameplay(): GameplayContextValue {
  const context = useContext(GameplayContext);
  if (!context) {
    throw new Error('useGameplay must be used within a GameplayProvider');
  }
  return context;
}

/**
 * Selector hook for optimized re-renders
 */
export function useGameplaySelector<T>(selector: (state: GameplayState) => T): T {
  const { state } = useGameplay();
  return selector(state);
}
