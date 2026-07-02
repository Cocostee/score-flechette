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
          onChange={(event) => {
            void onPickAvatar(event.target.files?.[0]);
            event.target.value = "";
          }}
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
