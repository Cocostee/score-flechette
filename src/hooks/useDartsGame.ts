"use client";

import { useEffect, useMemo, useReducer, useRef } from "react";
import type {
  CricketPlayerState,
  DartThrow,
  GameConfig,
  GameMode,
  GameState,
  Multiplier,
  Player,
  PlayerGameState,
  X01PlayerState,
} from "@/interfaces";
import { applyX01Dart, createX01State, dartPoints } from "@/utils/x01";
import {
  applyCricketDart,
  checkCricketWin,
  createCricketState,
} from "@/utils/cricket";
import { clearGame, loadGame, saveGame } from "@/utils/storage";

type Action =
  | { type: "OPEN_SETUP"; mode: GameMode }
  | { type: "START_GAME"; config: GameConfig }
  | { type: "REGISTER_DART"; dart: DartThrow }
  | { type: "UNDO" }
  | { type: "REMOVE_FROM"; index: number }
  | { type: "NEXT_TURN" }
  | { type: "FINISH" }
  | { type: "NEW_GAME" }
  | { type: "GO_HOME" }
  | { type: "HYDRATE"; state: GameState };

const DEFAULT_STATE: GameState = {
  screen: "home",
  mode: "x01",
  rules: { startScore: 501, inOption: "open", outOption: "double" },
  players: [],
  states: {},
  currentIndex: 0,
  darts: [],
  turnSnapshot: null,
  turnOver: false,
  bust: false,
  winnerId: null,
  past: [],
};

const HISTORY_CAP = 80;

/* Returns a state copy with its undo history stripped, for stacking. */
function stripPast(state: GameState): GameState {
  return { ...state, past: [] };
}

/* Stacks the previous state onto the next state's bounded undo history. */
function withHistory(previous: GameState, next: GameState): GameState {
  if (next === previous) {
    return next;
  }
  const past = [...previous.past, stripPast(previous)].slice(-HISTORY_CAP);
  return { ...next, past };
}

/* Deep-clones a single player state so reducer updates stay immutable. */
function clonePlayerState(state: PlayerGameState): PlayerGameState {
  if (state.kind === "x01") {
    return { ...state };
  }
  return { kind: "cricket", marks: { ...state.marks }, score: state.score };
}

/* Deep-clones the whole field of player states. */
function cloneStates(
  states: Record<string, PlayerGameState>,
): Record<string, PlayerGameState> {
  const next: Record<string, PlayerGameState> = {};
  for (const id of Object.keys(states)) {
    next[id] = clonePlayerState(states[id]);
  }
  return next;
}

/* Builds the initial player states for a new game. */
function buildStates(config: GameConfig): Record<string, PlayerGameState> {
  const states: Record<string, PlayerGameState> = {};
  for (const player of config.players) {
    states[player.id] =
      config.mode === "x01"
        ? createX01State(config.rules)
        : createCricketState();
  }
  return states;
}

/* Replays the darts of the current turn from a snapshot to rebuild state. */
function replayTurn(
  snapshot: Record<string, PlayerGameState>,
  currentId: string,
  players: Player[],
  mode: GameMode,
  rules: GameState["rules"],
  darts: DartThrow[],
): Record<string, PlayerGameState> {
  if (mode === "x01") {
    const states = cloneStates(snapshot);
    let current = snapshot[currentId] as X01PlayerState;
    for (const dart of darts) {
      current = applyX01Dart(current, dart, rules).state;
    }
    states[currentId] = current;
    return states;
  }

  let map = cloneStates(snapshot) as Record<string, CricketPlayerState>;
  const cutThroat = mode === "cutthroat";
  for (const dart of darts) {
    map = applyCricketDart(map, currentId, players, dart, cutThroat);
  }
  return map;
}

/* Resolves a registered dart for the active player and returns the next state. */
function reduceRegister(state: GameState, dart: DartThrow): GameState {
  if (state.turnOver || state.winnerId || state.darts.length >= 3) {
    return state;
  }

  const currentId = state.players[state.currentIndex].id;
  const darts = [...state.darts, dart];

  if (state.mode === "x01") {
    const current = state.states[currentId] as X01PlayerState;
    const result = applyX01Dart(current, dart, state.rules);

    if (result.bust) {
      return {
        ...state,
        states: cloneStates(state.turnSnapshot ?? state.states),
        darts,
        turnOver: true,
        bust: true,
      };
    }

    const states = { ...state.states, [currentId]: result.state };
    return {
      ...state,
      states,
      darts,
      turnOver: result.win || darts.length >= 3,
      winnerId: result.win ? currentId : null,
    };
  }

  const cutThroat = state.mode === "cutthroat";
  const states = applyCricketDart(
    state.states as Record<string, CricketPlayerState>,
    currentId,
    state.players,
    dart,
    cutThroat,
  );
  const win = checkCricketWin(states, currentId, state.players, cutThroat);

  return {
    ...state,
    states,
    darts,
    turnOver: win || darts.length >= 3,
    winnerId: win ? currentId : null,
  };
}

/* Pure reducer holding every game transition; UI never computes scores. */
function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "OPEN_SETUP":
      return {
        ...DEFAULT_STATE,
        screen: "setup",
        mode: action.mode,
        rules: { ...DEFAULT_STATE.rules },
      };

    case "START_GAME": {
      const states = buildStates(action.config);
      return {
        screen: "game",
        mode: action.config.mode,
        rules: action.config.rules,
        players: action.config.players,
        states,
        currentIndex: 0,
        darts: [],
        turnSnapshot: cloneStates(states),
        turnOver: false,
        bust: false,
        winnerId: null,
        past: [],
      };
    }

    case "REGISTER_DART":
      return withHistory(state, reduceRegister(state, action.dart));

    case "UNDO": {
      if (state.past.length === 0) {
        return state;
      }
      const previous = state.past[state.past.length - 1];
      return { ...previous, past: state.past.slice(0, -1) };
    }

    case "REMOVE_FROM": {
      if (
        !state.turnSnapshot ||
        action.index < 0 ||
        action.index >= state.darts.length
      ) {
        return state;
      }
      const darts = state.darts.slice(0, action.index);
      const currentId = state.players[state.currentIndex].id;
      const states = replayTurn(
        state.turnSnapshot,
        currentId,
        state.players,
        state.mode,
        state.rules,
        darts,
      );
      return withHistory(state, {
        ...state,
        states,
        darts,
        turnOver: false,
        bust: false,
        winnerId: null,
      });
    }

    case "NEXT_TURN": {
      if (state.winnerId) {
        return state;
      }
      const currentIndex = (state.currentIndex + 1) % state.players.length;
      return withHistory(state, {
        ...state,
        currentIndex,
        darts: [],
        turnOver: false,
        bust: false,
        turnSnapshot: cloneStates(state.states),
      });
    }

    case "FINISH":
      return { ...state, screen: "result" };

    case "NEW_GAME": {
      const config: GameConfig = {
        mode: state.mode,
        rules: state.rules,
        players: state.players,
      };
      const states = buildStates(config);
      return {
        ...state,
        screen: "game",
        states,
        currentIndex: 0,
        darts: [],
        turnSnapshot: cloneStates(states),
        turnOver: false,
        bust: false,
        winnerId: null,
        past: [],
      };
    }

    case "GO_HOME":
      return { ...DEFAULT_STATE };

    case "HYDRATE":
      return { ...action.state, past: action.state.past ?? [] };

    default:
      return state;
  }
}

export interface DartsGame {
  state: GameState;
  currentPlayer: Player | null;
  currentState: PlayerGameState | null;
  openSetup: (mode: GameMode) => void;
  startGame: (config: GameConfig) => void;
  registerDart: (segment: number, multiplier: Multiplier) => void;
  undo: () => void;
  removeDart: (index: number) => void;
  nextTurn: () => void;
  finishGame: () => void;
  newGame: () => void;
  goHome: () => void;
}

/* The single source of truth for game state, progression and scoring. */
export function useDartsGame(): DartsGame {
  const [state, dispatch] = useReducer(reducer, DEFAULT_STATE);
  const hydrated = useRef(false);

  useEffect(() => {
    const saved = loadGame();
    if (saved && saved.screen !== "home") {
      dispatch({ type: "HYDRATE", state: saved });
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) {
      return;
    }
    if (state.screen === "home") {
      clearGame();
      return;
    }
    saveGame(stripPast(state));
  }, [state]);

  return useMemo<DartsGame>(() => {
    const currentPlayer =
      state.players.length > 0 ? state.players[state.currentIndex] : null;
    const currentState = currentPlayer
      ? state.states[currentPlayer.id] ?? null
      : null;

    return {
      state,
      currentPlayer,
      currentState,
      openSetup: (mode) => dispatch({ type: "OPEN_SETUP", mode }),
      startGame: (config) => dispatch({ type: "START_GAME", config }),
      registerDart: (segment, multiplier) => {
        const normalized: Multiplier =
          segment === 25 || segment === 50 ? 1 : multiplier;
        const dart: DartThrow = {
          segment,
          multiplier: normalized,
          points: dartPoints(segment, normalized),
        };
        dispatch({ type: "REGISTER_DART", dart });
      },
      undo: () => dispatch({ type: "UNDO" }),
      removeDart: (index) => dispatch({ type: "REMOVE_FROM", index }),
      nextTurn: () => dispatch({ type: "NEXT_TURN" }),
      finishGame: () => dispatch({ type: "FINISH" }),
      newGame: () => dispatch({ type: "NEW_GAME" }),
      goHome: () => dispatch({ type: "GO_HOME" }),
    };
  }, [state]);
}
