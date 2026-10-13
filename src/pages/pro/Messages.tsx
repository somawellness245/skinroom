import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, must } from '../../lib/supabase';
import { usePractitioner } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { fmtRelative } from '../../lib/dates';
import type { Client, Lesson, Message } from '../../lib/types';
import { clientName, ErrorBox, Loading } from '../../components/ui';
import { Thread } from '../../components/Thread';

export function Messages() {
  const { clientId } = useParams();
  const nav = useNavigate();
  const { practice } = usePractitioner();
  const [q, setQ] = useState('');
  const { data, error, loading } = useLoad(async () => {
    const [clients, msgs, lessons] = await Promise.all([
      supabase.from('clients').select('*').eq('practice_id', practice.id).eq('archived', false),
      supabase.from('messages').select('*').eq('practice_id', practice.id).order('created_at', { ascending: false }).limit(1000),
      supabase.from('lessons').select('id, title').eq('practice_id', practice.id).eq('published', true),
    ]);
    const latest = new Map<string, Message>();
    const unread = new Map<string, number>();
    for (const m of must(msgs) as Message[]) {
      if (!latest.has(m.client_id)) latest.set(m.client_id, m);
      if (m.sender_role === 'client' && !m.read_by_practice_at) unread.set(m.client_id, (unread.get(m.client_id) ?? 0) + 1);
    }
    return { clients: must(clients) as Client[], latest, unread, lessons: must(lessons) as Pick<Lesson, 'id' | 'title'>[] };
  }, [practice.id, clientId]);

  const list = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    return data.clients
      .filter((c) => !s || `${c.first_name} ${c.last_name ?? ''}`.toLowerCase().includes(s))
      .sort((a, b) => (data.latest.get(b.id)?.created_at ?? '').localeCompare(data.latest.get(a.id)?.created_at ?? ''));
  }, [data, q]);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} />;
  const active = data.clients.find((c) => c.id === clientId) ?? null;

  return (
    <>
      <h1>Messages</h1>
      <div className="card" style={{ padding: 0, display: 'flex', flexWrap: 'wrap', overflow: 'hidden', minHeight: 560 }}>
        <div style={{ flex: '1 1 260px', minWidth: 0, borderRight: '1px solid var(--line)', maxHeight: 640, overflowY: 'auto' }} className="thread-list">
          <div style={{ padding: 12 }}><input className="input" type="search" placeholder="Search clients" aria-label="Search clients" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {list.map((c) => {
            const last = data.latest.get(c.id);
            const n = data.unread.get(c.id) ?? 0;
            return (
              <button key={c.id} aria-current={c.id === clientId} onClick={() => nav(`/app/messages/${c.id}`)}>
                <span className="between" style={{ width: '100%' }}>
                  <span style={{ fontWeight: 600 }}>{clientName(c)} {n > 0 && <span className="dot" />}</span>
                  <span className="small muted">{last ? fmtRelative(last.created_at) : ''}</span>
                </span>
                <span className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                  {last ? `${last.sender_role === 'practitioner' ? 'You: ' : ''}${last.body}` : 'No messages yet'}
                </span>
              </button>
            );
          })}
        </div>
        <section style={{ flex: '999 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {active ? (
            <>
              <div className="between" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
                <strong>{active.first_name} {active.last_name}</strong>
                <Link to={`/app/clients/${active.id}`} className="small">Open profile</Link>
              </div>
              <div style={{ flex: 1, padding: 18, display: 'flex', minHeight: 420, maxHeight: 640 }}>
                <Thread key={active.id} clientId={active.id} practiceId={practice.id} as="practitioner" placeholder={`Message ${active.first_name}`}
                  extraActions={data.lessons.length ? (insert) => (
                    <select className="input" style={{ width: 'auto' }} aria-label="Attach a lesson" value=""
                      onChange={(e) => { const l = data.lessons.find((x) => x.id === e.target.value); if (l) insert(`Have a read: “${l.title}” (on your Home screen under “For you to read”)`); }}>
                      <option value="">Attach lesson</option>
                      {data.lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
                    </select>
                  ) : undefined} />
              </div>
            </>
          ) : <div className="empty" style={{ margin: 'auto' }}>Pick a client to see your conversation.</div>}
        </section>
      </div>
    </>
  );
}
