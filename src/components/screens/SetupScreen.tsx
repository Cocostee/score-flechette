"use client";

import { useEffect, useRef, useState } from "react";
import type {
  Player,
  TrackedPlayer,
  X01InOption,
  X01OutOption,
  X01Rules,
} from "@/interfaces";
import type { DartsGame } from "@/hooks/useDartsGame";
import { getMode, X01_START_SCORES } from "@/data/modes";
import { useAuth } from "@/hooks/useAuth";
import { usePlayers } from "@/hooks/usePlayers";
import { useSocial } from "@/hooks/useSocial";
import { useGameInvites } from "@/hooks/useGameInvites";
import { IconArrowLeft, IconUser, IconStar } from "@/components/ui/icons";
import styles from "./SetupScreen.module.css";

interface SetupScreenProps {
  game: DartsGame;
}

const MAX_PLAYERS = 6;
const MIN_PLAYERS = 1;
const NAMES_KEY = "oche:lastPlayers";
const LEGS_OPTIONS = [1, 2, 3, 5];

/* Creates a fresh empty player slot. */
function emptyPlayer(): Player {
  return { id: crypto.randomUUID(), name: "" };
}

/* Reads the previously used player names, or two empty slots. */
function initialPlayers(): Player[] {
  let names: string[] = [];
  try {
    const raw = window.localStorage.getItem(NAMES_KEY);
    if (raw) {
      names = JSON.parse(raw) as string[];
    }
  } catch {
    names = [];
  }
  const seed = names.length >= 1 ? names : ["", ""];
  return seed.map((name) => ({ id: crypto.randomUUID(), name }));
}

/* Stores the player names so the next game can prefill them. */
function rememberNames(names: string[]): void {
  try {
    window.localStorage.setItem(NAMES_KEY, JSON.stringify(names));
  } catch {
    return;
  }
}

/* Configuration screen: players, names, legs and 01 rule options. */
export function SetupScreen({ game }: SetupScreenProps) {
  const mode = game.state.mode;
  const info = getMode(mode);
  const auth = useAuth();
  const profiles = usePlayers(auth.user?.id ?? null);
  const social = useSocial(auth.user?.id ?? null);
  const invites = useGameInvites(auth.user?.id ?? null);
  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [rules, setRules] = useState<X01Rules>(game.state.rules);
  const [legsTarget, setLegsTarget] = useState(1);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const playersRef = useRef(players);
  playersRef.current = players;

  const isX01 = mode === "x01";

  const addProfile = (profile: TrackedPlayer) =>
    setPlayers((list) => {
      if (
        list.length >= MAX_PLAYERS ||
        list.some((player) => player.profileId === profile.id)
      ) {
        return list;
      }
      const slot = list.find((player) => !player.profileId && !player.name.trim());
      if (slot) {
        return list.map((player) =>
          player.id === slot.id
            ? { ...player, name: profile.name, profileId: profile.id }
            : player,
        );
      }
      return [
        ...list,
        { id: crypto.randomUUID(), name: profile.name, profileId: profile.id },
      ];
    });

  const addFriendSlot = async (friendUserId: string, label: string) => {
    setInviteMsg(null);
    const isSelf = friendUserId === auth.user?.id;
    const canAdd =
      players.length < MAX_PLAYERS &&
      !players.some((player) => player.friendUserId === friendUserId);
    if (!canAdd) {
      return;
    }
    const newId = crypto.randomUUID();
    setPlayers((list) => {
      const slot = list.find(
        (player) => !player.profileId && !player.friendUserId && !player.name.trim(),
      );
      if (slot) {
        return list.map((player) =>
          player.id === slot.id
            ? { ...player, name: label, friendUserId }
            : player,
        );
      }
      return [...list, { id: newId, name: label, friendUserId }];
    });
    if (!isSelf) {
      const error = await invites.invite(friendUserId, mode);
      if (error) {
        setPlayers((list) =>
          list.filter((player) => player.friendUserId !== friendUserId),
        );
        setInviteMsg(error);
      }
    }
  };

  const rename = (id: string, name: string) =>
    setPlayers((list) =>
      list.map((player) => (player.id === id ? { ...player, name } : player)),
    );

  const addPlayer = () =>
    setPlayers((list) =>
      list.length >= MAX_PLAYERS ? list : [...list, emptyPlayer()],
    );

  const removePlayer = (id: string) => {
    if (players.length <= MIN_PLAYERS) {
      return;
    }
    const target = players.find((player) => player.id === id);
    if (target?.friendUserId && target.friendUserId !== auth.user?.id) {
      void invites.cancelForGuest(target.friendUserId);
    }
    setPlayers((list) => list.filter((player) => player.id !== id));
  };

  useEffect(() => {
    const declinedIds = Object.entries(invites.invites)
      .filter(([, entry]) => entry.status === "declined")
      .map(([guestId]) => guestId);
    if (declinedIds.length === 0) {
      return;
    }
    const removed = playersRef.current.filter(
      (player) =>
        player.friendUserId && declinedIds.includes(player.friendUserId),
    );
    if (removed.length === 0) {
      return;
    }
    setInviteMsg(`${removed[0].name} a refusé l'invitation`);
    setPlayers((list) =>
      list.filter(
        (player) =>
          !(player.friendUserId && declinedIds.includes(player.friendUserId)),
      ),
    );
    for (const guestId of declinedIds) {
      void invites.cancelForGuest(guestId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invites.invites]);

  const launch = () => {
    const named = players.map((player, index) => ({
      id: player.id,
      name: player.name.trim() || `Joueur ${index + 1}`,
      profileId: player.profileId,
      friendUserId: player.friendUserId,
    }));
    rememberNames(named.map((player) => player.name));
    game.startGame({ mode, rules, players: named, legsTarget });
  };

  return (
    <div className={styles.screen}>
      <header className={styles.top}>
        <button
          type="button"
          className={styles.back}
          onClick={async () => {
            await invites.cancelAll();
            game.goHome();
          }}
        >
          <IconArrowLeft /> Retour
        </button>
        <div className={styles.modeTag}>
          <span className={styles.modeKicker}>Mode</span>
          <span className={styles.modeName}>{info.name}</span>
        </div>
      </header>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className={styles.blockTitle}>Joueurs</h2>
          <span className={styles.count}>{players.length}</span>
        </div>
        <div className={styles.players}>
          {players.map((player, index) => (
            <div key={player.id} className={styles.playerRow}>
              <span
                className={styles.playerIndex}
                data-linked={
                  player.profileId || player.friendUserId ? "true" : "false"
                }
              >
                {player.profileId ? <IconStar style={{ fontSize: "0.9em" }} /> : player.friendUserId ? <IconUser style={{ fontSize: "0.9em" }} /> : index + 1}
              </span>
              <input
                className={styles.input}
                value={player.name}
                placeholder={`Joueur ${index + 1}`}
                maxLength={14}
                readOnly={!!player.profileId || !!player.friendUserId}
                onChange={(event) => rename(player.id, event.target.value)}
              />
              {player.friendUserId && player.friendUserId !== auth.user?.id && (
                <span
                  className={styles.inviteStatus}
                  data-status={invites.invites[player.friendUserId]?.status ?? "pending"}
                >
                  {invites.invites[player.friendUserId]?.status === "accepted"
                    ? "✓"
                    : "en attente…"}
                </span>
              )}
              <button
                type="button"
                className={styles.remove}
                aria-label="Retirer"
                disabled={players.length <= MIN_PLAYERS}
                onClick={() => removePlayer(player.id)}
              >
                −
              </button>
            </div>
          ))}
        </div>
        {inviteMsg && <p className={styles.inviteMsg}>{inviteMsg}</p>}
        <button
          type="button"
          className={styles.add}
          disabled={players.length >= MAX_PLAYERS}
          onClick={addPlayer}
        >
          + Ajouter un invité
        </button>

        {auth.user && profiles.players.length > 0 && (
          <div className={styles.profilesPick}>
            <p className={styles.optionLabel}>Mes joueurs</p>
            <div className={styles.profileChips}>
              {profiles.players.map((profile) => {
                const used = players.some((p) => p.profileId === profile.id);
                return (
                  <button
                    key={profile.id}
                    type="button"
                    className={styles.profileChip}
                    data-used={used ? "true" : "false"}
                    disabled={used || players.length >= MAX_PLAYERS}
                    onClick={() => addProfile(profile)}
                  >
                    <IconStar /> {profile.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {auth.user && (
          <div className={styles.profilesPick}>
            <p className={styles.optionLabel}>Comptes (stats partagées)</p>
            <div className={styles.profileChips}>
              {(() => {
                const meId = auth.user.id;
                const meUsed = players.some((p) => p.friendUserId === meId);
                const meLabel = social.username ? `@${social.username}` : "Moi";
                return (
                  <button
                    type="button"
                    className={styles.friendChip}
                    data-used={meUsed ? "true" : "false"}
                    disabled={meUsed || players.length >= MAX_PLAYERS}
                    onClick={() => addFriendSlot(meId, meLabel)}
                  >
                    <IconUser /> Moi
                  </button>
                );
              })()}
              {social.friends.map((friend) => {
                const used = players.some(
                  (p) => p.friendUserId === friend.userId,
                );
                return (
                  <button
                    key={friend.friendshipId}
                    type="button"
                    className={styles.friendChip}
                    data-used={used ? "true" : "false"}
                    disabled={used || players.length >= MAX_PLAYERS}
                    onClick={() =>
                      addFriendSlot(friend.userId, `@${friend.username}`)
                    }
                  >
                    <IconUser /> @{friend.username}
                  </button>
                );
              })}
            </div>
            {social.friends.length === 0 && (
              <p className={styles.pickHint}>
                Ajoute des amis (Compte → Mes amis) pour qu&apos;ils retrouvent
                la partie dans leurs stats.
              </p>
            )}
          </div>
        )}
      </section>

      {isX01 && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Options 01</h2>

          <p className={styles.optionLabel}>Score de départ</p>
          <div className={styles.segment}>
            {X01_START_SCORES.map((score) => (
              <button
                key={score}
                type="button"
                className={`${styles.segBtn} ${
                  rules.startScore === score ? styles.segOn : ""
                }`}
                onClick={() => setRules((r) => ({ ...r, startScore: score }))}
              >
                {score}
              </button>
            ))}
          </div>

          <p className={styles.optionLabel}>Ouverture (In)</p>
          <div className={styles.segment}>
            {(["open", "double"] as X01InOption[]).map((option) => (
              <button
                key={option}
                type="button"
                className={`${styles.segBtn} ${
                  rules.inOption === option ? styles.segOn : ""
                }`}
                onClick={() => setRules((r) => ({ ...r, inOption: option }))}
              >
                {option === "open" ? "Open In" : "Double In"}
              </button>
            ))}
          </div>

          <p className={styles.optionLabel}>Fermeture (Out)</p>
          <div className={styles.segment}>
            {(["open", "double", "master"] as X01OutOption[]).map((option) => (
              <button
                key={option}
                type="button"
                className={`${styles.segBtn} ${
                  rules.outOption === option ? styles.segOn : ""
                }`}
                onClick={() => setRules((r) => ({ ...r, outOption: option }))}
              >
                {option === "open"
                  ? "Open Out"
                  : option === "double"
                    ? "Double Out"
                    : "Master Out"}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Manches gagnantes</h2>
        <p className={styles.optionLabel}>Premier à</p>
        <div className={styles.segment}>
          {LEGS_OPTIONS.map((count) => (
            <button
              key={count}
              type="button"
              className={`${styles.segBtn} ${
                legsTarget === count ? styles.segOn : ""
              }`}
              onClick={() => setLegsTarget(count)}
            >
              {count === 1 ? "1 manche" : count}
            </button>
          ))}
        </div>
      </section>

      <button
        type="button"
        className={styles.launch}
        disabled={invites.hasPending}
        onClick={launch}
      >
        {invites.hasPending ? "En attente d'acceptation…" : "Lancer la partie"}
      </button>
    </div>
  );
}
