// Live chat updates for the whole app: new messages arrive through Supabase
// Realtime (only the user's own conversations, enforced by RLS) and keep the
// unread badge up to date.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useAuth } from './auth';
import { getUnreadCount, type ChatMessage } from './chat';
import { supabase } from './supabase';

type Listener = (m: ChatMessage) => void;

type MessagesState = {
  unread: number;
  refreshUnread: () => void;
  // Called for every new message in any of the user's conversations.
  subscribe: (listener: Listener) => () => void;
};

const MessagesContext = createContext<MessagesState>({
  unread: 0,
  refreshUnread: () => {},
  subscribe: () => () => {},
});

export function MessagesProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [unread, setUnread] = useState(0);
  const listeners = useRef(new Set<Listener>());

  const refreshUnread = useCallback(() => {
    if (!userId) return;
    getUnreadCount().then(setUnread, () => {});
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    refreshUnread();
    const timer = setInterval(refreshUnread, 60_000);
    const app = AppState.addEventListener('change', (s) => s === 'active' && refreshUnread());
    const channel = supabase
      .channel(`messages:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new as ChatMessage;
        listeners.current.forEach((fn) => fn(m));
        if (m.sender_id !== userId) refreshUnread();
      })
      .subscribe();
    return () => {
      clearInterval(timer);
      app.remove();
      supabase.removeChannel(channel);
    };
  }, [userId, refreshUnread]);

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  return (
    <MessagesContext.Provider value={{ unread: userId ? unread : 0, refreshUnread, subscribe }}>
      {children}
    </MessagesContext.Provider>
  );
}

export const useMessages = () => useContext(MessagesContext);
