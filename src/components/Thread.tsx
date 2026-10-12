import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { fmtRelative } from '../lib/dates';
import type { Message } from '../lib/types';
import { ErrorBox } from './ui';

/** A conversation between a practice and one client. `as` decides which side is "me". */
export function Thread({ clientId, practiceId, as, placeholder, extraActions }: {
  clientId: string; practiceId: string; as: 'practitioner' | 'client'; placeholder?: string;
  extraActions?: (insert: (text: string) => void) => React.ReactNode;
}) {
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    setMsgs(null);
    supabase.from('messages').select('*').eq('client_id', clientId).order('created_at').limit(500).then(({ data, error }) => {
      if (!live) return;
      if (error) setError(error.message);
      setMsgs((data as Message[]) ?? []);
    });
    markRead();
    const ch = supabase.channel(`thread-${clientId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `client_id=eq.${clientId}` }, (payload) => {
        setMsgs((m) => (m && !m.some((x) => x.id === (payload.new as Message).id) ? [...m, payload.new as Message] : m));
        markRead();
      })
      .subscribe();
    return () => { live = false; supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs?.length]);

  async function markRead() {
    if (as === 'client') await supabase.rpc('client_mark_read', { c: clientId });
    else await supabase.from('messages').update({ read_by_practice_at: new Date().toISOString() })
      .eq('client_id', clientId).eq('sender_role', 'client').is('read_by_practice_at', null);
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    setSending(true);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const { data, error } = await supabase.from('messages')
      .insert({ client_id: clientId, practice_id: practiceId, sender_role: as, sender_user_id: uid, body })
      .select('*').single();
    setSending(false);
    if (error) return setError(error.message);
    setText('');
    setMsgs((m) => (m && !m.some((x) => x.id === data.id) ? [...m, data as Message] : m));
  }

  return (
    <div className="stack" style={{ flex: 1, minHeight: 0 }}>
      <div className="bubbles" style={{ flex: 1, overflowY: 'auto', padding: '4px 2px' }}>
        {msgs === null ? <div className="muted">Loading…</div> : msgs.length === 0 ? <div className="empty">No messages yet. Say hi.</div> : msgs.map((m) => (
          <div key={m.id} className={`bubble ${m.sender_role === 'system' ? 'sys' : m.sender_role === as ? 'me' : 'them'}`} title={fmtRelative(m.created_at)}>
            {m.body}
          </div>
        ))}
        <div ref={end} />
      </div>
      <ErrorBox error={error} />
      <form className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }} onSubmit={send}>
        <label className="sr" htmlFor={`msg-${clientId}`}>Message</label>
        <textarea id={`msg-${clientId}`} className="input grow" rows={1} style={{ minHeight: 44 }} placeholder={placeholder ?? 'Write a message'} value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); send(); } }} />
        {extraActions?.((t) => setText((x) => (x ? `${x}\n${t}` : t)))}
        <button className="btn primary" disabled={sending || !text.trim()}>Send</button>
      </form>
    </div>
  );
}
