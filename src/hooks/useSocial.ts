"use client";

import { useCallback, useEffect, useState } from "react";
import type { FriendInfo, IncomingRequest } from "@/lib/social";
import {
  acceptRequest,
  getMyUsername,
  listFriends,
  listIncoming,
  removeFriendship,
  sendFriendRequest,
  setUsername,
} from "@/lib/social";

export interface SocialState {
  username: string | null;
  friends: FriendInfo[];
  incoming: IncomingRequest[];
  loading: boolean;
  saveUsername: (name: string) => Promise<string | null>;
  addFriend: (name: string) => Promise<string | null>;
  accept: (friendshipId: string) => Promise<void>;
  remove: (friendshipId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/* Loads and manages the account's username, friends and pending requests. */
export function useSocial(userId: string | null): SocialState {
  const [username, setUsernameState] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [incoming, setIncoming] = useState<IncomingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setUsernameState(null);
      setFriends([]);
      setIncoming([]);
      return;
    }
    const [name, fr, inc] = await Promise.all([
      getMyUsername(userId),
      listFriends(userId),
      listIncoming(userId),
    ]);
    setUsernameState(name);
    setFriends(fr);
    setIncoming(inc);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        void refresh();
      }
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  const saveUsername = useCallback(
    async (name: string): Promise<string | null> => {
      if (!userId) {
        return "Non connecté";
      }
      const error = await setUsername(userId, name);
      if (!error) {
        await refresh();
      }
      return error;
    },
    [userId, refresh],
  );

  const addFriend = useCallback(
    async (name: string): Promise<string | null> => {
      if (!userId) {
        return "Non connecté";
      }
      const error = await sendFriendRequest(userId, name);
      if (!error) {
        await refresh();
      }
      return error;
    },
    [userId, refresh],
  );

  const accept = useCallback(
    async (friendshipId: string) => {
      await acceptRequest(friendshipId);
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (friendshipId: string) => {
      await removeFriendship(friendshipId);
      await refresh();
    },
    [refresh],
  );

  return {
    username,
    friends,
    incoming,
    loading,
    saveUsername,
    addFriend,
    accept,
    remove,
    refresh,
  };
}
