# Écran « Mon profil » — Design

**Date** : 2026-07-02
**App** : Sur la Ligne (compteur de fléchettes, Next.js 16 / React 19 / TypeScript strict, offline-first, CSS Modules, Supabase backend)

## Problème / demande

Ajouter un bouton **« Mon profil »** dans le modal du compte (à côté de « Mes
amis » et « Mes stats »). Cet écran permet de **modifier sa photo de profil** et
son **pseudo**, et affiche sa **moyenne 3 fléchettes globale**.

## Décisions cadrées

- La « moyenne des 3 fléchettes » = la **moyenne 3 fléchettes globale** du compte
  sur ses parties x01 (`avgThreeDart` de `computeProfileStats`).
- Le pseudo édité ici est le **pseudo public unique** du compte (le même que
  voient les amis) — il n'y en a qu'un.
- Tout est **réutilisé** : aucun changement backend / SQL. La photo et le pseudo
  passent par `useSocial` (`saveAvatar` / `saveUsername`), déjà en place et
  validés (pseudo ≥ 3 caractères, unicité gérée côté `setUsername`).

## Architecture

### Nouvel écran `ProfileScreen`

Composant plein écran (overlay via `createPortal`, même patron que
`FriendsScreen` / `StatsScreen`). Props : `{ userId: string; onClose: () => void }`.

Contenu :

1. **En-tête** : bouton retour/fermer (« ← Retour » ou croix, cohérent avec
   `FriendsScreen`) + titre « Mon profil ».
2. **Photo de profil** : grand avatar (`social.avatarUrl`, sinon initiale du
   pseudo) + bouton **« Changer la photo »** ouvrant un `<input type="file"
   accept="image/*" hidden>` → `social.saveAvatar(file)`. Message de retour
   (« Photo mise à jour ✓ » / erreur), état `busy` pendant l'upload.
3. **Pseudo** : `<input>` pré-rempli avec `social.username`, + bouton
   **« Enregistrer »** → `social.saveUsername(draft)`. Bouton désactivé si
   `busy` ou `draft.trim().length < 3` ou inchangé. Message de retour
   (« Pseudo enregistré ✓ » / erreur, ex. « Ce pseudo est déjà pris »).
4. **Moyenne /3** : au montage, `fetchStatRows(userId)` →
   `computeProfileStats(rows, { userId })` → affiche `avgThreeDart` (1 décimale)
   dans une carte stat, « — » si aucune partie / chargement.

Données : `useSocial(userId)` (pseudo, avatar, `saveAvatar`, `saveUsername`) ;
`fetchStatRows` (`@/lib/stats`) + `computeProfileStats` (`@/utils/profileStats`).

### Intégration `AccountButton`

- Nouvel état `showProfile`.
- Nouveau bouton **« Mon profil »** dans le bloc connecté (au-dessus de « Mes
  amis »), même style que les boutons `stats`, icône `IconUser` : ferme le modal
  (`setOpen(false)`) et ouvre `ProfileScreen` (`setShowProfile(true)`).
- Rendu conditionnel `{showProfile && auth.user && (<ProfileScreen … />)}` dans
  le même portail que `StatsScreen` / `FriendsScreen`.

## Fichiers

| Fichier | Statut | Rôle |
|---|---|---|
| `src/components/account/ProfileScreen.tsx` (+ `.module.css`) | nouveau | écran profil (photo, pseudo, moyenne /3) |
| `src/components/account/AccountButton.tsx` | modifié | bouton « Mon profil » + état + rendu |

## Vérification

- `npx tsc --noEmit` (zéro sortie) + `npm run build` (« Compiled successfully »).
- Manuel (compte connecté) : ouvrir « Mon profil » → changer la photo (voir
  l'avatar se mettre à jour), renommer le pseudo (voir la validation, puis le
  nouveau pseudo reflété dans le chip compte / chez les amis), voir la moyenne /3.
  Non testable en preview local sans session authentifiée.

## Hors scope

- Autres stats sur l'écran profil (seule la moyenne /3, YAGNI).
- Suppression de compte, changement d'e-mail / mot de passe.
- Édition du pseudo pour un compte sans pseudo initial (déjà couvert par
  `saveUsername` — le champ sert aussi à en définir un si vide).
