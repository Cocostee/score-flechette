# Spectateur en direct — Design

**Date** : 2026-07-01
**App** : Sur la Ligne (compteur de fléchettes, Next.js 16 / React 19 / TypeScript strict, offline-first, CSS Modules, Supabase backend + Realtime)

## Problème

La partie est scorée sur un seul téléphone (l'hôte). On veut que les potes
**invités et acceptés** puissent **regarder la partie en direct** sur leur propre
téléphone, en **lecture seule** : voir le score, le round, le joueur courant, et
**chaque fléchette du tour au moment où l'hôte la saisit**. Ils ne peuvent rien
faire d'autre que regarder.

## Décisions cadrées (brainstorming)

1. **Entrée spectateur** : une **bannière « @Hôte joue — Regarder en direct »**
   que le pote tape pour ouvrir la vue live. Fermable, et re-rejoignable tant que
   la partie est en cours.
2. **Qui peut regarder** : uniquement les **amis acceptés** de l'hôte (règle RLS
   basée sur `friendships`, comme l'attribution de stats existante), et la
   bannière ne s'affiche qu'aux **joueurs de la partie** (leur `friendUserId` est
   dans la liste des joueurs).
3. **Ce que voit le spectateur** : le scoreboard complet (scores par joueur /
   équipe), le **round**, le **joueur courant**, et les **fléchettes du tour en
   direct** (les 3 slots se remplissent au fur et à mesure que l'hôte saisit).
   Pas de cible, pas de pad, aucun contrôle.

## Architecture

### Transport — table `live_games` + Realtime

Retenu : une table où l'hôte publie l'état courant, que le spectateur lit puis
suit en Realtime. Donne le **rattrapage** (rejoindre en cours de partie) et la
résilience réseau gratuitement — contrairement au broadcast éphémère, écarté car
un spectateur rejoignant en cours ne verrait rien jusqu'au lancer suivant.

```sql
live_games
  host_id     uuid primary key references auth.users(id) on delete cascade
  state       jsonb not null                 -- état allégé (stripPast) sérialisé
  status      text not null default 'live'   -- 'live' | 'ended'
  updated_at  timestamptz not null default now()
```

Une ligne par hôte (sa partie live courante), en **upsert**.

**Politiques RLS :**
- **insert/update (upsert)** : `auth.uid() = host_id` (l'hôte n'écrit que sa
  propre ligne).
- **select** : `auth.uid() = host_id` **ou** il existe une `friendships`
  `accepted` entre `auth.uid()` et `host_id` (même condition que
  `game_players_insert_own`). Un ami accepté peut lire la partie live de l'hôte.
- **delete** : `auth.uid() = host_id`.

Table ajoutée à la publication `supabase_realtime` (idempotent). **SQL fourni
dans `supabase/live_games.sql`, exécuté par l'utilisateur dans Supabase.**

Le `state` publié est l'état **allégé** (`stripPast(state)`, tel que déjà
persisté en localStorage) : `mode`, `rules`, `players`, `teams`, `sideOf`,
`order`, `states`, `currentIndex`, `darts`, `stats`, `legsWon`, `round`,
`turnOver`, `bust`, `winnerId`, `legsTarget`. Tout est du JSON simple. Le champ
`past` (historique d'undo) est exclu.

### Côté hôte — diffusion

Nouveau hook `useLiveBroadcast(game, userId)` monté dans `GameApp`.

- **Condition de diffusion** : l'hôte est connecté (`userId` non nul), la partie
  tourne (`state.screen === "game"`), **et** la partie contient au moins un
  joueur ami (`state.players.some(p => p.friendUserId && p.friendUserId !== userId)`).
  Sinon aucune écriture (parties locales pures totalement inchangées).
- **Cadence** : upsert `{ host_id, state: stripped, status: 'live' }` à **chaque
  changement d'état** de jeu, **débounce ~120 ms** — assez court pour que chaque
  fléchette apparaisse en direct chez le spectateur, assez pour coalescer des
  changements rapprochés.
- **Fin** : quand `state.screen` devient `result` ou `home` (ou au démontage),
  passe la ligne à `status = 'ended'` (dernier `state` conservé pour l'écran de
  fin du spectateur).

### Côté spectateur — réception

Nouveau hook `useLiveSpectator(userId)` monté globalement (comme
`useIncomingInvites`).

- S'abonne en Realtime aux lignes `live_games` lisibles (RLS) et **récentes**
  (`updated_at > now() - 30 min`, filtre appliqué à la lecture initiale pour
  éviter les parties fantômes).
- Une ligne devient pertinente pour la bannière si `status === 'live'` **et** que
  le spectateur est un **joueur** de cette partie
  (`state.players.some(p => p.friendUserId === userId)`).
- Expose : `liveHost` (l'invite courante : id hôte, pseudo hôte, état),
  `watching` (bool), `watch()`, `stopWatching()`.

Le pseudo de l'hôte est résolu via `profiles` (comme pour les invitations).

**`LiveBanner`** (modal/bandeau, réutilise le style de `InviteBanner`) : «
@Hôte joue — Regarder en direct » + bouton Regarder / Fermer. **Priorité** :
si une invitation (`useIncomingInvites`) est en attente en même temps, elle
s'affiche d'abord (il faut accepter avant de pouvoir spectater).

**`SpectatorScreen`** : rendu **lecture seule** de l'état live désérialisé.
Réutilise `PlayerScoreCard` / `TeamScoreCard` pour le scoreboard (mode solo ou
équipe selon `state.teams`), plus un **en-tête de tour** montrant le joueur
courant, le **round**, et les **3 slots de fléchettes du tour** (`state.darts`)
qui se remplissent en direct. Aucun pad, aucune cible, aucun bouton d'action.
Bandeau « Vous regardez @Hôte · en direct ». Bouton fermer → `stopWatching()`
(la bannière pourra rouvrir tant que `status === 'live'`). Quand
`status === 'ended'` : affiche « Partie terminée » + le score final figé, puis
un bouton fermer.

Le spectateur s'abonne aux mises à jour de la ligne pendant qu'il regarde et
re-rend à chaque changement (chaque fléchette).

### Intégration dans `GameApp`

`GameApp` monte `useLiveBroadcast(game, user?.id)` (hôte) et
`useLiveSpectator(user?.id)` (spectateur). Rend `LiveBanner` quand une partie
live pertinente existe et qu'aucune invitation n'est en attente ; rend
`SpectatorScreen` en overlay quand `watching` est vrai. La navigation de jeu
locale de l'hôte (Home/Setup/Game/Result) est inchangée.

## Découpage / fichiers

| Fichier | Statut | Rôle |
|---|---|---|
| `supabase/live_games.sql` | nouveau | table + RLS + publication realtime |
| `src/lib/liveGame.ts` | nouveau | `pushLiveState`, `endLiveGame`, `listLiveForViewer`, `subscribeLiveForViewer`, `subscribeLiveRow` |
| `src/hooks/useLiveBroadcast.ts` | nouveau | côté hôte : upsert débounce + fin |
| `src/hooks/useLiveSpectator.ts` | nouveau | côté spectateur : écoute globale, bannière, état courant |
| `src/components/spectator/LiveBanner.tsx` (+ `.module.css`) | nouveau | bannière « Regarder en direct » |
| `src/components/spectator/SpectatorScreen.tsx` (+ `.module.css`) | nouveau | scoreboard lecture seule + tour + fléchettes live |
| `src/components/GameApp.tsx` | modifié | monte les deux hooks + rend bannière/écran |

### Interfaces clés

```ts
// lib/liveGame.ts
import type { GameState } from "@/interfaces";
// The published state is stripPast(state): a full GameState with past emptied
// ([]), so it stays type-compatible with GameState for the read-only cards.
export type LiveState = GameState;
export interface LiveGame {
  hostId: string;
  hostUsername: string;
  state: LiveState;
  status: "live" | "ended";
}
export async function pushLiveState(hostId: string, state: LiveState): Promise<void>;
export async function endLiveGame(hostId: string): Promise<void>;
export async function listLiveForViewer(viewerId: string): Promise<LiveGame[]>;
// subscribeLiveForViewer(viewerId, onChange) : écoute globale (bannière)
// subscribeLiveRow(hostId, onChange) : écoute d'une partie regardée
// → chacune renvoie une fonction de désabonnement

// hooks/useLiveSpectator.ts
interface LiveSpectatorState {
  available: LiveGame | null;   // partie live pertinente (pour la bannière)
  watching: LiveGame | null;    // partie actuellement regardée (état live à jour)
  watch: () => void;
  stopWatching: () => void;
}
```

Le composant `SpectatorScreen` lit `watching.state` (un `LiveState`) et le passe
aux cartes de score exactement comme `GameScreen` le fait avec son état local,
mais sans aucun `dispatch`/contrôle.

## Vérification

- `npx tsc --noEmit` (zéro sortie) + `npm run build` (« Compiled successfully »).
- Vérification manuelle réelle : deux comptes amis acceptés, l'un hôte lance une
  partie avec l'autre comme joueur ami → le second voit la bannière, ouvre la vue,
  et voit le score + chaque fléchette en direct pendant que le premier saisit ;
  fermeture/réouverture ; fin de partie → « Partie terminée ». Non testable en
  preview local sans deux sessions authentifiées.

## Hors scope

- Spectateurs non-joueurs / invitation « spectateur » distincte (v1 = joueurs
  amis uniquement).
- Interaction du spectateur (chat, réactions) — lecture seule stricte.
- Notifications push (bannière seulement app ouverte).
- Rejeu / historique post-partie côté spectateur au-delà du dernier état figé.
- Changement au moteur `useDartsGame` (on lit son état, on ne le modifie pas).
