# Historique, corrections & polish live — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter l'historique par tour de la partie en cours (hôte + spectateur), la correction d'un tour par re-jeu, le finish côté spectateur, et le nom du prochain joueur dans le bouton.

**Architecture:** Un `history: TurnRecord[]` dans `GameState` (diffusé/persisté), rempli à chaque fin de tour ; la correction rejoue les tours conservés via la logique de scoring existante (`reduceRegister` + un helper `commitTurn` extrait de `NEXT_TURN`). UI : un `HistoryScreen` partagé hôte/spectateur, un bouton dans les en-têtes, et deux petits ajustements d'affichage.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, CSS Modules. Reducer `useReducer`, persistance localStorage, diffusion Supabase Realtime (déjà en place).

## Global Constraints

- TypeScript strict, pas de `any` implicite.
- PAS de runner de tests. Vérification = `npx tsc --noEmit` (ZÉRO sortie) et, pour l'UI, `npm run build` (« Compiled successfully »). Pas de tests unitaires inventés.
- **Non-régression** : le jeu existant (saisie, undo ↩, bust, victoire, legs, solo/équipe/spectateur) doit rester identique hors ajouts. `history` par défaut `[]` (rétro-compat HYDRATE).
- **Portée v1** : historique et rollback = **leg (manche) en cours** ; `history` remis à `[]` dans `START_GAME`, `NEXT_LEG`, `NEW_GAME`.
- Le rollback est réservé à l'hôte ; le spectateur consulte en lecture seule.
- Messages de commit terminés par `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

| Fichier | Statut | Responsabilité |
|---|---|---|
| `src/interfaces/index.ts` | modifié | `TurnRecord` + `history: TurnRecord[]` sur `GameState` |
| `src/hooks/useDartsGame.ts` | modifié | `sideScoreValue`, `buildTurnRecord`, `commitTurn`, enregistrement history, `ROLLBACK_TO_TURN` + API `rollbackToTurn`, resets, HYDRATE |
| `src/components/ui/icons.tsx` | modifié | `IconHistory` |
| `src/components/ui/HistoryScreen.tsx` (+ `.module.css`) | nouveau | liste des tours (hôte éditable / spectateur lecture seule) |
| `src/components/screens/GameScreen.tsx` | modifié | bouton historique dans l'en-tête + nom du prochain joueur dans le bouton |
| `src/components/spectator/SpectatorScreen.tsx` (+ `.module.css`) | modifié | finish (checkout) + bouton historique |

---

## Task 1: Moteur — historique + correction

**Files:**
- Modify: `src/interfaces/index.ts`
- Modify: `src/hooks/useDartsGame.ts`

**Interfaces:**
- Produces:
  - `interface TurnRecord { round: number; playerId: string; sideId: string; darts: DartThrow[]; bust: boolean; scoreAfter: number }`
  - `GameState.history: TurnRecord[]`
  - `DartsGame.rollbackToTurn(index: number): void`

- [ ] **Step 1: `interfaces` — `TurnRecord` + champ `history`**

In `src/interfaces/index.ts`, add the `TurnRecord` interface right after the `Team` interface (after its closing brace):

```ts
export interface TurnRecord {
  round: number;
  playerId: string;
  sideId: string;
  darts: DartThrow[];
  bust: boolean;
  scoreAfter: number;
}
```

In `interface GameState`, add the `history` field right after the `round: number;` line:

```ts
  history: TurnRecord[];
```

- [ ] **Step 2: reducer — imports + helpers**

In `src/hooks/useDartsGame.ts`, add `TurnRecord` to the type import block from `@/interfaces` (alongside the existing types).

Add these two helpers just before `function reduceRegister(` :

```ts
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
```

- [ ] **Step 3: reducer — `commitTurn` helper (extrait de NEXT_TURN, + enregistrement history)**

Add this function just before the `reducer` function definition (after `reduceRegister`). It is the body of the old `NEXT_TURN`, plus a `TurnRecord` appended:

```ts
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
```

- [ ] **Step 4: reducer — enregistrer le tour gagnant dans les 3 chemins de victoire**

In `reduceRegister`, add a history entry on each winning return.

**(a) Around the Clock win** — in the ATC branch return, add a `history` field:

```ts
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
```

**(b) x01 win** — in the x01 final return (the one after the `if (result.win)` block), add:

```ts
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
```

**(c) Cricket / Cut-throat win** — in the cricket return, add:

```ts
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
```

(The x01 bust return is unchanged — bust turns are recorded later by `commitTurn` when the user presses next.)

- [ ] **Step 5: reducer — Action type + `ROLLBACK_TO_TURN`, and simplify `NEXT_TURN`**

Add to the `Action` union type:

```ts
  | { type: "ROLLBACK_TO_TURN"; index: number }
```

Replace the entire `case "NEXT_TURN": { … }` block with the slim version that delegates to `commitTurn`:

```ts
    case "NEXT_TURN": {
      if (state.winnerId) {
        return state;
      }
      return withHistory(state, commitTurn(state));
    }
```

Add a new case (place it right after `NEXT_TURN`):

```ts
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
```

- [ ] **Step 6: reducer — `history: []` dans DEFAULT_STATE / START_GAME / NEXT_LEG / NEW_GAME, et HYDRATE**

In `DEFAULT_STATE`, add after `round: 1,`:

```ts
  history: [],
```

In `START_GAME`'s returned object, add after `round: 1,`:

```ts
        history: [],
```

In `NEXT_LEG`'s returned object, add after `round: 1,`:

```ts
        history: [],
```

In `NEW_GAME`'s returned object, add after `round: 1,`:

```ts
        history: [],
```

In `HYDRATE`'s returned object, add after `round: saved.round ?? 1,`:

```ts
        history: saved.history ?? [],
```

- [ ] **Step 7: API — `rollbackToTurn`**

In `interface DartsGame`, add after `markRecorded: () => void;`:

```ts
  rollbackToTurn: (index: number) => void;
```

In the `useMemo` returned object, add after `markRecorded: () => dispatch({ type: "MARK_RECORDED" }),`:

```ts
      rollbackToTurn: (index) => dispatch({ type: "ROLLBACK_TO_TURN", index }),
```

- [ ] **Step 8: Vérifier typage + build**

Run: `npx tsc --noEmit && npm run build`
Expected: zéro sortie tsc ; « Compiled successfully ». (Jeu, undo, bust, victoire, legs inchangés ; `history` se remplit.)

- [ ] **Step 9: Commit**

```bash
git add src/interfaces/index.ts src/hooks/useDartsGame.ts
git commit -m "feat: historique par tour + correction (rollback par re-jeu)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Icône + écran d'historique

**Files:**
- Modify: `src/components/ui/icons.tsx`
- Create: `src/components/ui/HistoryScreen.tsx`
- Create: `src/components/ui/HistoryScreen.module.css`

**Interfaces:**
- Consumes: `GameState`, `TurnRecord`, `DartThrow` de `@/interfaces` ; `ConfirmDialog` de `@/components/ui/ConfirmDialog`.
- Produces: `IconHistory`, and `HistoryScreen({ state, canEdit, onClose, onRollback }: { state: GameState; canEdit: boolean; onClose: () => void; onRollback?: (index: number) => void })`.

- [ ] **Step 1: `IconHistory`**

In `src/components/ui/icons.tsx`, add a new exported icon (mirrors the `Icon` base used by the others):

```tsx
export function IconHistory(p: P) {
  return (
    <Icon {...p}>
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l4 2" />
    </Icon>
  );
}
```

- [ ] **Step 2: `HistoryScreen` component**

Create `src/components/ui/HistoryScreen.tsx` :

```tsx
"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { DartThrow, GameState } from "@/interfaces";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { IconX } from "@/components/ui/icons";
import styles from "./HistoryScreen.module.css";

interface HistoryScreenProps {
  state: GameState;
  canEdit: boolean;
  onClose: () => void;
  onRollback?: (index: number) => void;
}

/* Short label for a thrown dart, e.g. "T20", "D16", "Bull". */
function dartLabel(dart: DartThrow): string {
  if (dart.segment === 0) return "✕";
  if (dart.segment === 50) return "Bull";
  if (dart.segment === 25) return "25";
  const prefix = dart.multiplier === 3 ? "T" : dart.multiplier === 2 ? "D" : "";
  return `${prefix}${dart.segment}`;
}

/* Read-only (or host-editable) list of the current leg's turns. */
export function HistoryScreen({
  state,
  canEdit,
  onClose,
  onRollback,
}: HistoryScreenProps) {
  const [pending, setPending] = useState<number | null>(null);

  if (typeof document === "undefined") {
    return null;
  }

  const isCricket = state.mode === "cricket" || state.mode === "cutthroat";
  const isATC = state.mode === "aroundclock";

  const scoreLabel = (after: number): string => {
    if (isATC) return `${after}/21`;
    if (isCricket) return `${after} pts`;
    return `${after} rest.`;
  };

  const pendingName =
    pending !== null
      ? state.players.find((p) => p.id === state.history[pending]?.playerId)
          ?.name ?? ""
      : "";

  return createPortal(
    <div className={styles.screen}>
      <header className={styles.top}>
        <h1 className={styles.title}>Historique</h1>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Fermer"
        >
          <IconX />
        </button>
      </header>

      {state.history.length === 0 ? (
        <p className={styles.empty}>Aucun tour joué pour l&apos;instant.</p>
      ) : (
        <div className={styles.list}>
          {state.history.map((rec, index) => {
            const player = state.players.find((p) => p.id === rec.playerId);
            const team = state.teams?.find((t) => t.id === rec.sideId);
            return (
              <div key={index} className={styles.row} data-bust={rec.bust ? "true" : "false"}>
                <span className={styles.round}>R{rec.round}</span>
                <div className={styles.who}>
                  <span className={styles.name}>{player?.name ?? "?"}</span>
                  {team && <span className={styles.team}>{team.name}</span>}
                </div>
                <div className={styles.darts}>
                  {rec.darts.length > 0
                    ? rec.darts.map((d, i) => (
                        <span key={i} className={styles.dart}>
                          {dartLabel(d)}
                        </span>
                      ))
                    : <span className={styles.dart}>—</span>}
                </div>
                <span className={styles.score}>
                  {rec.bust ? "Bust" : scoreLabel(rec.scoreAfter)}
                </span>
                {canEdit && onRollback && (
                  <button
                    type="button"
                    className={styles.fix}
                    onClick={() => setPending(index)}
                  >
                    Corriger
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pending !== null && onRollback && (
        <ConfirmDialog
          title="Corriger ce tour ?"
          message={`La partie reviendra juste avant le tour de ${pendingName}. Les tours suivants seront effacés.`}
          confirmLabel="Corriger"
          cancelLabel="Annuler"
          onConfirm={() => {
            onRollback(pending);
            setPending(null);
            onClose();
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>,
    document.body,
  );
}
```

- [ ] **Step 3: `HistoryScreen` styles**

Create `src/components/ui/HistoryScreen.module.css` :

```css
.screen {
  position: fixed;
  inset: 0;
  z-index: 78;
  overflow-y: auto;
  background-color: var(--bg);
  background-image: radial-gradient(
    900px 600px at 50% -10%,
    rgba(201, 164, 74, 0.1),
    transparent 60%
  );
  padding: clamp(14px, 3vh, 24px) clamp(12px, 4vw, 20px) 40px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  animation: rise 0.25s ease both;
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.title {
  font-family: var(--font-display), serif;
  font-size: 1.8rem;
  letter-spacing: 0.04em;
  color: var(--chalk);
}

.close {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--chalk);
  font-size: 1.1rem;
  cursor: pointer;
  display: grid;
  place-items: center;
}

.empty {
  text-align: center;
  color: var(--chalk-dim);
  padding: 40px 0;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: linear-gradient(180deg, var(--surface), var(--bg-deep));
}

.row[data-bust="true"] {
  border-color: var(--red);
}

.round {
  flex-shrink: 0;
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--gold);
  width: 30px;
}

.who {
  display: flex;
  flex-direction: column;
  min-width: 0;
  width: 84px;
  flex-shrink: 0;
}

.name {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--chalk);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.team {
  font-size: 0.62rem;
  color: var(--chalk-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.darts {
  flex: 1;
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.dart {
  font-family: var(--font-display), serif;
  font-size: 1rem;
  color: var(--chalk);
  padding: 2px 7px;
  border-radius: 7px;
  background: var(--bg-deep);
  border: 1px solid var(--line);
}

.score {
  flex-shrink: 0;
  font-size: 0.8rem;
  color: var(--chalk-dim);
  width: 66px;
  text-align: right;
}

.fix {
  flex-shrink: 0;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--line-strong);
  background: transparent;
  color: var(--gold-bright);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.fix:hover {
  border-color: var(--gold);
}
```

- [ ] **Step 4: Vérifier typage + build**

Run: `npx tsc --noEmit && npm run build`
Expected: succès. (`IconX` existe déjà dans `icons.tsx`.)

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/icons.tsx src/components/ui/HistoryScreen.tsx src/components/ui/HistoryScreen.module.css
git commit -m "feat: écran historique de partie + icône

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: GameScreen — bouton historique + nom du prochain joueur

**Files:**
- Modify: `src/components/screens/GameScreen.tsx`

**Interfaces:**
- Consumes: `HistoryScreen` (Task 2), `IconHistory` (Task 2), `game.rollbackToTurn` (Task 1).

- [ ] **Step 1: Imports**

In `src/components/screens/GameScreen.tsx`, add `IconHistory` to the existing icon import block from `@/components/ui/icons`. Add a new import:

```tsx
import { HistoryScreen } from "@/components/ui/HistoryScreen";
```

- [ ] **Step 2: État d'ouverture + nom du prochain joueur**

After the existing `const [confirmQuit, setConfirmQuit] = useState(false);` line, add:

```tsx
  const [showHistory, setShowHistory] = useState(false);
```

After the `atcTurnLabel` definition (just before the `return (`), add:

```tsx
  const nextPlayerName = (() => {
    if (state.order.length === 0) return "";
    const nextId = state.order[(state.currentIndex + 1) % state.order.length];
    return state.players.find((p) => p.id === nextId)?.name ?? "";
  })();
```

- [ ] **Step 3: Bouton historique dans l'en-tête (à côté du son)**

In the header, insert a history button immediately BEFORE the mute/sound button (the one with `aria-label={muted ? "Activer le son" : "Couper le son"}`):

```tsx
        <button
          type="button"
          className={styles.icon}
          onClick={() => setShowHistory(true)}
          aria-label="Historique de la partie"
        >
          <IconHistory />
        </button>
```

- [ ] **Step 4: Nom du prochain joueur dans le bouton de fin de tour**

Replace the next-turn button label line:

```tsx
          {state.turnOver ? "Joueur suivant →" : "Passer le tour"}
```

with:

```tsx
          {state.turnOver
            ? nextPlayerName
              ? `→ ${nextPlayerName}`
              : "Joueur suivant →"
            : "Passer le tour"}
```

- [ ] **Step 5: Rendre `HistoryScreen`**

Just before the final closing `</div>` of the component's returned JSX (after the `{confirmQuit && ( … )}` block), add:

```tsx
      {showHistory && (
        <HistoryScreen
          state={state}
          canEdit
          onClose={() => setShowHistory(false)}
          onRollback={game.rollbackToTurn}
        />
      )}
```

- [ ] **Step 6: Vérifier typage + build**

Run: `npx tsc --noEmit && npm run build`
Expected: succès.

- [ ] **Step 7: Commit**

```bash
git add src/components/screens/GameScreen.tsx
git commit -m "feat: bouton historique + nom du prochain joueur (GameScreen)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: SpectatorScreen — finish + bouton historique

**Files:**
- Modify: `src/components/spectator/SpectatorScreen.tsx`
- Modify: `src/components/spectator/SpectatorScreen.module.css`

**Interfaces:**
- Consumes: `HistoryScreen` (Task 2), `IconHistory` (Task 2), `suggestCheckouts` de `@/utils/checkout`.

Context: `SpectatorScreen` renders from `live.state` (a `GameState`). It already computes `currentPlayer`, `currentSideId`, `isCricket`, `isATC`, and a turn section with slots. It has a header (`styles.top`) with a `liveTag`, `hostInfo`, and a `close` button. `X01PlayerState` may need importing.

- [ ] **Step 1: Imports + état**

Add imports:

```tsx
import { useState } from "react";
import type { X01PlayerState } from "@/interfaces";
import { suggestCheckouts } from "@/utils/checkout";
import { HistoryScreen } from "@/components/ui/HistoryScreen";
import { IconHistory } from "@/components/ui/icons";
```

(If `react`'s `useState` or the interfaces import already exist in the file, merge rather than duplicate.)

Inside the component, after `const state = live.state;`, add:

```tsx
  const [showHistory, setShowHistory] = useState(false);
```

- [ ] **Step 2: Calcul du finish (checkout) du joueur x01 courant**

After the existing `const currentSideId = …` line (or wherever `currentSideId` and `currentPlayer` are available), add:

```tsx
  const activeX01 =
    state.mode === "x01" && currentPlayer && currentSideId
      ? (state.states[currentSideId] as X01PlayerState)
      : null;
  const checkouts =
    activeX01 && activeX01.opened && !state.winnerId && !ended
      ? suggestCheckouts(
          activeX01.score,
          3 - state.darts.length,
          state.rules.outOption,
        )
      : [];
```

(`ended` is already defined in the component as `live.status === "ended"`.)

- [ ] **Step 3: Bouton historique dans l'en-tête (à côté de la croix)**

In the header, immediately BEFORE the existing close button (`className={styles.close}`), insert:

```tsx
        <button
          type="button"
          className={styles.close}
          onClick={() => setShowHistory(true)}
          aria-label="Historique de la partie"
        >
          <IconHistory />
        </button>
```

- [ ] **Step 4: Afficher le finish dans la section tour**

Inside the `{!ended && currentPlayer && ( … )}` turn `<section>`, right after the `</div>` that closes the `styles.slots` block and before the `{state.bust && …}` line, add the checkout display:

```tsx
          {checkouts.length > 0 && (
            <div className={styles.checkout}>
              <span className={styles.checkoutLabel}>Sortie</span>
              <div className={styles.checkoutList}>
                {checkouts.map((combo, i) => (
                  <span
                    key={i}
                    className={styles.checkoutCombo}
                    data-alt={i > 0 ? "true" : undefined}
                  >
                    {combo.join(" · ")}
                  </span>
                ))}
              </div>
            </div>
          )}
```

- [ ] **Step 5: Rendre `HistoryScreen` (lecture seule)**

Just before the final closing of the portal content (the closing `</div>` passed to `createPortal`), add:

```tsx
      {showHistory && (
        <HistoryScreen
          state={state}
          canEdit={false}
          onClose={() => setShowHistory(false)}
        />
      )}
```

- [ ] **Step 6: Styles du finish**

Append to `src/components/spectator/SpectatorScreen.module.css` :

```css
.checkout {
  margin-top: 10px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--green);
  background: rgba(42, 161, 94, 0.1);
}

.checkoutLabel {
  flex-shrink: 0;
  font-size: 0.66rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--green);
  padding-top: 5px;
}

.checkoutList {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}

.checkoutCombo {
  font-family: var(--font-display), serif;
  font-size: 1.3rem;
  letter-spacing: 0.05em;
  color: var(--chalk);
}

.checkoutCombo[data-alt="true"] {
  font-size: 1rem;
  color: var(--chalk-dim);
  opacity: 0.7;
}
```

- [ ] **Step 7: Vérifier typage + build**

Run: `npx tsc --noEmit && npm run build`
Expected: succès.

- [ ] **Step 8: Commit**

```bash
git add src/components/spectator/SpectatorScreen.tsx src/components/spectator/SpectatorScreen.module.css
git commit -m "feat: spectateur — finish (checkout) + bouton historique

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Vérification manuelle finale

Après les 4 tâches (`npm run build` OK) :

1. **Historique + prochain joueur (hôte)** : lancer un 501 à 3 joueurs, jouer 4-5 tours. Le bouton de fin de tour affiche « → [prochain] ». Ouvrir l'historique (icône près du son) : voir chaque tour (round, joueur, fléchettes, score restant), croix pour fermer.
2. **Correction** : dans l'historique, « Corriger » un tour du milieu → confirmer → vérifier que scores, moyennes et historique reviennent à l'état d'avant ce tour, le bon joueur est « à saisir », les tours suivants ont disparu. Rejouer et vérifier la cohérence. Le bouton ↩ annule aussi la correction.
3. **Bust** : provoquer un bust, passer → l'historique montre le tour « Bust ».
4. **Équipes** : un 2v2 → l'historique montre joueur + équipe.
5. **Spectateur (2 comptes)** : hôte joue un 501 avec un pote joueur ; le pote regarde en direct → voit le **finish suggéré** quand l'hôte est ≤ 170 ouvert, ouvre l'**historique** (lecture seule, pas de « Corriger »), et voit une correction de l'hôte se refléter en direct.

---

## Self-Review (effectuée à l'écriture)

- **Couverture spec** : finish spectateur (Task 4) ✓ ; nom prochain joueur (Task 3) ✓ ; historique dans l'état + enregistrement par tour et sur victoire (Task 1 commitTurn + 3 chemins win) ✓ ; écran historique hôte+spectateur avec croix (Task 2, monté en Task 3/4) ✓ ; bouton à côté du son (Task 3) et côté spectateur (Task 4) ✓ ; rollback par re-jeu hôte seul + confirmation (Task 1 ROLLBACK_TO_TURN, Task 2 canEdit/ConfirmDialog) ✓ ; reset par leg + HYDRATE rétro-compat (Task 1) ✓.
- **Cohérence des types** : `TurnRecord { round, playerId, sideId, darts, bust, scoreAfter }` défini en Task 1 et lu à l'identique en Task 2 ; `HistoryScreen` props `{ state, canEdit, onClose, onRollback? }` consommées en Task 3 (canEdit + onRollback) et Task 4 (canEdit=false) ; `rollbackToTurn(index)` défini Task 1, utilisé Task 3 ; `commitTurn`/`reduceRegister` réutilisés par le rollback sans duplication.
- **Non-régression** : `commitTurn` reproduit exactement l'ancien `NEXT_TURN` (mêmes calculs visit/stats) + ajoute l'enregistrement ; le rollback rejoue via les fonctions pures ; `history` par défaut `[]`.
- **Pas de placeholder** : code complet à chaque étape.
