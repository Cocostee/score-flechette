export type GameMode = "x01" | "cricket" | "cutthroat";

export type Multiplier = 1 | 2 | 3;

export type ScreenName = "home" | "setup" | "game" | "result";

export type X01InOption = "open" | "double";

export type X01OutOption = "open" | "double" | "master";

export interface DartThrow {
  segment: number;
  multiplier: Multiplier;
  points: number;
}

export interface X01Rules {
  startScore: number;
  inOption: X01InOption;
  outOption: X01OutOption;
}

export interface Player {
  id: string;
  name: string;
}

export interface X01PlayerState {
  kind: "x01";
  score: number;
  opened: boolean;
}

export interface CricketPlayerState {
  kind: "cricket";
  marks: Record<number, number>;
  score: number;
}

export type PlayerGameState = X01PlayerState | CricketPlayerState;

export interface PlayerStats {
  darts: number;
  bestVisit: number;
  lastVisit: number;
  marks: number;
}

export interface GameState {
  screen: ScreenName;
  mode: GameMode;
  rules: X01Rules;
  players: Player[];
  states: Record<string, PlayerGameState>;
  currentIndex: number;
  darts: DartThrow[];
  turnSnapshot: Record<string, PlayerGameState> | null;
  turnOver: boolean;
  bust: boolean;
  winnerId: string | null;
  round: number;
  stats: Record<string, PlayerStats>;
  legsTarget: number;
  legsWon: Record<string, number>;
  startIndex: number;
  past: GameState[];
}

export interface GameConfig {
  mode: GameMode;
  rules: X01Rules;
  players: Player[];
  legsTarget: number;
}

export interface ModeInfo {
  mode: GameMode;
  name: string;
  tagline: string;
  rules: string[];
}

export interface TrackedPlayer {
  id: string;
  name: string;
}
