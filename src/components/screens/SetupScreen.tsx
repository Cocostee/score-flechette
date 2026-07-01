"use client";

import { useEffect, useRef, useState } from "react";
import type {
  Player,
  Team,
  TrackedPlayer,
  X01InOption,
  X01OutOption,
  X01Rules,
} from "@/interfaces";
import type { DartsGame } from "@/hooks/useDartsGame";
import { teamColor, teamLabel } from "@/utils/teams";
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

const TEAM_PRESETS: { label: string; sizes: number[] }[] = [
  { label: "2v2", sizes: [2, 2] },
  { label: "3v3", sizes: [3, 3] },
  { label: "2v2v2", sizes: [2, 2, 2] },
];
const MAX_TEAMS = 3;

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
  const [isTeamMode, setIsTeamMode] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
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

  // Team members are kept in a flat players list; a team references them by id.
  // A preset resets the roster to fresh empty slots.
  const applyPreset = (sizes: number[]) => {
    setIsTeamMode(true);
    const built: Team[] = [];
    const flatPlayers: Player[] = [];
    sizes.forEach((count, teamIndex) => {
      const team: Team = {
        id: crypto.randomUUID(),
        name: teamLabel(teamIndex),
        color: teamColor(teamIndex),
        playerIds: [],
      };
      for (let i = 0; i < count; i += 1) {
        const p: Player = { id: crypto.randomUUID(), name: "" };
        flatPlayers.push(p);
        team.playerIds.push(p.id);
      }
      built.push(team);
    });
    setPlayers(flatPlayers);
    setTeams(built);
  };

  // Toggling to team mode keeps the players already entered: they go into
  // team A, with an empty team B to fill.
  const enableTeamMode = () => {
    setIsTeamMode(true);
    if (teams.length > 0) {
      return;
    }
    const teamA: Team = {
      id: crypto.randomUUID(),
      name: teamLabel(0),
      color: teamColor(0),
      playerIds: players.map((p) => p.id),
    };
    const teamB: Team = {
      id: crypto.randomUUID(),
      name: teamLabel(1),
      color: teamColor(1),
      playerIds: [],
    };
    if (players.length < MAX_PLAYERS) {
      const p: Player = { id: crypto.randomUUID(), name: "" };
      teamB.playerIds.push(p.id);
      setPlayers((ps) => [...ps, p]);
    }
    setTeams([teamA, teamB]);
  };

  const disableTeamMode = () => {
    setIsTeamMode(false);
  };

  const renameTeam = (teamId: string, name: string) =>
    setTeams((list) =>
      list.map((t) => (t.id === teamId ? { ...t, name } : t)),
    );

  const addEmptyTeam = () => {
    if (teams.length >= MAX_TEAMS) {
      return;
    }
    const p: Player = { id: crypto.randomUUID(), name: "" };
    setPlayers((ps) => [...ps, p]);
    setTeams((list) => {
      if (list.length >= MAX_TEAMS) {
        return list;
      }
      return [
        ...list,
        {
          id: crypto.randomUUID(),
          name: teamLabel(list.length),
          color: teamColor(list.length),
          playerIds: [p.id],
        },
      ];
    });
  };

  const removeTeam = (teamId: string) => {
    if (teams.length <= 2) {
      return;
    }
    const team = teams.find((t) => t.id === teamId);
    if (!team) {
      return;
    }
    for (const pid of team.playerIds) {
      const member = players.find((p) => p.id === pid);
      if (member?.friendUserId && member.friendUserId !== auth.user?.id) {
        void invites.cancelForGuest(member.friendUserId);
      }
    }
    setPlayers((ps) => ps.filter((p) => !team.playerIds.includes(p.id)));
    setTeams((list) => list.filter((t) => t.id !== teamId));
  };

  const addTeamSlot = (teamId: string) => {
    if (players.length >= MAX_PLAYERS) {
      return;
    }
    const p: Player = { id: crypto.randomUUID(), name: "" };
    setPlayers((ps) => [...ps, p]);
    setTeams((list) =>
      list.map((t) =>
        t.id === teamId ? { ...t, playerIds: [...t.playerIds, p.id] } : t,
      ),
    );
  };

  const removeTeamSlot = (teamId: string, playerId: string) => {
    const member = players.find((p) => p.id === playerId);
    if (member?.friendUserId && member.friendUserId !== auth.user?.id) {
      void invites.cancelForGuest(member.friendUserId);
    }
    setTeams((list) =>
      list.map((t) =>
        t.id === teamId
          ? { ...t, playerIds: t.playerIds.filter((id) => id !== playerId) }
          : t,
      ),
    );
    setPlayers((ps) => ps.filter((p) => p.id !== playerId));
  };

  // Fills the first empty slot of a team with a guest/profile/friend player.
  const fillTeamSlot = async (
    teamId: string,
    filled: Partial<Player> & { name: string },
  ) => {
    const team = teams.find((t) => t.id === teamId);
    if (!team) {
      return;
    }
    const emptyId = team.playerIds.find((pid) => {
      const p = players.find((x) => x.id === pid);
      return p && !p.name.trim() && !p.profileId && !p.friendUserId;
    });
    const targetId = emptyId ?? null;
    if (targetId) {
      setPlayers((ps) =>
        ps.map((p) => (p.id === targetId ? { ...p, ...filled } : p)),
      );
    } else {
      const totalPlayers = players.length;
      if (totalPlayers >= MAX_PLAYERS) {
        return;
      }
      const p: Player = { id: crypto.randomUUID(), ...filled };
      setPlayers((ps) => [...ps, p]);
      setTeams((list) =>
        list.map((t) =>
          t.id === teamId ? { ...t, playerIds: [...t.playerIds, p.id] } : t,
        ),
      );
    }
    if (filled.friendUserId && filled.friendUserId !== auth.user?.id) {
      const error = await invites.invite(filled.friendUserId, mode);
      if (error) {
        setInviteMsg(error);
      }
    }
  };

  const renameMember = (playerId: string, name: string) =>
    setPlayers((list) =>
      list.map((p) => (p.id === playerId ? { ...p, name } : p)),
    );

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
    const nameById = new Map(named.map((p) => [p.id, p]));
    const cleanTeams = isTeamMode
      ? teams.map((t) => ({
          ...t,
          playerIds: t.playerIds.filter((id) => nameById.has(id)),
        }))
      : undefined;
    game.startGame({
      mode,
      rules,
      players: named,
      legsTarget,
      teams: cleanTeams,
    });
  };

  const emptyTeam = isTeamMode && teams.some((t) => t.playerIds.length === 0);
  const launchDisabled = invites.hasPending || emptyTeam;

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
        <div className={styles.modeToggle}>
          <button
            type="button"
            className={styles.modeToggleBtn}
            data-on={!isTeamMode ? "true" : "false"}
            onClick={disableTeamMode}
          >
            Individuel
          </button>
          <button
            type="button"
            className={styles.modeToggleBtn}
            data-on={isTeamMode ? "true" : "false"}
            onClick={enableTeamMode}
          >
            Équipes
          </button>
        </div>
        {!isTeamMode && (
          <>
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
          </>
        )}

        {isTeamMode && (
          <div className={styles.teamsArea}>
            <div className={styles.presets}>
              <span className={styles.presetLabel}>Rapide</span>
              {TEAM_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className={styles.presetBtn}
                  onClick={() => applyPreset(preset.sizes)}
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                className={styles.presetBtn}
                disabled={teams.length >= MAX_TEAMS}
                onClick={addEmptyTeam}
                aria-label="Ajouter une équipe"
              >
                +
              </button>
            </div>

            <div className={styles.teamCards}>
              {teams.map((team, teamIndex) => (
                <div
                  key={team.id}
                  className={styles.teamCard}
                  data-color={team.color}
                >
                  <div className={styles.teamCardHead}>
                    <input
                      className={styles.teamName}
                      value={team.name}
                      maxLength={16}
                      onChange={(e) => renameTeam(team.id, e.target.value)}
                      aria-label={`Nom de l'équipe ${teamIndex + 1}`}
                    />
                    {teams.length > 2 && (
                      <button
                        type="button"
                        className={styles.teamRemove}
                        onClick={() => removeTeam(team.id)}
                        aria-label="Retirer l'équipe"
                      >
                        −
                      </button>
                    )}
                  </div>

                  <div className={styles.teamMembers}>
                    {team.playerIds.map((pid) => {
                      const member = players.find((p) => p.id === pid);
                      if (!member) {
                        return null;
                      }
                      const linked = !!(member.profileId || member.friendUserId);
                      const pending =
                        member.friendUserId &&
                        member.friendUserId !== auth.user?.id &&
                        invites.invites[member.friendUserId]?.status !== "accepted";
                      return (
                        <div key={pid} className={styles.teamMemberRow}>
                          <input
                            className={styles.input}
                            value={member.name}
                            placeholder="Joueur"
                            maxLength={14}
                            readOnly={linked}
                            onChange={(e) => renameMember(pid, e.target.value)}
                          />
                          {member.friendUserId &&
                            member.friendUserId !== auth.user?.id && (
                              <span
                                className={styles.inviteStatus}
                                data-status={pending ? "pending" : "accepted"}
                              >
                                {pending ? "en attente…" : "✓"}
                              </span>
                            )}
                          <button
                            type="button"
                            className={styles.remove}
                            aria-label="Retirer le joueur"
                            onClick={() => removeTeamSlot(team.id, pid)}
                          >
                            −
                          </button>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      className={styles.teamAddSlot}
                      onClick={() => addTeamSlot(team.id)}
                      disabled={
                        players.length >= MAX_PLAYERS
                      }
                    >
                      + joueur
                    </button>
                  </div>

                  {auth.user && (
                    <div className={styles.teamPickers}>
                      <button
                        type="button"
                        className={styles.friendChip}
                        disabled={players.some(
                          (p) => p.friendUserId === auth.user?.id,
                        )}
                        onClick={() =>
                          fillTeamSlot(team.id, {
                            name: social.username ? `@${social.username}` : "Moi",
                            friendUserId: auth.user!.id,
                          })
                        }
                      >
                        <IconUser /> Moi
                      </button>
                      {profiles.players.map((profile) => (
                        <button
                          key={profile.id}
                          type="button"
                          className={styles.profileChip}
                          disabled={players.some((p) => p.profileId === profile.id)}
                          onClick={() =>
                            fillTeamSlot(team.id, {
                              name: profile.name,
                              profileId: profile.id,
                            })
                          }
                        >
                          <IconStar /> {profile.name}
                        </button>
                      ))}
                      {social.friends.map((friend) => (
                        <button
                          key={friend.friendshipId}
                          type="button"
                          className={styles.friendChip}
                          disabled={players.some(
                            (p) => p.friendUserId === friend.userId,
                          )}
                          onClick={() =>
                            fillTeamSlot(team.id, {
                              name: `@${friend.username}`,
                              friendUserId: friend.userId,
                            })
                          }
                        >
                          <IconUser /> @{friend.username}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
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
        disabled={launchDisabled}
        onClick={launch}
      >
        {invites.hasPending
          ? "En attente d'acceptation…"
          : emptyTeam
            ? "Complète chaque équipe"
            : "Lancer la partie"}
      </button>
    </div>
  );
}
