import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Client, Practice } from './types';

type Who =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'no-role' } // signed in, but not an esthetician or a client yet
  | { kind: 'practitioner'; practice: Practice; role: 'owner' | 'staff' }
  | { kind: 'client'; client: Client; practice: Practice };

type Ctx = {
  session: Session | null;
  who: Who;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [who, setWho] = useState<Who>({ kind: 'loading' });

  const resolve = useCallback(async (s: Session | null) => {
    if (!s) {
      setWho({ kind: 'signed-out' });
      return;
    }
    const uid = s.user.id;
    const { data: mem } = await supabase
      .from('practice_members')
      .select('role, practice:practices(id, name, logo_url, brand_color, checkin_every_days, quiet_after_days, send_reminders, booking_url, shop_url, subscription_status, trial_ends_at)')
      .eq('user_id', uid)
      .limit(1)
      .maybeSingle();
    if (mem?.practice) {
      setWho({ kind: 'practitioner', practice: mem.practice as unknown as Practice, role: mem.role as 'owner' | 'staff' });
      return;
    }
    const { data: cl } = await supabase
      .from('clients')
      .select('*, practice:practices(id, name, logo_url, brand_color, checkin_every_days, quiet_after_days, send_reminders, booking_url, shop_url, subscription_status, trial_ends_at)')
      .eq('user_id', uid)
      .eq('archived', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cl?.practice) {
      const { practice, ...client } = cl as Client & { practice: Practice };
      setWho({ kind: 'client', client, practice });
      return;
    }
    setWho({ kind: 'no-role' });
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      resolve(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') resolve(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [resolve]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await resolve(data.session);
  }, [resolve]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setWho({ kind: 'signed-out' });
  }, []);

  return <SessionContext.Provider value={{ session, who, refresh, signOut }}>{children}</SessionContext.Provider>;
}

export function useSession(): Ctx {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession outside provider');
  return ctx;
}

export function usePractitioner() {
  const { who, refresh } = useSession();
  if (who.kind !== 'practitioner') throw new Error('Not a practitioner');
  return { practice: who.practice, role: who.role, refresh };
}

export function useClientSelf() {
  const { who, refresh } = useSession();
  if (who.kind !== 'client') throw new Error('Not a client');
  return { client: who.client, practice: who.practice, refresh };
}
