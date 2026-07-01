# Spectateur en direct — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre aux amis acceptés qui sont joueurs d'une partie de la regarder en direct (lecture seule : score, round, fléchettes du tour) sur leur propre téléphone.

**Architecture:** L'hôte upsert son état de jeu allégé dans une table `live_games` à chaque fléchette (débounce ~120 ms). Un ami accepté (RLS) reçoit une bannière « Regarder en direct » via Realtime, ouvre un `SpectatorScreen` qui lit la ligne et suit ses mises à jour. Réutilise les patterns du système d'invitation (`gameInvites`) et le scoreboard existant (`PlayerScoreCard`/`TeamScoreCard`).

**Tech Stack:** Next.js 16, React 19, TypeScript strict, CSS Modules, `@supabase/supabase-js` (client + Realtime `postgres_changes`).

## Global Constraints

- `.env.local` jamais commité. Les migrations SQL DDL sont exécutées par l'UTILISATEUR dans Supabase (pas de CLI). Aucune commande `supabase`.
- `getSupabase()` peut renvoyer `null` → toute fonction data dégrade proprement (no-op / défaut), comme `src/lib/gameInvites.ts`.
- TypeScript strict, pas de `any` implicite.
- PAS de runner de tests dans le repo. Vérification = `npx tsc --noEmit` (ZÉRO sortie) et, pour les tâches UI, `npm run build` (« Compiled successfully »). Pas de tests unitaires inventés.
- **Lecture seule stricte** côté spectateur : aucun `dispatch`, aucun contrôle de jeu.
- **Diffusion conditionnelle** : l'hôte ne publie QUE s'il est connecté, en écran `game`, et que la partie a au moins un joueur ami (`friendUserId` ≠ soi). Sinon rien n'est écrit.
- Accès spectateur = **amis acceptés** (RLS via `friendships`), bannière filtrée aux **joueurs** de la partie.
- Fraîcheur : ne considérer que les lignes `live_games` mises à jour il y a < 30 min.
- Messages de commit terminés par `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

| Fichier | Statut | Rôle |
|---|---|---|
| `supabase/live_games.sql` | nouveau | table + RLS + publication realtime |
| `src/lib/liveGame.ts` | nouveau | upsert/end/list + abonnements realtime |
| `src/hooks/useLiveBroadcast.ts` | nouveau | côté hôte : diffusion débouncée |
| `src/hooks/useLiveSpectator.ts` | nouveau | côté spectateur : bannière + partie regardée |
| `src/components/spectator/LiveBanner.tsx` (+ `.module.css`) | nouveau | bannière « Regarder en direct » |
| `src/components/spectator/SpectatorScreen.tsx` (+ `.module.css`) | nouveau | scoreboard lecture seule + tour + fléchettes |
| `src/components/GameApp.tsx` | modifié | monte les 2 hooks + rend bannière/écran |

---

## Task 1: Migration SQL `live_games`

**Files:**
- Create: `supabase/live_games.sql`

**Interfaces:**
- Produces: table `public.live_games (host_id, state, status, updated_at)` lue/écrite par `src/lib/liveGame.ts` (Task 2).

- [ ] **Step 1: Créer le fichier**

Create `supabase/live_games.sql` :

```sql
-- Phase 6 : spectateur en direct — l'hôte publie l'état, les amis regardent.
-- À exécuter une seule fois dans Supabase → SQL Editor.

create table if not exists public.live_games (
  host_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  status text not null default 'live',  -- 'live' | 'ended'
  updated_at timestamptz not null default now()
);

alter table public.live_games enable row level security;

-- L'hôte n'écrit que sa propre ligne
create policy "live_games_insert_host" on public.live_games
  for insert with check (auth.uid() = host_id);
create policy "live_games_update_host" on public.live_games
  for update using (auth.uid() = host_id)
  with check (auth.uid() = host_id);
create policy "live_games_delete_host" on public.live_games
  for delete using (auth.uid() = host_id);

-- Lecture : l'hôte, ou un ami accepté de l'hôte (même règle que l'attribution de stats)
create policy "live_games_select_friend" on public.live_games
  for select using (
    auth.uid() = host_id
    or exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = host_id)
          or (f.addressee_id = auth.uid() and f.requester_id = host_id)
        )
    )
  );

create index if not exists live_games_updated_idx on public.live_games (updated_at);

-- Realtime : diffuser les changements (idempotent)
do $$
begin
  alter publication supabase_realtime add table public.live_games;
exception
  when duplicate_object then null;
end $$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/live_games.sql
git commit -m "feat: migration table live_games + RLS + realtime

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 3: Demander l'exécution**

Indiquer à l'utilisateur : « Exécute `supabase/live_games.sql` dans Supabase → SQL Editor avant de tester le direct. » (Étape manuelle.)

---

## Task 2: Couche données `lib/liveGame.ts`

**Files:**
- Create: `src/lib/liveGame.ts`

**Interfaces:**
- Consumes: `getSupabase()` ; `GameState` de `@/interfaces`.
- Produces :
  - `type LiveState = GameState` (l'état publié = `stripPast(state)`, `past` vide).
  - `interface LiveGame { hostId: string; hostUsername: string; state: LiveState; status: "live" | "ended" }`
  - `pushLiveState(hostId: string, state: LiveState): Promise<void>`
  - `endLiveGame(hostId: string): Promise<void>`
  - `listLiveForViewer(viewerId: string): Promise<LiveGame[]>` (lignes live+récentes lisibles, pseudo hôte résolu)
  - `subscribeLiveForViewer(onChange: () => void): () => void` (canal global, RLS filtre)
  - `subscribeLiveRow(hostId: string, onChange: (row: { state: LiveState; status: "live" | "ended" } | null) => void): () => void`

- [ ] **Step 1: Écrire le module**

Create `src/lib/liveGame.ts` :

```ts
import type { GameState } from "@/interfaces";
import { getSupabase } from "@/lib/supabase";

// L'état publié est stripPast(state) : un GameState complet avec past vidé ([]).
export type LiveState = GameState;

export interface LiveGame {
  hostId: string;
  hostUsername: string;
  state: LiveState;
  status: "live" | "ended";
}

interface LiveRow {
  host_id: string;
  state: LiveState;
  status: string;
  updated_at: string;
}

/* Publie (upsert) l'état courant de la partie de l'hôte. */
export async function pushLiveState(
  hostId: string,
  state: LiveState,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    return;
  }
  await supabase
    .from("live_games")
    .upsert(
      { host_id: hostId, state, status: "live", updated_at: new Date().toISOString() },
      { onConflict: "host_id" },
    );
}

/* Marque la partie live de l'hôte comme terminée (garde le dernier état). */
export async function endLiveGame(hostId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    return;
  }
  await supabase
    .from("live_games")
    .update({ status: "ended", updated_at: new Date().toISOString() })
    .eq("host_id", hostId);
}

/* Liste les parties live récentes (< 30 min) lisibles par le spectateur,
   pseudo de l'hôte résolu via profiles. La RLS restreint aux amis acceptés. */
export async function listLiveForViewer(viewerId: string): Promise<LiveGame[]> {
  const supabase = getSupabase();
  if (!supabase || !viewerId) {
    return [];
  }
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("live_games")
    .select("host_id, state, status, updated_at")
    .eq("status", "live")
    .gt("updated_at", cutoff)
    .order("updated_at", { ascending: false });
  const rows = (data as LiveRow[] | null) ?? [];
  const hostRows = rows.filter((r) => r.host_id !== viewerId);
  if (hostRows.length === 0) {
    return [];
  }
  const hostIds = [...new Set(hostRows.map((r) => r.host_id))];
  const { data: profs } = await supabase
    .from("profiles")
    .select("id, username")
    .in("id", hostIds);
  const names = new Map(
    ((profs as { id: string; username: string }[] | null) ?? []).map((p) => [
      p.id,
      p.username,
    ]),
  );
  return hostRows.map((r) => ({
    hostId: r.host_id,
    hostUsername: names.get(r.host_id) ?? "?",
    state: r.state,
    status: r.status as "live" | "ended",
  }));
}

/* Écoute globale : toute modification d'une ligne live_games lisible (RLS)
   déclenche onChange. Le hook re-fetch ensuite. */
export function subscribeLiveForViewer(onChange: () => void): () => void {
  const supabase = getSupabase();
  if (!supabase) {
    return () => {};
  }
  const channel = supabase
    .channel("live_games:viewer")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "live_games" },
      () => onChange(),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/* Écoute d'une partie précise (celle regardée) : chaque mise à jour renvoie
   le nouvel état + statut. */
export function subscribeLiveRow(
  hostId: string,
  onChange: (row: { state: LiveState; status: "live" | "ended" } | null) => void,
): () => void {
  const supabase = getSupabase();
  if (!supabase) {
    return () => {};
  }
  const channel = supabase
    .channel(`live_games:row:${hostId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "live_games",
        filter: `host_id=eq.${hostId}`,
      },
      (payload) => {
        const row = (payload.new ?? payload.old) as Partial<LiveRow> | undefined;
        if (!row || !row.state || !row.status) {
          onChange(null);
          return;
        }
        onChange({ state: row.state, status: row.status as "live" | "ended" });
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
```

- [ ] **Step 2: Vérifier le typage**

Run: `npx tsc --noEmit`
Expected: aucune sortie.

- [ ] **Step 3: Commit**

```bash
git add src/lib/liveGame.ts
git commit -m "feat: couche données partie en direct (live_games)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Hook hôte `useLiveBroadcast`

**Files:**
- Create: `src/hooks/useLiveBroadcast.ts`

**Interfaces:**
- Consumes: `pushLiveState`, `endLiveGame` de `@/lib/liveGame` ; `DartsGame` de `@/hooks/useDartsGame`.
- Produces: `useLiveBroadcast(game: DartsGame, userId: string | null): void`

- [ ] **Step 1: Écrire le hook**

Create `src/hooks/useLiveBroadcast.ts` :

```ts
"use client";

import { useEffect, useRef } from "react";
import type { DartsGame } from "@/hooks/useDartsGame";
import { endLiveGame, pushLiveState } from "@/lib/liveGame";

/* Côté hôte : diffuse l'état de la partie (débounce ~120 ms) tant qu'elle
   tourne et qu'elle contient un joueur ami. Marque 'ended' à la fin. */
export function useLiveBroadcast(game: DartsGame, userId: string | null): void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(false);
  const state = game.state;

  useEffect(() => {
    if (!userId) {
      return;
    }
    const hasFriend = state.players.some(
      (p) => p.friendUserId && p.friendUserId !== userId,
    );

    if (state.screen === "game" && hasFriend) {
      const snapshot = { ...state, past: [] };
      if (timer.current) {
        clearTimeout(timer.current);
      }
      timer.current = setTimeout(() => {
        void pushLiveState(userId, snapshot);
      }, 120);
      active.current = true;
    } else if (active.current) {
      // La partie n'est plus en cours (résultat / accueil) → terminée.
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      void endLiveGame(userId);
      active.current = false;
    }

    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, [state, userId]);

  // Sécurité : marque terminé si le composant se démonte pendant une partie.
  useEffect(() => {
    return () => {
      if (active.current && userId) {
        void endLiveGame(userId);
        active.current = false;
      }
    };
  }, [userId]);
}
```

- [ ] **Step 2: Vérifier le typage**

Run: `npx tsc --noEmit`
Expected: aucune sortie.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useLiveBroadcast.ts
git commit -m "feat: hook hôte useLiveBroadcast (diffusion débouncée)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Hook spectateur + bannière

**Files:**
- Create: `src/hooks/useLiveSpectator.ts`
- Create: `src/components/spectator/LiveBanner.tsx`
- Create: `src/components/spectator/LiveBanner.module.css`

**Interfaces:**
- Consumes: `listLiveForViewer`, `subscribeLiveForViewer`, `subscribeLiveRow`, `LiveGame` de `@/lib/liveGame`.
- Produces :
  - `interface LiveSpectatorState { available: LiveGame | null; watching: LiveGame | null; watch: () => void; dismiss: () => void; stopWatching: () => void }`
  - `useLiveSpectator(userId: string | null): LiveSpectatorState`
  - `LiveBanner({ hostUsername, onWatch, onDismiss }: { hostUsername: string; onWatch: () => void; onDismiss: () => void })`

- [ ] **Step 1: Écrire le hook spectateur**

Create `src/hooks/useLiveSpectator.ts` :

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listLiveForViewer,
  subscribeLiveForViewer,
  subscribeLiveRow,
  type LiveGame,
} from "@/lib/liveGame";

export interface LiveSpectatorState {
  available: LiveGame | null;
  watching: LiveGame | null;
  watch: () => void;
  dismiss: () => void;
  stopWatching: () => void;
}

/* Côté spectateur : détecte une partie live d'un ami dont on est joueur
   (bannière), et suit la partie regardée en direct. */
export function useLiveSpectator(userId: string | null): LiveSpectatorState {
  const [available, setAvailable] = useState<LiveGame | null>(null);
  const [watching, setWatching] = useState<LiveGame | null>(null);
  const watchingHost = useRef<string | null>(null);
  const dismissedHost = useRef<string | null>(null);

  // Écoute globale → partie live pertinente pour la bannière.
  const refresh = useCallback(async (): Promise<void> => {
    if (!userId) {
      setAvailable(null);
      return;
    }
    const list = await listLiveForViewer(userId);
    // Ne garder que les parties où le spectateur est un joueur.
    const relevant =
      list.find((lg) =>
        lg.state.players.some((p) => p.friendUserId === userId),
      ) ?? null;
    if (!relevant) {
      // Plus de partie live → réinitialise un éventuel masquage.
      dismissedHost.current = null;
      setAvailable(null);
      return;
    }
    // Masquée manuellement pour cette partie précise → reste cachée.
    setAvailable(relevant.hostId === dismissedHost.current ? null : relevant);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setAvailable(null);
      return;
    }
    let active = true;
    void refresh();
    const unsub = subscribeLiveForViewer(() => {
      if (active) {
        void refresh();
      }
    });
    return () => {
      active = false;
      unsub();
    };
  }, [userId, refresh]);

  // Suivi de la partie regardée.
  useEffect(() => {
    const host = watching?.hostId ?? null;
    if (host === watchingHost.current) {
      return;
    }
    watchingHost.current = host;
    if (!host) {
      return;
    }
    const unsub = subscribeLiveRow(host, (row) => {
      if (!row) {
        return;
      }
      setWatching((cur) =>
        cur && cur.hostId === host
          ? { ...cur, state: row.state, status: row.status }
          : cur,
      );
    });
    return () => {
      unsub();
    };
  }, [watching?.hostId]);

  const watch = useCallback(() => {
    setAvailable((av) => {
      if (av) {
        setWatching(av);
      }
      return av;
    });
  }, []);

  const dismiss = useCallback(() => {
    setAvailable((av) => {
      if (av) {
        dismissedHost.current = av.hostId;
      }
      return null;
    });
  }, []);

  const stopWatching = useCallback(() => {
    setWatching(null);
    watchingHost.current = null;
  }, []);

  return { available, watching, watch, dismiss, stopWatching };
}
```

- [ ] **Step 2: Écrire la bannière**

Create `src/components/spectator/LiveBanner.tsx` :

```tsx
"use client";

import { createPortal } from "react-dom";
import styles from "./LiveBanner.module.css";

interface LiveBannerProps {
  hostUsername: string;
  onWatch: () => void;
  onDismiss: () => void;
}

/* Bannière proposant de regarder la partie live d'un ami. */
export function LiveBanner({ hostUsername, onWatch, onDismiss }: LiveBannerProps) {
  if (typeof document === "undefined") {
    return null;
  }
  return createPortal(
    <div className={styles.wrap}>
      <div className={styles.banner} role="status">
        <span className={styles.dot} />
        <span className={styles.text}>
          @{hostUsername} joue en direct
        </span>
        <button type="button" className={styles.watch} onClick={onWatch}>
          Regarder
        </button>
        <button
          type="button"
          className={styles.close}
          onClick={onDismiss}
          aria-label="Masquer"
        >
          ✕
        </button>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 3: Écrire les styles de la bannière**

Create `src/components/spectator/LiveBanner.module.css` :

```css
.wrap {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 16px;
  z-index: 70;
  display: flex;
  justify-content: center;
  padding: 0 16px;
  pointer-events: none;
  animation: rise 0.25s ease both;
}

.banner {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 420px;
  width: 100%;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--line-strong);
  background: linear-gradient(180deg, var(--surface-2), var(--surface));
  box-shadow: var(--shadow);
}

.dot {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--red);
  box-shadow: 0 0 0 0 rgba(216, 53, 42, 0.6);
  animation: livePulse 1.4s ease-in-out infinite;
}

@keyframes livePulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(216, 53, 42, 0.5); }
  50% { box-shadow: 0 0 0 6px rgba(216, 53, 42, 0); }
}

.text {
  flex: 1;
  min-width: 0;
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--chalk);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.watch {
  flex-shrink: 0;
  padding: 8px 16px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(180deg, var(--gold-bright), var(--gold));
  color: var(--ink);
  font-family: var(--font-display), serif;
  font-size: 1.05rem;
  letter-spacing: 0.03em;
  cursor: pointer;
}

.close {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--chalk-dim);
  font-size: 0.9rem;
  cursor: pointer;
}
```

- [ ] **Step 4: Vérifier le typage et le build**

Run: `npx tsc --noEmit && npm run build`
Expected: typage sans sortie ; « Compiled successfully ».

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useLiveSpectator.ts src/components/spectator/LiveBanner.tsx src/components/spectator/LiveBanner.module.css
git commit -m "feat: hook spectateur + bannière regarder en direct

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Écran spectateur (lecture seule)

**Files:**
- Create: `src/components/spectator/SpectatorScreen.tsx`
- Create: `src/components/spectator/SpectatorScreen.module.css`

**Interfaces:**
- Consumes: `LiveGame` de `@/lib/liveGame` ; `PlayerScoreCard`, `TeamScoreCard`, `liveRanks`, `getMode`, `dartMarks` (existants) ; `DartThrow` de `@/interfaces`.
- Produces: `SpectatorScreen({ live, onClose }: { live: LiveGame; onClose: () => void })`

- [ ] **Step 1: Écrire l'écran**

Create `src/components/spectator/SpectatorScreen.tsx` :

```tsx
"use client";

import { createPortal } from "react-dom";
import type { DartThrow } from "@/interfaces";
import type { LiveGame } from "@/lib/liveGame";
import { getMode } from "@/data/modes";
import { dartMarks } from "@/utils/cricket";
import { liveRanks } from "@/utils/ranking";
import { PlayerScoreCard } from "@/components/ui/PlayerScoreCard";
import { TeamScoreCard } from "@/components/ui/TeamScoreCard";
import styles from "./SpectatorScreen.module.css";

interface SpectatorScreenProps {
  live: LiveGame;
  onClose: () => void;
}

/* Short label for a thrown dart, e.g. "T20", "D16", "Bull". */
function dartLabel(dart: DartThrow): string {
  if (dart.segment === 0) return "✕";
  if (dart.segment === 50) return "Bull";
  if (dart.segment === 25) return "25";
  const prefix = dart.multiplier === 3 ? "T" : dart.multiplier === 2 ? "D" : "";
  return `${prefix}${dart.segment}`;
}

/* Read-only live view of another player's game. No controls. */
export function SpectatorScreen({ live, onClose }: SpectatorScreenProps) {
  if (typeof document === "undefined") {
    return null;
  }
  const state = live.state;
  const info = getMode(state.mode);
  const isCricket = state.mode === "cricket" || state.mode === "cutthroat";
  const isATC = state.mode === "aroundclock";
  const ended = live.status === "ended";

  const ranks = liveRanks(state);
  const currentId =
    state.order.length > 0 ? state.order[state.currentIndex] : null;
  const currentPlayer = currentId
    ? state.players.find((p) => p.id === currentId) ?? null
    : null;
  const currentSideId = currentPlayer
    ? state.sideOf[currentPlayer.id] ?? currentPlayer.id
    : null;
  const turnPoints = state.darts.reduce((sum, d) => sum + d.points, 0);
  const turnMarks = state.darts.reduce((sum, d) => sum + dartMarks(d), 0);
  const slots = [0, 1, 2];

  const winnerName = state.winnerId
    ? state.teams?.find((t) => t.id === state.winnerId)?.name ??
      state.players.find((p) => p.id === state.winnerId)?.name ??
      ""
    : "";

  return createPortal(
    <div className={styles.screen}>
      <header className={styles.top}>
        <div className={styles.liveTag}>
          <span className={styles.dot} />
          {ended ? "Terminé" : "En direct"}
        </div>
        <div className={styles.hostInfo}>
          <span className={styles.hostName}>@{live.hostUsername}</span>
          <span className={styles.modeName}>{info.name}</span>
        </div>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Fermer"
        >
          ✕
        </button>
      </header>

      {ended && (
        <div className={styles.endedBanner}>
          Partie terminée{winnerName ? ` — ${winnerName} gagne` : ""}
        </div>
      )}

      <div
        className={styles.board}
        data-many={
          (state.teams ? state.teams.length : state.players.length) > 2
            ? "true"
            : "false"
        }
      >
        {state.teams
          ? state.teams.map((team) => (
              <TeamScoreCard
                key={team.id}
                team={team}
                state={state.states[team.id]}
                members={team.playerIds
                  .map((pid) => state.players.find((p) => p.id === pid))
                  .filter((p): p is NonNullable<typeof p> => p != null)}
                stats={state.stats}
                legsWon={state.legsWon[team.id] ?? 0}
                showLegs={state.legsTarget > 1}
                rank={ranks[team.id]}
                showRank={state.teams.length > 1}
                isCurrentTeam={
                  currentSideId === team.id && !state.winnerId && !ended
                }
                currentPlayerId={currentPlayer?.id ?? null}
                isWinner={state.winnerId === team.id}
              />
            ))
          : state.players.map((player, index) => (
              <PlayerScoreCard
                key={player.id}
                player={player}
                state={state.states[player.id]}
                stats={state.stats[player.id]}
                legsWon={state.legsWon[player.id] ?? 0}
                showLegs={state.legsTarget > 1}
                startScore={state.rules.startScore}
                rank={ranks[player.id]}
                showRank={state.players.length > 1}
                isCurrent={index === state.currentIndex && !state.winnerId && !ended}
                isWinner={state.winnerId === player.id}
              />
            ))}
      </div>

      {!ended && currentPlayer && (
        <section className={styles.turn}>
          <div className={styles.turnHead}>
            <span className={styles.turnPlayer}>
              {state.teams
                ? `${state.teams.find((t) => t.id === currentSideId)?.name ?? ""} · ${currentPlayer.name}`
                : currentPlayer.name}
              <span className={styles.turnRound}>Round {state.round}</span>
            </span>
            <span className={styles.turnTotal}>
              {isATC
                ? "Autour de l'horloge"
                : isCricket
                  ? `${turnMarks} marq.`
                  : `${turnPoints} pts`}
            </span>
          </div>
          <div className={styles.slots}>
            {slots.map((slot) => {
              const dart = state.darts[slot];
              const sub = dart
                ? isCricket
                  ? `${dartMarks(dart)} marq.`
                  : isATC
                    ? dart.segment === 0
                      ? "raté"
                      : "touché"
                    : `${dart.points} pts`
                : `Fléch. ${slot + 1}`;
              return (
                <div
                  key={slot}
                  className={styles.slot}
                  data-filled={dart ? "true" : "false"}
                >
                  <span className={styles.slotLabel}>
                    {dart ? dartLabel(dart) : "—"}
                  </span>
                  <span className={styles.slotSub}>{sub}</span>
                </div>
              );
            })}
          </div>
          {state.bust && <div className={styles.bust}>Bust</div>}
        </section>
      )}
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Écrire les styles**

Create `src/components/spectator/SpectatorScreen.module.css` :

```css
.screen {
  position: fixed;
  inset: 0;
  z-index: 75;
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
  gap: 14px;
  animation: rise 0.25s ease both;
}

.top {
  display: flex;
  align-items: center;
  gap: 12px;
}

.liveTag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--red);
  color: var(--red);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--red);
  animation: livePulse 1.4s ease-in-out infinite;
}

@keyframes livePulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.hostInfo {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  text-align: center;
}

.hostName {
  font-size: 1rem;
  font-weight: 700;
  color: var(--chalk);
}

.modeName {
  font-size: 0.72rem;
  color: var(--chalk-dim);
}

.close {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--chalk);
  font-size: 1rem;
  cursor: pointer;
}

.endedBanner {
  padding: 12px;
  text-align: center;
  border-radius: var(--radius);
  border: 1px solid var(--gold);
  background: rgba(201, 164, 74, 0.12);
  color: var(--gold-bright);
  font-family: var(--font-display), serif;
  font-size: 1.3rem;
  letter-spacing: 0.04em;
}

.board {
  display: flex;
  gap: 10px;
}

.board[data-many="true"] {
  flex-wrap: wrap;
}

.board[data-many="true"] > * {
  flex: 1 1 calc(50% - 5px);
}

.turn {
  background: linear-gradient(180deg, var(--surface), var(--bg-deep));
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 14px;
}

.turnHead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}

.turnPlayer {
  display: flex;
  align-items: baseline;
  gap: 9px;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--chalk);
}

.turnRound {
  font-size: 0.66rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--gold);
}

.turnTotal {
  font-size: 0.84rem;
  color: var(--gold-bright);
  font-family: var(--font-display), serif;
}

.slots {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 12px 6px;
  border-radius: 10px;
  border: 1px dashed var(--line-strong);
  background: var(--bg-deep);
}

.slot[data-filled="true"] {
  border-style: solid;
  border-color: var(--gold);
  background: rgba(201, 164, 74, 0.08);
  animation: popIn 0.2s ease both;
}

.slotLabel {
  font-family: var(--font-display), serif;
  font-size: 1.5rem;
  color: var(--chalk);
}

.slotSub {
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--chalk-faint);
}

.bust {
  margin-top: 10px;
  padding: 8px;
  text-align: center;
  border-radius: 10px;
  font-family: var(--font-display), serif;
  font-size: 1.1rem;
  letter-spacing: 0.1em;
  color: #fff;
  background: linear-gradient(180deg, var(--red), var(--red-deep));
}
```

- [ ] **Step 3: Vérifier le typage et le build**

Run: `npx tsc --noEmit && npm run build`
Expected: succès.

- [ ] **Step 4: Commit**

```bash
git add src/components/spectator/SpectatorScreen.tsx src/components/spectator/SpectatorScreen.module.css
git commit -m "feat: écran spectateur lecture seule (score, round, fléchettes live)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Montage dans `GameApp`

**Files:**
- Modify: `src/components/GameApp.tsx`

**Interfaces:**
- Consumes: `useLiveBroadcast` (Task 3), `useLiveSpectator` (Task 4), `LiveBanner` (Task 4), `SpectatorScreen` (Task 5). `incoming` (invitations) déjà présent.

- [ ] **Step 1: Imports**

Dans `src/components/GameApp.tsx`, ajouter après l'import `useIncomingInvites` :

```tsx
import { useLiveBroadcast } from "@/hooks/useLiveBroadcast";
import { useLiveSpectator } from "@/hooks/useLiveSpectator";
import { LiveBanner } from "@/components/spectator/LiveBanner";
import { SpectatorScreen } from "@/components/spectator/SpectatorScreen";
```

- [ ] **Step 2: Appeler les hooks**

Après la ligne `const incoming = useIncomingInvites(user?.id ?? null);`, ajouter :

```tsx
  useLiveBroadcast(game, user?.id ?? null);
  const spectate = useLiveSpectator(user?.id ?? null);
```

- [ ] **Step 3: Rendre la bannière et l'écran**

Remplacer le bloc de rendu de la bannière d'invitation existant (le `{incoming.current && ( … )}`) et sa fermeture `</div>` finale par :

```tsx
      {incoming.current && (
        <InviteBanner
          invite={incoming.current}
          onAccept={incoming.accept}
          onDecline={incoming.decline}
        />
      )}
      {!incoming.current && spectate.available && !spectate.watching && (
        <LiveBanner
          hostUsername={spectate.available.hostUsername}
          onWatch={spectate.watch}
          onDismiss={spectate.dismiss}
        />
      )}
      {spectate.watching && (
        <SpectatorScreen
          live={spectate.watching}
          onClose={spectate.stopWatching}
        />
      )}
    </div>
```

Notes de comportement (déjà garanties par les hooks) :
- La bannière ne s'affiche pas si une invitation est en attente (priorité invitation).
- La bannière ne s'affiche pas pendant qu'on regarde (`!spectate.watching`).
- Quand l'hôte finit, `spectate.available` repasse à `null` (la ligne n'est plus `live`) → la bannière **se ferme toute seule** ; si on regardait, `SpectatorScreen` affiche « Partie terminée » puis se ferme via le bouton.
- `onDismiss` = `spectate.dismiss` : masque la bannière **pour cette partie précise** (mémorisé via `dismissedHost`) ; elle ne réapparaîtra pour le même hôte qu'après la fin de sa partie (nouvelle partie). `onWatch` = `spectate.watch` ouvre l'écran.

- [ ] **Step 4: Vérifier le build**

Run: `npx tsc --noEmit && npm run build`
Expected: succès.

- [ ] **Step 5: Commit**

```bash
git add src/components/GameApp.tsx
git commit -m "feat: monte diffusion + spectateur direct dans GameApp

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Vérification manuelle finale (deux comptes)

Non reproductible en preview local (deux sessions authentifiées + Realtime). Après déploiement et exécution de `supabase/live_games.sql` :

1. **Pré-requis** : comptes A (hôte) et B, amis acceptés, pseudos définis. B a l'app ouverte.
2. **Diffusion** : sur A, config → ajouter @B comme joueur ami (invitation acceptée par B), lancer un 501. Saisir des fléchettes.
3. **Bannière** : sur B, vérifier l'apparition de « @A joue en direct » en quelques secondes.
4. **Vue live** : B tape « Regarder » → voit le scoreboard, le round, le joueur courant. Quand A saisit un 7 sur un joueur, B voit la 1ʳᵉ fléchette « 7 » apparaître en direct dans les slots.
5. **Fermer / rejoindre** : B ferme (✕) → revient à son app ; la bannière réapparaît ; B peut rouvrir tant que la partie dure.
6. **Fin** : A termine (récap) ou quitte → sur B la vue passe « Partie terminée », et la bannière disparaît d'elle-même.
7. **Non-régression** : une partie 100 % locale (aucun joueur ami) n'écrit rien dans `live_games` (vérifiable : aucune bannière chez les amis).

---

## Self-Review (effectuée à l'écriture)

- **Couverture spec** : table+RLS amis acceptés+realtime (Task 1) ✓ ; upsert/end/list/subscribe (Task 2) ✓ ; diffusion débouncée conditionnée aux joueurs amis (Task 3) ✓ ; bannière filtrée aux joueurs + fermeture auto (Task 4 hook `refresh` + `available` null quand plus live) ✓ ; vue lecture seule score+round+fléchettes live (Task 5) ✓ ; priorité invitation + montage (Task 6) ✓ ; fraîcheur 30 min (Task 2 `listLiveForViewer`) ✓.
- **Cohérence des types** : `LiveState = GameState`, `LiveGame { hostId, hostUsername, state, status }` définis en Task 2 et consommés à l'identique (Tasks 4/5/6) ; `subscribeLiveRow` renvoie `{ state, status }` consommé par le hook ; `SpectatorScreen` props `{ live, onClose }` ; `LiveBanner` props `{ hostUsername, onWatch, onDismiss }`.
- **Non-régression** : aucune modification du moteur `useDartsGame` ni des écrans de jeu ; `GameApp` n'ajoute que des hooks/rendus conditionnels ; parties sans ami ami → zéro écriture.
- **Pas de placeholder** : code complet à chaque étape.
