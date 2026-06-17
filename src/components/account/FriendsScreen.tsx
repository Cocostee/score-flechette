"use client";

import { useRef, useState } from "react";
import type { FriendInfo } from "@/lib/social";
import { useSocial } from "@/hooks/useSocial";
import { FriendStatsScreen } from "@/components/stats/FriendStatsScreen";
import styles from "./FriendsScreen.module.css";

interface FriendsScreenProps {
  userId: string;
  onClose: () => void;
}

/* Full-screen friends manager: username, requests and accepted friends. */
export function FriendsScreen({ userId, onClose }: FriendsScreenProps) {
  const social = useSocial(userId);
  const [nameDraft, setNameDraft] = useState("");
  const [friendDraft, setFriendDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewFriend, setViewFriend] = useState<FriendInfo | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const addFriend = async () => {
    setBusy(true);
    setMessage(null);
    const error = await social.addFriend(friendDraft);
    if (!error) {
      setFriendDraft("");
      setMessage("Demande envoyée ✓");
    } else {
      setMessage(error);
    }
    setBusy(false);
  };

  return (
    <div className={styles.screen}>
      <header className={styles.top}>
        <button type="button" className={styles.back} onClick={onClose}>
          ← Retour
        </button>
        <h1 className={styles.title}>Amis</h1>
        <span className={styles.spacer} />
      </header>

      {!social.username ? (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Choisis ton pseudo</h2>
          <p className={styles.hint}>
            C&apos;est le nom que tes potes utiliseront pour t&apos;ajouter.
          </p>
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
              disabled={busy || nameDraft.trim().length < 3}
              onClick={saveName}
            >
              Valider
            </button>
          </div>
        </section>
      ) : (
        <>
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
                social.username.slice(0, 1).toUpperCase()
              )}
            </span>
            <div className={styles.identityText}>
              <span className={styles.handle}>@{social.username}</span>
              <button
                type="button"
                className={styles.photoBtn}
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                Changer la photo
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => onPickAvatar(event.target.files?.[0])}
            />
          </div>

          <section className={styles.block}>
            <h2 className={styles.blockTitle}>Ajouter un ami</h2>
            <div className={styles.row}>
              <input
                className={styles.input}
                placeholder="Pseudo du joueur"
                maxLength={20}
                value={friendDraft}
                onChange={(event) => setFriendDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void addFriend();
                  }
                }}
              />
              <button
                type="button"
                className={styles.primary}
                disabled={busy || !friendDraft.trim()}
                onClick={addFriend}
              >
                +
              </button>
            </div>
          </section>

          {social.incoming.length > 0 && (
            <section className={styles.block}>
              <h2 className={styles.blockTitle}>Demandes reçues</h2>
              <div className={styles.list}>
                {social.incoming.map((request) => (
                  <div key={request.friendshipId} className={styles.friendRow}>
                    <span className={styles.friendName}>
                      @{request.username}
                    </span>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.accept}
                        onClick={() => social.accept(request.friendshipId)}
                      >
                        Accepter
                      </button>
                      <button
                        type="button"
                        className={styles.decline}
                        onClick={() => social.remove(request.friendshipId)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className={styles.block}>
            <h2 className={styles.blockTitle}>Mes amis</h2>
            <div className={styles.list}>
              {social.friends.length === 0 && (
                <p className={styles.hint}>
                  Aucun ami pour l&apos;instant. Ajoute un pseudo ci-dessus.
                </p>
              )}
              {social.friends.map((friend) => (
                <div key={friend.friendshipId} className={styles.friendRow}>
                  <button
                    type="button"
                    className={styles.friendOpen}
                    onClick={() => setViewFriend(friend)}
                  >
                    <span className={styles.miniAvatar}>
                      {friend.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={friend.avatarUrl}
                          alt={friend.username}
                          className={styles.avatarImg}
                        />
                      ) : (
                        friend.username.slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <span className={styles.friendName}>@{friend.username}</span>
                    <span className={styles.chevron}>›</span>
                  </button>
                  <button
                    type="button"
                    className={styles.decline}
                    aria-label="Retirer"
                    onClick={() => social.remove(friend.friendshipId)}
                  >
                    −
                  </button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {message && <p className={styles.message}>{message}</p>}

      {viewFriend && (
        <FriendStatsScreen
          friendId={viewFriend.userId}
          username={viewFriend.username}
          avatarUrl={viewFriend.avatarUrl}
          onClose={() => setViewFriend(null)}
        />
      )}
    </div>
  );
}
