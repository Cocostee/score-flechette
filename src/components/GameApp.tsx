"use client";

import { useEffect } from "react";
import { useDartsGame } from "@/hooks/useDartsGame";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useGameRecorder } from "@/hooks/useGameRecorder";
import { useIncomingInvites } from "@/hooks/useIncomingInvites";
import { useLiveBroadcast } from "@/hooks/useLiveBroadcast";
import { useLiveSpectator } from "@/hooks/useLiveSpectator";
import { LiveBanner } from "@/components/spectator/LiveBanner";
import { SpectatorScreen } from "@/components/spectator/SpectatorScreen";
import { HomeScreen } from "@/components/screens/HomeScreen";
import { SetupScreen } from "@/components/screens/SetupScreen";
import { GameScreen } from "@/components/screens/GameScreen";
import { ResultScreen } from "@/components/screens/ResultScreen";
import { InviteBanner } from "@/components/social/InviteBanner";
import styles from "./GameApp.module.css";

/* Client shell: owns the game hook and routes between screens. */
export function GameApp() {
  const game = useDartsGame();
  const { user } = useAuth();
  useTheme();
  useGameRecorder(game, user?.id ?? null);
  const incoming = useIncomingInvites(user?.id ?? null);
  useLiveBroadcast(game, user?.id ?? null);
  const spectate = useLiveSpectator(user?.id ?? null);

  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  const { screen } = game.state;

  return (
    <div className={styles.app}>
      <div className={styles.frame}>
        {screen === "home" && <HomeScreen game={game} />}
        {screen === "setup" && <SetupScreen game={game} />}
        {screen === "game" && <GameScreen game={game} />}
        {screen === "result" && <ResultScreen game={game} />}
      </div>
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
  );
}
