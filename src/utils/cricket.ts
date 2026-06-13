import type {
  CricketPlayerState,
  DartThrow,
  Player,
} from "@/interfaces";

export const CRICKET_NUMBERS: number[] = [20, 19, 18, 17, 16, 15, 25];

interface CricketHit {
  num: number;
  marks: number;
  value: number;
}

/* Builds the starting state for one player of a cricket game. */
export function createCricketState(): CricketPlayerState {
  const marks: Record<number, number> = {};
  for (const num of CRICKET_NUMBERS) {
    marks[num] = 0;
  }
  return { kind: "cricket", marks, score: 0 };
}

/* Resolves a dart into a cricket target, or null when it is a dead number. */
function resolveHit(dart: DartThrow): CricketHit | null {
  if (dart.segment === 25 || dart.segment === 50) {
    return { num: 25, marks: dart.segment === 50 ? 2 : 1, value: 25 };
  }
  if (CRICKET_NUMBERS.includes(dart.segment)) {
    return { num: dart.segment, marks: dart.multiplier, value: dart.segment };
  }
  return null;
}

/* Tells whether a player has closed every cricket number. */
export function allClosed(state: CricketPlayerState): boolean {
  return CRICKET_NUMBERS.every((num) => state.marks[num] >= 3);
}

/* Clones a cricket player state so updates stay immutable. */
function cloneState(state: CricketPlayerState): CricketPlayerState {
  return { kind: "cricket", marks: { ...state.marks }, score: state.score };
}

/* Applies one dart to the whole cricket field, handling marks and scoring. */
export function applyCricketDart(
  states: Record<string, CricketPlayerState>,
  currentId: string,
  players: Player[],
  dart: DartThrow,
  cutThroat: boolean,
): Record<string, CricketPlayerState> {
  const hit = resolveHit(dart);
  if (!hit) {
    return states;
  }

  const next: Record<string, CricketPlayerState> = {};
  for (const player of players) {
    next[player.id] = cloneState(states[player.id]);
  }

  const me = next[currentId];
  const before = me.marks[hit.num];
  const needed = Math.max(0, 3 - before);
  const used = Math.min(hit.marks, needed);
  me.marks[hit.num] = before + used;
  const overflow = hit.marks - used;

  if (overflow > 0 && me.marks[hit.num] >= 3) {
    const points = overflow * hit.value;
    if (cutThroat) {
      for (const player of players) {
        if (player.id !== currentId && next[player.id].marks[hit.num] < 3) {
          next[player.id].score += points;
        }
      }
    } else {
      const opponentOpen = players.some(
        (player) =>
          player.id !== currentId && next[player.id].marks[hit.num] < 3,
      );
      if (opponentOpen) {
        me.score += points;
      }
    }
  }

  return next;
}

/* Lists the cricket numbers closed by every player, hence dead for scoring. */
export function deadNumbers(
  states: Record<string, CricketPlayerState>,
  players: Player[],
): number[] {
  return CRICKET_NUMBERS.filter((num) =>
    players.every((player) => states[player.id].marks[num] >= 3),
  );
}

/* Tells whether the current player has met the cricket victory condition. */
export function checkCricketWin(
  states: Record<string, CricketPlayerState>,
  currentId: string,
  players: Player[],
  cutThroat: boolean,
): boolean {
  if (!allClosed(states[currentId])) {
    return false;
  }
  const myScore = states[currentId].score;
  const opponents = players.filter((player) => player.id !== currentId);

  if (cutThroat) {
    return opponents.every((player) => myScore <= states[player.id].score);
  }
  return opponents.every((player) => myScore >= states[player.id].score);
}
