"use client";

import { useEffect, useMemo, useReducer, useRef } from "react";
import type {
  AroundClockPlayerState,
  CricketPlayerState,
  DartThrow,
  GameConfig,
  GameMode,
  GameState,
  Multiplier,
  Player,
  PlayerGameState,
  PlayerStats,
  Team,
  TurnRecord,
  X01PlayerState,
  X01Rules,
} from "@/interfaces";
import { applyX01Dart, createX01State, dartPoints } from "@/utils/x01";
import {
  applyCricketDart,
  checkCricketWin,
  createCricketState,
  dartMarks,
} from "@/utils/cricket";
import {
  ATC_SEQUENCE,
  applyAroundClockDart,
  atcProgress,
  createAroundClockState,
} from "@/utils/aroundClock";
import { clearGame, loadGame, saveGame } from "@/utils/storage";
import { setupSides, sidesAsPlayers } from "@/utils/teams";

type Action =
  | { type: "OPEN_SETUP"; mode: GameMode }
  | { type: "START_GAME"; config: GameConfig }
  | { type: "REGISTER_DART"; dart: DartThrow }
  | { type: "UNDO" }
  | { type: "REMOVE_FROM"; index: number }
  | { type: "NEXT_TURN" }
  | { type: "ROLLBACK_TO_TURN"; index: number }
  | { type: "FINISH" }
  | { type: "NEXT_LEG" }
  | { type: "NEW_GAME" }
  | { type: "GO_HOME" }
  | { type: "MARK_RECORDED" }
  | { type: "HYDRATE"; state: GameState };

function emptyStats(): PlayerStats {
  return {
    darts: 0,
    bestVisit: 0,
    lastVisit: 0,
    marks: 0,
    tonPlus: 0,
    oneEighties: 0,
    checkoutAttempts: 0,
    checkoutHits: 0,
    pointsScored: 0,
  };
}

/* Builds fresh per-player stats zeroed for a new leg. */
function buildStats(players: Player[]): Record<string, PlayerStats> {
  const stats: Record<string, PlayerStats> = {};
  for (const player of players) {
    stats[player.id] = emptyStats();
  }
  return stats;
}

/* Merges two PlayerStats objects (accumulates across legs). */
function mergeStats(a: PlayerStats, b: PlayerStats): PlayerStats {
  return {
    darts: a.darts + b.darts,
    bestVisit: Math.max(a.bestVisit, b.bestVisit),
    lastVisit: b.lastVisit,
    marks: a.marks + b.marks,
    tonPlus: a.tonPlus + b.tonPlus,
    oneEighties: a.oneEighties + b.oneEighties,
    checkoutAttempts: a.checkoutAttempts + b.checkoutAttempts,
    checkoutHits: a.checkoutHits + b.checkoutHits,
    pointsScored: a.pointsScored + b.pointsScored,
  };
}

/* Accumulates the current leg stats into totalStats for all players. */
function accumulateAllStats(state: GameState): Record<string, PlayerStats> {
  const result: Record<string, PlayerStats> = {};
  for (const player of state.players) {
    const total = state.totalStats[player.id] ?? emptyStats();
    const leg = state.stats[player.id] ?? emptyStats();
    result[player.id] = mergeStats(total, leg);
  }
  return result;
}

/* Builds a zeroed legs-won tally for every side. */
function buildLegs(sideIds: string[]): Record<string, number> {
  const legs: Record<string, number> = {};
  for (const sideId of sideIds) {
    legs[sideId] = 0;
  }
  return legs;
}

/* Returns a state copy with its undo history stripped, for stacking. */
function stripPast(state: GameState): GameState {
  return { ...state, past: [] };
}

/* Stacks the previous state onto the next state's bounded undo history. */
const HISTORY_CAP = 80;

function withHistory(previous: GameState, next: GameState): GameState {
  if (next === previous) {
    return next;
  }
  const past = [...previous.past, stripPast(previous)].slice(-HISTORY_CAP);
  return { ...next, past };
}

/* Deep-clones a single player state so reducer updates stay immutable. */
function clonePlayerState(state: PlayerGameState): PlayerGameState {
  if (state.kind === "x01") return { ...state };
  if (state.kind === "aroundclock") return { ...state };
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

/* Builds the initial scoring states, one per side. */
function buildStates(
  mode: GameMode,
  rules: X01Rules,
  sideIds: string[],
): Record<string, PlayerGameState> {
  const states: Record<string, PlayerGameState> = {};
  for (const sideId of sideIds) {
    states[sideId] =
      mode === "x01"
        ? createX01State(rules)
        : mode === "aroundclock"
          ? createAroundClockState()
          : createCricketState();
  }
  return states;
}

/* Replays the darts of the current turn from a snapshot to rebuild the
   active side's state. `currentSideId` keys the scoring state; `sides` is the
   participant list cricket needs (teams in team mode, players in solo). */
function replayTurn(
  snapshot: Record<string, PlayerGameState>,
  currentSideId: string,
  sides: Player[],
  mode: GameMode,
  rules: GameState["rules"],
  darts: DartThrow[],
): Record<string, PlayerGameState> {
  if (mode === "x01") {
    const states = cloneStates(snapshot);
    let current = snapshot[currentSideId] as X01PlayerState;
    for (const dart of darts) {
      current = applyX01Dart(current, dart, rules).state;
    }
    states[currentSideId] = current;
    return states;
  }

  if (mode === "aroundclock") {
    const states = cloneStates(snapshot);
    let current = snapshot[currentSideId] as AroundClockPlayerState;
    for (const dart of darts) {
      current = applyAroundClockDart(current, dart).state;
    }
    states[currentSideId] = current;
    return states;
  }

  let map = cloneStates(snapshot) as Record<string, CricketPlayerState>;
  const cutThroat = mode === "cutthroat";
  for (const dart of darts) {
    map = applyCricketDart(map, currentSideId, sides, dart, cutThroat);
  }
  return map;
}

/* Headline numeric value of a side's state, for a history row. */
function sideScoreValue(
  states: Record<string, PlayerGameState>,
  sid: string,
): number {
  const ps = states[sid];
  if (!ps) return 0;
  if (ps.kind === "x01") return ps.score;
  if (ps.kind === "aroundclock") return atcProgress(ps);
  return ps.score;
}

/* Resolves a registered dart for the active player and returns the next state. */
function reduceRegister(state: GameState, dart: DartThrow): GameState {
  if (state.turnOver || state.winnerId || state.darts.length >= 3) {
    return state;
  }

  const currentId = state.order[state.currentIndex];
  const sid = state.sideOf[currentId] ?? currentId;
  const darts = [...state.darts, dart];
  const prior = state.stats[currentId];

  // ── Around the Clock ──────────────────────────────────────────────────────
  if (state.mode === "aroundclock") {
    const current = state.states[sid] as AroundClockPlayerState;
    const result = applyAroundClockDart(current, dart);
    const atcStats: PlayerStats = {
      ...prior,
      darts: prior.darts + 1,
      marks: prior.marks + (result.advanced ? 1 : 0),
    };
    return {
      ...state,
      states: { ...state.states, [sid]: result.state },
      darts,
      turnOver: result.win || darts.length >= 3,
      winnerId: result.win ? sid : null,
      stats: { ...state.stats, [currentId]: atcStats },
      legsWon: result.win
        ? { ...state.legsWon, [sid]: state.legsWon[sid] + 1 }
        : state.legsWon,
      history: result.win
        ? [
            ...state.history,
            {
              round: state.round,
              playerId: currentId,
              sideId: sid,
              darts: [...darts],
              bust: false,
              scoreAfter: atcProgress(result.state),
            },
          ]
        : state.history,
    };
  }

  // ── Shared base stats (x01 + cricket) ────────────────────────────────────
  const baseStats: PlayerStats = {
    darts: prior.darts + 1,
    bestVisit: prior.bestVisit,
    lastVisit: prior.lastVisit,
    marks: prior.marks + dartMarks(dart),
    tonPlus: prior.tonPlus,
    oneEighties: prior.oneEighties,
    checkoutAttempts: prior.checkoutAttempts,
    checkoutHits: prior.checkoutHits,
    pointsScored: prior.pointsScored,
  };

  // ── x01 ──────────────────────────────────────────────────────────────────
  if (state.mode === "x01") {
    const current = state.states[sid] as X01PlayerState;
    const result = applyX01Dart(current, dart, state.rules);

    if (result.bust) {
      return {
        ...state,
        states: cloneStates(state.turnSnapshot ?? state.states),
        darts,
        turnOver: true,
        bust: true,
        stats: { ...state.stats, [currentId]: baseStats },
      };
    }

    let finalStats = { ...state.stats, [currentId]: baseStats };

    if (result.win) {
      const snapState = state.turnSnapshot?.[sid];
      const isCheckoutChance =
        snapState?.kind === "x01" &&
        snapState.opened &&
        snapState.score > 0 &&
        snapState.score <= 170;
      const turnPointsTotal = darts.reduce((s, d) => s + d.points, 0);
      finalStats = {
        ...state.stats,
        [currentId]: {
          ...baseStats,
          pointsScored: prior.pointsScored + turnPointsTotal,
          checkoutAttempts: baseStats.checkoutAttempts + (isCheckoutChance ? 1 : 0),
          checkoutHits: baseStats.checkoutHits + (isCheckoutChance ? 1 : 0),
        },
      };
    }

    return {
      ...state,
      states: { ...state.states, [sid]: result.state },
      darts,
      turnOver: result.win || darts.length >= 3,
      winnerId: result.win ? sid : null,
      stats: finalStats,
      legsWon: result.win
        ? { ...state.legsWon, [sid]: state.legsWon[sid] + 1 }
        : state.legsWon,
      history: result.win
        ? [
            ...state.history,
            {
              round: state.round,
              playerId: currentId,
              sideId: sid,
              darts: [...darts],
              bust: false,
              scoreAfter: (result.state as X01PlayerState).score,
            },
          ]
        : state.history,
    };
  }

  // ── Cricket / Cut-throat ──────────────────────────────────────────────────
  const cutThroat = state.mode === "cutthroat";
  const sides = sidesAsPlayers(state.teams, state.players);
  const states = applyCricketDart(
    state.states as Record<string, CricketPlayerState>,
    sid,
    sides,
    dart,
    cutThroat,
  );
  const win = checkCricketWin(states, sid, sides, cutThroat);

  return {
    ...state,
    states,
    darts,
    turnOver: win || darts.length >= 3,
    winnerId: win ? sid : null,
    stats: { ...state.stats, [currentId]: baseStats },
    legsWon: win
      ? { ...state.legsWon, [sid]: state.legsWon[sid] + 1 }
      : state.legsWon,
    history: win
      ? [
          ...state.history,
          {
            round: state.round,
            playerId: currentId,
            sideId: sid,
            darts: [...darts],
            bust: false,
            scoreAfter: sideScoreValue(states, sid),
          },
        ]
      : state.history,
  };
}

/* Advances to the next turn: finalizes the ending player's visit stats,
   records the completed turn into history, rotates the throwing order. Pure —
   the caller wraps it with withHistory when appropriate. */
function commitTurn(state: GameState): GameState {
  const endingId = state.order[state.currentIndex];
  const endSide = state.sideOf[endingId] ?? endingId;

  const visit = (() => {
    if (state.bust) return 0;
    if (state.mode === "x01") {
      return state.darts.reduce((sum, dart) => sum + dart.points, 0);
    }
    if (state.mode === "aroundclock") {
      const snapState = state.turnSnapshot?.[endSide];
      const currState = state.states[endSide];
      if (
        !snapState ||
        snapState.kind !== "aroundclock" ||
        currState.kind !== "aroundclock"
      )
        return 0;
      if (currState.target === 0) {
        return ATC_SEQUENCE.length - ATC_SEQUENCE.indexOf(snapState.target);
      }
      return Math.max(0, atcProgress(currState) - atcProgress(snapState));
    }
    return state.darts.reduce((sum, dart) => sum + dartMarks(dart), 0);
  })();

  const ending = state.stats[endingId];
  const isX01Visit = state.mode === "x01" && !state.bust;

  const snapState = state.turnSnapshot?.[endSide];
  const isCheckoutAttempt =
    state.mode === "x01" &&
    snapState?.kind === "x01" &&
    snapState.opened &&
    snapState.score > 0 &&
    snapState.score <= 170 &&
    !state.winnerId;

  const stats = {
    ...state.stats,
    [endingId]: {
      ...ending,
      bestVisit: Math.max(ending.bestVisit, visit),
      lastVisit: visit,
      tonPlus: ending.tonPlus + (isX01Visit && visit >= 100 ? 1 : 0),
      oneEighties: ending.oneEighties + (isX01Visit && visit === 180 ? 1 : 0),
      checkoutAttempts: ending.checkoutAttempts + (isCheckoutAttempt ? 1 : 0),
      pointsScored: ending.pointsScored + (isX01Visit ? visit : 0),
    },
  };

  const record: TurnRecord = {
    round: state.round,
    playerId: endingId,
    sideId: endSide,
    darts: [...state.darts],
    bust: state.bust,
    scoreAfter: sideScoreValue(state.states, endSide),
  };

  const currentIndex = (state.currentIndex + 1) % (state.order.length || 1);
  const round =
    currentIndex === state.startIndex ? state.round + 1 : state.round;
  return {
    ...state,
    currentIndex,
    round,
    darts: [],
    turnOver: false,
    bust: false,
    turnSnapshot: cloneStates(state.states),
    stats,
    history: [...state.history, record],
  };
}

const DEFAULT_STATE: GameState = {
  screen: "home",
  mode: "x01",
  rules: { startScore: 501, inOption: "open", outOption: "double" },
  players: [],
  teams: null,
  sideOf: {},
  order: [],
  states: {},
  currentIndex: 0,
  darts: [],
  turnSnapshot: null,
  turnOver: false,
  bust: false,
  winnerId: null,
  round: 1,
  history: [],
  stats: {},
  totalStats: {},
  legsTarget: 1,
  legsWon: {},
  startIndex: 0,
  recorded: false,
  past: [],
};

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
      const sides = setupSides(action.config.players, action.config.teams);
      const states = buildStates(
        action.config.mode,
        action.config.rules,
        sides.sideIds,
      );
      return {
        screen: "game",
        mode: action.config.mode,
        rules: action.config.rules,
        players: action.config.players,
        teams: sides.teams,
        sideOf: sides.sideOf,
        order: sides.order,
        states,
        currentIndex: 0,
        darts: [],
        turnSnapshot: cloneStates(states),
        turnOver: false,
        bust: false,
        winnerId: null,
        round: 1,
        history: [],
        stats: buildStats(action.config.players),
        totalStats: buildStats(action.config.players),
        legsTarget: action.config.legsTarget,
        legsWon: buildLegs(sides.sideIds),
        startIndex: 0,
        recorded: false,
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
      const currentId = state.order[state.currentIndex];
      const sid = state.sideOf[currentId] ?? currentId;
      const states = replayTurn(
        state.turnSnapshot,
        sid,
        sidesAsPlayers(state.teams, state.players),
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
      return withHistory(state, commitTurn(state));
    }

    case "ROLLBACK_TO_TURN": {
      if (action.index < 0 || action.index >= state.history.length) {
        return state;
      }
      const sides = setupSides(state.players, state.teams);
      const freshStates = buildStates(state.mode, state.rules, sides.sideIds);
      let s: GameState = {
        ...state,
        states: freshStates,
        currentIndex: state.startIndex,
        darts: [],
        turnSnapshot: cloneStates(freshStates),
        turnOver: false,
        bust: false,
        winnerId: null,
        round: 1,
        stats: buildStats(state.players),
        history: [],
        past: [],
      };
      for (const rec of state.history.slice(0, action.index)) {
        for (const dart of rec.darts) {
          s = reduceRegister(s, dart);
        }
        s = commitTurn(s);
      }
      return withHistory(state, s);
    }

    case "FINISH": {
      const newTotalStats = accumulateAllStats(state);
      return { ...state, screen: "result", totalStats: newTotalStats };
    }

    case "NEXT_LEG": {
      const newTotalStats = accumulateAllStats(state);
      const sides = setupSides(state.players, state.teams);
      const startIndex = (state.startIndex + 1) % (state.order.length || 1);
      const states = buildStates(state.mode, state.rules, sides.sideIds);
      return {
        ...state,
        states,
        currentIndex: startIndex,
        startIndex,
        darts: [],
        turnSnapshot: cloneStates(states),
        turnOver: false,
        bust: false,
        winnerId: null,
        round: 1,
        history: [],
        stats: buildStats(state.players),
        totalStats: newTotalStats,
        past: [],
      };
    }

    case "NEW_GAME": {
      const sides = setupSides(state.players, state.teams);
      const states = buildStates(state.mode, state.rules, sides.sideIds);
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
        round: 1,
        history: [],
        stats: buildStats(state.players),
        totalStats: buildStats(state.players),
        legsWon: buildLegs(sides.sideIds),
        startIndex: 0,
        recorded: false,
        past: [],
      };
    }

    case "GO_HOME":
      return { ...DEFAULT_STATE };

    case "MARK_RECORDED":
      return { ...state, recorded: true };

    case "HYDRATE": {
      const saved = action.state;
      const base = buildStats(saved.players);
      const mergeStatsSaved = (
        source: Record<string, PlayerStats> | undefined,
      ): Record<string, PlayerStats> => {
        if (!source) return buildStats(saved.players);
        const merged: Record<string, PlayerStats> = {};
        for (const [id, s] of Object.entries(source as Record<string, PlayerStats>)) {
          merged[id] = { ...(base[id] ?? emptyStats()), ...s };
        }
        return merged;
      };
      return {
        ...saved,
        past: saved.past ?? [],
        round: saved.round ?? 1,
        history: saved.history ?? [],
        teams: saved.teams ?? null,
        sideOf:
          saved.sideOf ??
          Object.fromEntries(saved.players.map((p) => [p.id, p.id])),
        order: saved.order ?? saved.players.map((p) => p.id),
        stats: mergeStatsSaved(saved.stats as Record<string, PlayerStats> | undefined),
        totalStats: mergeStatsSaved(saved.totalStats as Record<string, PlayerStats> | undefined),
        legsTarget: saved.legsTarget ?? 1,
        legsWon: saved.legsWon ?? buildLegs(saved.players.map((p) => p.id)),
        startIndex: saved.startIndex ?? 0,
        recorded: saved.recorded ?? false,
      };
    }

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
  nextLeg: () => void;
  newGame: () => void;
  goHome: () => void;
  markRecorded: () => void;
  rollbackToTurn: (index: number) => void;
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
    const currentId =
      state.order.length > 0 ? state.order[state.currentIndex] : null;
    const currentPlayer = currentId
      ? state.players.find((p) => p.id === currentId) ?? null
      : null;
    const currentState = currentPlayer
      ? state.states[state.sideOf[currentPlayer.id] ?? currentPlayer.id] ?? null
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
      nextLeg: () => dispatch({ type: "NEXT_LEG" }),
      newGame: () => dispatch({ type: "NEW_GAME" }),
      goHome: () => dispatch({ type: "GO_HOME" }),
      markRecorded: () => dispatch({ type: "MARK_RECORDED" }),
      rollbackToTurn: (index) => dispatch({ type: "ROLLBACK_TO_TURN", index }),
    };
  }, [state]);
}
