import type {
  DartThrow,
  Multiplier,
  X01PlayerState,
  X01Rules,
} from "@/interfaces";

export interface X01ThrowResult {
  state: X01PlayerState;
  bust: boolean;
  win: boolean;
}

/* Returns the raw point value of a single dart. */
export function dartPoints(segment: number, multiplier: Multiplier): number {
  if (segment === 25 || segment === 50) {
    return segment;
  }
  return segment * multiplier;
}

/* Tells whether a dart counts as a double for "in" or "out" checks. */
export function isDouble(dart: DartThrow): boolean {
  return dart.multiplier === 2 || dart.segment === 50;
}

/* Tells whether a dart satisfies the configured finishing rule. */
export function isValidFinish(dart: DartThrow, rules: X01Rules): boolean {
  if (rules.outOption === "open") {
    return true;
  }
  if (rules.outOption === "master") {
    return isDouble(dart) || dart.multiplier === 3;
  }
  return isDouble(dart);
}

/* Builds the starting state for one player of an 01 game. */
export function createX01State(rules: X01Rules): X01PlayerState {
  return {
    kind: "x01",
    score: rules.startScore,
    opened: rules.inOption === "open",
  };
}

/* Applies one dart to an 01 player state and reports bust or win. */
export function applyX01Dart(
  current: X01PlayerState,
  dart: DartThrow,
  rules: X01Rules,
): X01ThrowResult {
  const next: X01PlayerState = { ...current };

  if (!next.opened) {
    if (!isDouble(dart)) {
      return { state: next, bust: false, win: false };
    }
    next.opened = true;
  }

  const remaining = next.score - dart.points;

  if (remaining < 0) {
    return { state: current, bust: true, win: false };
  }

  if (remaining === 0) {
    if (isValidFinish(dart, rules)) {
      next.score = 0;
      return { state: next, bust: false, win: true };
    }
    return { state: current, bust: true, win: false };
  }

  if (remaining === 1 && rules.outOption !== "open") {
    return { state: current, bust: true, win: false };
  }

  next.score = remaining;
  return { state: next, bust: false, win: false };
}
