import type { AroundClockPlayerState, DartThrow } from "@/interfaces";

export const ATC_SEQUENCE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 25];

export function createAroundClockState(): AroundClockPlayerState {
  return { kind: "aroundclock", target: 1 };
}

/* Applies a single dart to an around-the-clock state.
   Any ring on the target number counts — multipliers do not give extra advances. */
export function applyAroundClockDart(
  state: AroundClockPlayerState,
  dart: DartThrow,
): { state: AroundClockPlayerState; win: boolean; advanced: boolean } {
  const t = state.target;
  if (t === 0) return { state, win: false, advanced: false };

  const hits =
    t === 25
      ? dart.segment === 25 || dart.segment === 50
      : dart.segment === t;

  if (!hits) return { state, win: false, advanced: false };

  const idx = ATC_SEQUENCE.indexOf(t);
  if (idx === ATC_SEQUENCE.length - 1) {
    return { state: { ...state, target: 0 }, win: true, advanced: true };
  }

  return {
    state: { ...state, target: ATC_SEQUENCE[idx + 1] },
    win: false,
    advanced: true,
  };
}

/* Number of targets completed (0-based completed count from current target). */
export function atcProgress(state: AroundClockPlayerState): number {
  if (state.target === 0) return ATC_SEQUENCE.length;
  return ATC_SEQUENCE.indexOf(state.target);
}
