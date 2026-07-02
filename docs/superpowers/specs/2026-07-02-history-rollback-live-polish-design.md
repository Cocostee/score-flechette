# Historique de partie, corrections & polish live — Design

**Date** : 2026-07-02
**App** : Sur la Ligne (compteur de fléchettes, Next.js 16 / React 19 / TypeScript strict, offline-first, CSS Modules, Supabase + Realtime)

## Problème / demandes

Quatre améliorations autour de la partie en cours et de la vue en direct :

1. **Finish côté spectateur** : afficher la sortie suggérée (ex. `T20 · D11`) au
   spectateur, comme l'hôte la voit.
2. **Nom du prochain joueur** dans le bouton « Joueur suivant ».
3. **Historique de la partie en cours** (par tour, joueur/équipe), consultable
   par l'hôte (bouton dans l'en-tête, à côté du son) et par le spectateur (même
   bouton dans la vue live) ; une croix pour revenir.
4. **Corriger un tour** (rollback) : depuis l'historique, l'hôte peut ramener la
   partie juste avant un tour donné et rejouer à partir de là (les tours suivants
   sont abandonnés).

## Décisions cadrées (brainstorming)

- Rollback = **corriger n'importe quel tour depuis l'historique** ; la partie est
  reconstruite juste avant ce tour, on rejoue ensuite. Réservé à l'**hôte** ; le
  spectateur reste en lecture seule.
- L'historique et les corrections concernent le **leg (manche) en cours** —
  l'historique est réinitialisé à chaque nouveau leg (comme les scores/stats). En
  partie à un seul leg (le cas courant), c'est l'historique complet de la partie.

## Architecture

### Modèle : `history` dans `GameState`

Ajout à `GameState` :

```ts
export interface TurnRecord {
  round: number;
  playerId: string;   // qui a lancé
  sideId: string;     // son côté (équipe en mode équipe, sinon = playerId)
  darts: DartThrow[]; // les fléchettes du tour (permet le re-jeu)
  bust: boolean;
  scoreAfter: number; // x01: score restant ; cricket: points ; atc: cibles faites
}

// GameState :
history: TurnRecord[];
```

- **Compact et sérialisable** : ≤ 3 fléchettes par tour → diffusable aux
  spectateurs et persistable en localStorage sans surcoût notable.
- **Rétro-compatible** : `HYDRATE` d'une partie sauvegardée sans `history` →
  `history: []`.
- **Enregistrement** : un `TurnRecord` est ajouté à la fin de chaque tour
  (logique `NEXT_TURN`) et pour le **tour gagnant** (au moment où `winnerId` est
  posé dans `reduceRegister`, puisqu'aucun `NEXT_TURN` ne suit). `scoreAfter` est
  calculé depuis l'état du côté après le tour.
- **Réinitialisation** : `history: []` dans `START_GAME`, `NEXT_LEG`, `NEW_GAME`.

### Rollback : action `ROLLBACK_TO_TURN`

Nouvelle action reducer `{ type: "ROLLBACK_TO_TURN"; index: number }` (hôte). Elle
**reconstruit le leg par re-jeu** plutôt que de stocker des snapshots :

1. Repart d'un état de leg neuf (comme `NEXT_LEG` : `states` reconstruits,
   `stats` remis à zéro, `history: []`, `currentIndex = startIndex`, `round 1`,
   `darts: []`), en conservant `legsWon`, `totalStats`, `players`, `teams`, etc.
2. Rejoue les tours `history[0..index)` : pour chaque tour, applique ses `darts`
   via `reduceRegister`, puis avance via la logique de `NEXT_TURN` — ce qui
   ré-append le `TurnRecord` et recalcule stats/scores **avec la logique
   existante** (pas de duplication).
3. Résultat : l'état exact du **début du tour `index`**, `history` tronqué à
   `[0..index)`, joueur de ce tour prêt à re-saisir, tours suivants abandonnés.

Pour permettre l'étape 2, le corps de `NEXT_TURN` est extrait dans un helper pur
`commitTurn(state)` (avance de tour + enregistrement du `TurnRecord`), réutilisé
par le cas `NEXT_TURN` et par le re-jeu du rollback. L'action est empilée dans
`past` (donc elle-même annulable via le bouton ↩).

Le re-jeu est **déterministe** (les fonctions `applyX01Dart` / `applyCricketDart`
/ `applyAroundClockDart` sont pures) et fiable. Comme `history` est dans l'état
persisté et diffusé, la correction reste possible après un rechargement de page,
et le spectateur voit scores + historique se corriger **en direct**.

**Garde** : le rollback ne cible que des tours du leg courant déjà terminés
(présents dans `history`). Pas de rollback sur un tour gagnant qui aurait clôturé
le leg (le leg serait terminé). Confirmation avant d'écraser.

### UI

**Écran partagé `HistoryScreen`** (overlay portail) : reçoit l'état (`GameState`
local pour l'hôte, `LiveState` pour le spectateur) + un flag `canEdit` et un
`onRollback(index)` optionnel. Liste les `TurnRecord` en ordre chronologique :
chaque ligne = **round · nom joueur (· équipe) · fléchettes (T20, D11, …) ·
score après**. En-tête avec une **croix** pour fermer. Si `canEdit` (hôte),
chaque ligne a un bouton **« Corriger »** → `ConfirmDialog` (« Corriger le tour de
X ? Les tours suivants seront effacés ») → `onRollback(index)`.

**`GameScreen`** :
- En-tête : nouveau bouton icône **historique** placé **à côté du bouton son**
  (ordre : Accueil · infos mode · Historique · Son · Annuler). Ouvre
  `HistoryScreen` avec `canEdit` et l'action `game.rollbackToTurn`.
- Bouton de fin de tour : affiche **« → [Nom du prochain joueur] »** quand le tour
  est terminé (prochain = `order[(currentIndex+1) % order.length]`, résolu en nom,
  préfixé de l'équipe en mode équipe). Reste « Passer le tour » quand le tour
  n'est pas fini, et « → [Nom] » remplace « Joueur suivant → ».

**`SpectatorScreen`** :
- Ajout de la **sortie suggérée** (finish) pour le joueur x01 courant, via
  `suggestCheckouts` sur l'état live (lecture seule).
- En-tête : même bouton **historique** (à côté de la croix), ouvre `HistoryScreen`
  en lecture seule (`canEdit=false`).

### Nouveaux composants / icônes
- `src/components/ui/HistoryScreen.tsx` (+ `.module.css`).
- `IconHistory` dans `src/components/ui/icons.tsx`.

## Découpage / fichiers

| Fichier | Statut | Rôle |
|---|---|---|
| `src/interfaces/index.ts` | modifié | `TurnRecord` + `history: TurnRecord[]` |
| `src/hooks/useDartsGame.ts` | modifié | `commitTurn` helper, enregistrement history, action `ROLLBACK_TO_TURN` + `rollbackToTurn` sur l'API, resets, HYDRATE |
| `src/components/ui/icons.tsx` | modifié | `IconHistory` |
| `src/components/ui/HistoryScreen.tsx` (+ css) | nouveau | liste des tours, croix, action corriger |
| `src/components/screens/GameScreen.tsx` (+ css) | modifié | bouton historique, nom prochain joueur |
| `src/components/spectator/SpectatorScreen.tsx` (+ css) | modifié | finish + bouton historique |

## Vérification

- `npx tsc --noEmit` (zéro sortie) + `npm run build` (« Compiled successfully »).
- Manuel : jouer plusieurs tours, ouvrir l'historique (hôte), corriger un tour du
  milieu → vérifier que scores/stats/historique reviennent correctement et que le
  re-jeu des tours conservés est exact ; vérifier le nom du prochain joueur dans le
  bouton ; côté spectateur (2 comptes) : voir le finish, ouvrir l'historique en
  lecture seule, et voir une correction de l'hôte se refléter en direct.
- Non-régression : partie solo/local inchangée hors ces ajouts ; le bouton ↩
  (undo) continue de fonctionner.

## Hors scope

- Historique multi-legs (rollback cross-leg) — v1 = leg courant.
- Filtre/onglets par joueur ou équipe dans l'historique (liste chronologique
  unique, chaque ligne indique joueur & équipe).
- Correction côté spectateur (lecture seule stricte).
- Édition libre d'un tour (on corrige = on revient avant et on rejoue ; pas
  d'édition d'une fléchette isolée dans le passé).
