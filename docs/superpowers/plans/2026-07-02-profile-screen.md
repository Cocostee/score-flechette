# Écran « Mon profil » — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un écran « Mon profil » (photo + pseudo éditables, moyenne 3 fléchettes globale), ouvert depuis un bouton dans le modal compte.

**Architecture:** Un nouveau composant plein écran `ProfileScreen` qui réutilise `useSocial` (photo/pseudo) et `computeProfileStats` (moyenne /3), plus un bouton + rendu conditionnel dans `AccountButton`. Aucun changement backend.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, CSS Modules, Supabase (via hooks existants).

## Global Constraints

- TypeScript strict, pas de `any` implicite.
- PAS de runner de tests. Vérification = `npx tsc --noEmit` (ZÉRO sortie) et `npm run build` (« Compiled successfully »). Pas de tests unitaires inventés.
- **Tout réutilisé** : `useSocial(userId)` (`username`, `avatarUrl`, `saveAvatar(file): Promise<string|null>`, `saveUsername(name): Promise<string|null>`) ; `fetchStatRows(userId)` de `@/lib/stats` ; `computeProfileStats(rows, { userId }): ProfileStats` de `@/utils/profileStats` (filtre en interne ; `avgThreeDart` arrondi à 1 décimale, `x01Count`). Aucune migration SQL.
- Non-régression : `AccountButton` inchangé hors ajout (les boutons Mes amis / Mes stats, l'auth, les thèmes restent identiques).
- Messages de commit terminés par `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

| Fichier | Statut | Responsabilité |
|---|---|---|
| `src/components/account/ProfileScreen.tsx` | nouveau | écran profil (photo, pseudo, moyenne /3) |
| `src/components/account/ProfileScreen.module.css` | nouveau | styles de l'écran |
| `src/components/account/AccountButton.tsx` | modifié | bouton « Mon profil » + état + rendu |

---

## Task 1: Composant `ProfileScreen`

**Files:**
- Create: `src/components/account/ProfileScreen.tsx`
- Create: `src/components/account/ProfileScreen.module.css`

**Interfaces:**
- Consumes: `useSocial` (`@/hooks/useSocial`), `fetchStatRows` (`@/lib/stats`), `computeProfileStats` (`@/utils/profileStats`), `IconArrowLeft` (`@/components/ui/icons`).
- Produces: `ProfileScreen({ userId, onClose }: { userId: string; onClose: () => void })`.

- [ ] **Step 1: Créer le composant**

Create `src/components/account/ProfileScreen.tsx` :

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSocial } from "@/hooks/useSocial";
import { fetchStatRows } from "@/lib/stats";
import { computeProfileStats } from "@/utils/profileStats";
import { IconArrowLeft } from "@/components/ui/icons";
import styles from "./ProfileScreen.module.css";

interface ProfileScreenProps {
  userId: string;
  onClose: () => void;
}

/* Account profile: editable photo + username, plus the global 3-dart average. */
export function ProfileScreen({ userId, onClose }: ProfileScreenProps) {
  const social = useSocial(userId);
  const [nameDraft, setNameDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [avg, setAvg] = useState<number | null>(null);
  const [loadingAvg, setLoadingAvg] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  // Pre-fill the username field once the account's username has loaded.
  useEffect(() => {
    if (social.username) {
      setNameDraft(social.username);
    }
  }, [social.username]);

  // Load the account's own games and compute the global 3-dart average.
  useEffect(() => {
    let active = true;
    fetchStatRows(userId).then((rows) => {
      if (!active) {
        return;
      }
      const stats = computeProfileStats(rows, { userId });
      setAvg(stats.x01Count > 0 ? stats.avgThreeDart : null);
      setLoadingAvg(false);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const onPickAvatar = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const error = await social.saveAvatar(file);
    setMessage(error ?? "Photo mise à jour ✓");
    setBusy(false);
  };

  const saveName = async () => {
    setBusy(true);
    setMessage(null);
    const error = await social.saveUsername(nameDraft);
    setMessage(error ?? "Pseudo enregistré ✓");
    setBusy(false);
  };

  if (typeof document === "undefined") {
    return null;
  }

  const initial = (social.username ?? "?").slice(0, 1).toUpperCase();
  const unchanged = nameDraft.trim() === (social.username ?? "");

  return createPortal(
    <div className={styles.screen}>
      <header className={styles.top}>
        <button type="button" className={styles.back} onClick={onClose}>
          <IconArrowLeft /> Retour
        </button>
        <h1 className={styles.title}>Mon profil</h1>
        <span className={styles.spacer} />
      </header>

      <div className={styles.identity}>
        <span className={styles.avatar}>
          {social.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={social.avatarUrl}
              alt="avatar"
              className={styles.avatarImg}
            />
          ) : (
            initial
          )}
        </span>
        <button
          type="button"
          className={styles.photoBtn}
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          Changer la photo
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => onPickAvatar(event.target.files?.[0])}
        />
      </div>

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Pseudo</h2>
        <div className={styles.row}>
          <input
            className={styles.input}
            placeholder="ton-pseudo"
            maxLength={20}
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
          />
          <button
            type="button"
            className={styles.primary}
            disabled={busy || nameDraft.trim().length < 3 || unchanged}
            onClick={saveName}
          >
            Enregistrer
          </button>
        </div>
      </section>

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Moyenne 3 fléchettes</h2>
        <div className={styles.statCard}>
          <span className={styles.statValue}>
            {loadingAvg ? "…" : avg !== null ? avg.toFixed(1) : "—"}
          </span>
          <span className={styles.statLabel}>Moyenne /3 · parties x01</span>
        </div>
      </section>

      {message && <p className={styles.message}>{message}</p>}
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Créer les styles**

Create `src/components/account/ProfileScreen.module.css` :

```css
.screen {
  position: fixed;
  inset: 0;
  z-index: 85;
  overflow-y: auto;
  background-color: var(--bg);
  background-image: radial-gradient(
    900px 600px at 50% -10%,
    rgba(201, 164, 74, 0.1),
    transparent 60%
  );
  padding: clamp(16px, 4vw, 28px);
  display: flex;
  flex-direction: column;
  gap: 18px;
  animation: rise 0.25s ease both;
}

.top {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 640px;
  width: 100%;
  margin: 0 auto;
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 14px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--chalk);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.back:hover {
  border-color: var(--gold);
  color: var(--gold-bright);
}

.title {
  flex: 1;
  text-align: center;
  font-family: var(--font-display), serif;
  font-size: 1.9rem;
  letter-spacing: 0.05em;
  color: var(--chalk);
}

.spacer {
  width: 92px;
  flex-shrink: 0;
}

.identity {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  max-width: 640px;
  width: 100%;
  margin: 0 auto;
}

.avatar {
  width: 108px;
  height: 108px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: linear-gradient(180deg, var(--surface-2), var(--surface));
  border: 1px solid var(--gold);
  color: var(--chalk);
  font-family: var(--font-display), serif;
  font-size: 2.6rem;
}

.avatarImg {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photoBtn {
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid var(--line-strong);
  background: transparent;
  color: var(--chalk-dim);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.photoBtn:hover:not(:disabled) {
  border-color: var(--gold);
  color: var(--gold-bright);
}

.photoBtn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.block {
  max-width: 640px;
  width: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.blockTitle {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--chalk-dim);
}

.row {
  display: flex;
  gap: 8px;
}

.input {
  flex: 1;
  min-width: 0;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--line-strong);
  background: var(--bg-deep);
  color: var(--chalk);
  font-size: 1rem;
}

.input:focus {
  outline: none;
  border-color: var(--gold);
}

.primary {
  flex-shrink: 0;
  padding: 12px 18px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(180deg, var(--gold-bright), var(--gold));
  color: var(--ink);
  font-weight: 700;
  cursor: pointer;
  transition: filter 0.14s ease;
}

.primary:hover:not(:disabled) {
  filter: brightness(1.06);
}

.primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.statCard {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 20px;
  border-radius: var(--radius);
  border: 1px solid var(--line);
  background: linear-gradient(180deg, var(--surface), var(--bg-deep));
}

.statValue {
  font-family: var(--font-display), serif;
  font-size: 3rem;
  line-height: 1;
  color: var(--gold-bright);
}

.statLabel {
  font-size: 0.66rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--chalk-faint);
}

.message {
  max-width: 640px;
  width: 100%;
  margin: 0 auto;
  text-align: center;
  font-size: 0.88rem;
  color: var(--chalk-dim);
}
```

- [ ] **Step 3: Vérifier typage + build**

Run: `npx tsc --noEmit && npm run build`
Expected: zéro sortie tsc ; « Compiled successfully ». (`IconArrowLeft` est déjà exporté par `icons.tsx` ; `ProfileStats.x01Count`/`avgThreeDart` existent.)

- [ ] **Step 4: Commit**

```bash
git add src/components/account/ProfileScreen.tsx src/components/account/ProfileScreen.module.css
git commit -m "feat: écran Mon profil (photo, pseudo, moyenne /3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Intégration dans `AccountButton`

**Files:**
- Modify: `src/components/account/AccountButton.tsx`

**Interfaces:**
- Consumes: `ProfileScreen` (Task 1).

Context : `AccountButton` a déjà un état `showStats` / `showFriends`, un bloc connecté avec les boutons « Mes amis » et « Mes stats » (classe `styles.stats`, ouverts en fermant le modal), `IconUser` est déjà importé, et un portail qui rend `StatsScreen` / `FriendsScreen`.

- [ ] **Step 1: Import + état**

In `src/components/account/AccountButton.tsx`, add the import (near the `FriendsScreen` import):

```tsx
import { ProfileScreen } from "@/components/account/ProfileScreen";
```

Add state next to the existing `showStats` / `showFriends` declarations:

```tsx
  const [showProfile, setShowProfile] = useState(false);
```

- [ ] **Step 2: Bouton « Mon profil »**

Immediately BEFORE the « Mes amis » button (the one with `<IconUsers /> Mes amis`), insert:

```tsx
                <button
                  type="button"
                  className={styles.stats}
                  onClick={() => {
                    setOpen(false);
                    setShowProfile(true);
                  }}
                >
                  <IconUser /> Mon profil
                </button>
```

- [ ] **Step 3: Rendu conditionnel**

In the portal, next to `{showStats && auth.user && (…)}` and `{showFriends && auth.user && (…)}`, add:

```tsx
      {showProfile && auth.user && (
        <ProfileScreen
          userId={auth.user.id}
          onClose={() => setShowProfile(false)}
        />
      )}
```

- [ ] **Step 4: Vérifier typage + build**

Run: `npx tsc --noEmit && npm run build`
Expected: succès.

- [ ] **Step 5: Commit**

```bash
git add src/components/account/AccountButton.tsx
git commit -m "feat: bouton Mon profil dans le modal compte

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Vérification manuelle finale

Après les 2 tâches (`npm run build` OK), compte connecté :

1. Ouvrir le chip compte → cliquer **« Mon profil »** : le modal se ferme, l'écran profil s'ouvre.
2. **Photo** : « Changer la photo » → choisir une image → l'avatar se met à jour (« Photo mise à jour ✓ »), et le chip compte reflète la nouvelle photo.
3. **Pseudo** : modifier le champ, « Enregistrer » désactivé si < 3 caractères ou inchangé ; enregistrer → « Pseudo enregistré ✓ » ; le nouveau pseudo apparaît chez les amis / dans les stats.
4. **Moyenne /3** : affiche la moyenne 3 fléchettes globale (parties x01), « — » si aucune partie x01.
5. **Retour** : ferme l'écran, revient à l'app. Non testable en preview local sans session authentifiée.

---

## Self-Review (effectuée à l'écriture)

- **Couverture spec** : bouton « Mon profil » dans le modal (Task 2) ✓ ; photo éditable via `saveAvatar` (Task 1) ✓ ; pseudo éditable via `saveUsername` avec validation ≥ 3 / unicité déléguée (Task 1) ✓ ; moyenne /3 globale via `fetchStatRows` + `computeProfileStats` (Task 1) ✓ ; overlay même patron que FriendsScreen (Task 1) ✓ ; aucun changement backend ✓.
- **Cohérence des types** : `ProfileScreen({ userId, onClose })` défini Task 1, consommé Task 2 ; `computeProfileStats(rows, { userId })` → `ProfileStats` (`x01Count`, `avgThreeDart`) confirmé dans `profileStats.ts` ; `useSocial` API (`saveAvatar`/`saveUsername` renvoient `Promise<string|null>`) confirmée.
- **Non-régression** : `AccountButton` gagne seulement un état + un bouton + un rendu conditionnel ; le reste inchangé.
- **Pas de placeholder** : code complet à chaque étape.
