"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePlayers } from "@/hooks/usePlayers";
import { StatsScreen } from "@/components/stats/StatsScreen";
import styles from "./AccountButton.module.css";

/* Account entry point: opens auth or the tracked-profiles manager. */
export function AccountButton() {
  const auth = useAuth();
  const players = usePlayers(auth.user?.id ?? null);
  const [open, setOpen] = useState(false);
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [showStats, setShowStats] = useState(false);

  if (!auth.configured) {
    return null;
  }

  const label = auth.user
    ? (auth.user.email ?? "Compte").slice(0, 1).toUpperCase()
    : "Compte";

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    if (signup) {
      const result = await auth.signUp(email, password);
      if (result.error) {
        setMessage(result.error);
      } else if (result.needsConfirm) {
        setMessage("Compte créé. Confirme ton adresse par e-mail puis connecte-toi.");
      }
    } else {
      const error = await auth.signIn(email, password);
      if (error) {
        setMessage(error);
      } else {
        setEmail("");
        setPassword("");
      }
    }
    setBusy(false);
  };

  const addPlayer = async () => {
    const error = await players.addPlayer(newName);
    if (error) {
      setMessage(error);
    } else {
      setNewName("");
    }
  };

  return (
    <>
      <button
        type="button"
        className={styles.chip}
        data-in={auth.user ? "true" : "false"}
        onClick={() => setOpen(true)}
        aria-label="Compte"
      >
        {auth.user ? <span className={styles.avatar}>{label}</span> : "👤 Compte"}
      </button>

      {open && (
        <div className={styles.backdrop} onClick={() => setOpen(false)}>
          <div
            className={styles.panel}
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.close}
              onClick={() => setOpen(false)}
              aria-label="Fermer"
            >
              ×
            </button>

            {!auth.user ? (
              <div className={styles.form}>
                <h2 className={styles.title}>
                  {signup ? "Créer un compte" : "Connexion"}
                </h2>
                <input
                  className={styles.input}
                  type="email"
                  placeholder="E-mail"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <input
                  className={styles.input}
                  type="password"
                  placeholder="Mot de passe"
                  autoComplete={signup ? "new-password" : "current-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className={styles.primary}
                  disabled={busy || !email || !password}
                  onClick={submit}
                >
                  {busy ? "..." : signup ? "Créer le compte" : "Se connecter"}
                </button>
                <button
                  type="button"
                  className={styles.switch}
                  onClick={() => {
                    setSignup(!signup);
                    setMessage(null);
                  }}
                >
                  {signup
                    ? "J'ai déjà un compte — me connecter"
                    : "Pas de compte ? En créer un"}
                </button>
              </div>
            ) : (
              <div className={styles.form}>
                <h2 className={styles.title}>Mes joueurs</h2>
                <p className={styles.email}>{auth.user.email}</p>

                <div className={styles.players}>
                  {players.players.length === 0 && (
                    <p className={styles.empty}>
                      Aucun profil. Ajoute les joueurs qui jouent sur ta cible.
                    </p>
                  )}
                  {players.players.map((player) => (
                    <div key={player.id} className={styles.playerRow}>
                      <span className={styles.playerName}>{player.name}</span>
                      <button
                        type="button"
                        className={styles.remove}
                        aria-label={`Retirer ${player.name}`}
                        onClick={() => players.removePlayer(player.id)}
                      >
                        −
                      </button>
                    </div>
                  ))}
                </div>

                <div className={styles.addRow}>
                  <input
                    className={styles.input}
                    placeholder="Nouveau joueur"
                    maxLength={14}
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        void addPlayer();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className={styles.add}
                    disabled={!newName.trim()}
                    onClick={addPlayer}
                  >
                    +
                  </button>
                </div>

                <button
                  type="button"
                  className={styles.stats}
                  onClick={() => {
                    setOpen(false);
                    setShowStats(true);
                  }}
                >
                  📊 Mes stats
                </button>

                <button
                  type="button"
                  className={styles.signout}
                  onClick={() => auth.signOut()}
                >
                  Se déconnecter
                </button>
              </div>
            )}

            {message && <p className={styles.message}>{message}</p>}
          </div>
        </div>
      )}

      {showStats && auth.user && (
        <StatsScreen
          userId={auth.user.id}
          profiles={players.players}
          onClose={() => setShowStats(false)}
        />
      )}
    </>
  );
}
