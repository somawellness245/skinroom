import { useState } from 'react';
import { supabase, must } from '../../lib/supabase';
import { usePractitioner } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { loadPhases, loadTemplates } from '../../lib/queries';
import type { Lesson, Phase, PlanTemplate } from '../../lib/types';
import { clientName, ErrorBox, Loading, Modal } from '../../components/ui';

type ClientLite = { id: string; first_name: string; last_name: string | null };

export function Learn() {
  const { practice } = usePractitioner();
  const [editing, setEditing] = useState<Partial<Lesson> | null>(null);
  const { data, error, loading, reload } = useLoad(async () => {
    const [lessons, phases, templates, clients] = await Promise.all([
      supabase.from('lessons').select('*').eq('practice_id', practice.id).order('created_at'),
      loadPhases(practice.id),
      loadTemplates(practice.id),
      supabase.from('clients').select('id, first_name, last_name').eq('practice_id', practice.id).eq('archived', false).order('first_name'),
    ]);
    return { lessons: must(lessons) as Lesson[], phases, templates, clients: must(clients) as ClientLite[] };
  }, [practice.id]);

  const audience = (l: Lesson): string[] => {
    if (l.all_phases) return ['Everyone'];
    const phases = l.phase_ids.map((id) => data?.phases.find((p) => p.id === id)?.name).filter(Boolean) as string[];
    const people = (l.client_ids ?? []).map((id) => data?.clients.find((c) => c.id === id)).filter(Boolean).map((c) => clientName(c!));
    const peopleTag = people.length > 2 ? [`${people.length} clients`] : people;
    return [...phases, ...peopleTag];
  };

  return (
    <>
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div style={{ maxWidth: 720 }}>
          <h1>Learn library</h1>
          <div className="muted">Short lessons you write once. Attach them to a phase and every client in that phase sees them on their home screen.</div>
        </div>
        <button className="btn primary" onClick={() => setEditing({ all_phases: true, phase_ids: [], client_ids: [], published: false })}>+ New lesson</button>
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : data && (
        data.lessons.length === 0 ? (
          <div className="card empty">
            <p>No lessons yet. Good first ones: how to take check-in photos, what to expect in each phase, sunscreen basics.</p>
            <button className="btn primary" onClick={() => setEditing({ all_phases: true, phase_ids: [], client_ids: [], published: false })}>Write your first lesson</button>
          </div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            {data.lessons.map((l, i) => (
              <button key={l.id} type="button" onClick={() => setEditing(l)} className="between"
                style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, borderTop: i ? '1px solid var(--line-soft)' : 0, padding: '16px 18px', cursor: 'pointer' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{l.title}</div>
                  <div className="small muted">{[l.summary, l.read_minutes && `${l.read_minutes} min read`].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {audience(l).map((n) => <span key={n} className="tag">{n}</span>)}
                  <span className={`tag ${l.published ? '' : 'plain'}`}>{l.published ? 'Published' : 'Draft'}</span>
                </div>
              </button>
            ))}
          </div>
        )
      )}
      {editing && data && <LessonForm lesson={editing} phases={data.phases} templates={data.templates} clients={data.clients} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(); }} />}
    </>
  );
}

function LessonForm({ lesson, phases, templates, clients, onClose, onSaved }: {
  lesson: Partial<Lesson>; phases: Phase[]; templates: PlanTemplate[]; clients: ClientLite[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [clientQ, setClientQ] = useState('');
  const { practice } = usePractitioner();
  const [f, setF] = useState({
    title: lesson.title ?? '', summary: lesson.summary ?? '', body: lesson.body ?? '',
    read_minutes: lesson.read_minutes ? String(lesson.read_minutes) : '',
    all_phases: lesson.all_phases ?? true, phase_ids: lesson.phase_ids ?? [], client_ids: lesson.client_ids ?? [], published: lesson.published ?? false,
  });
  const [error, setError] = useState<string | null>(null);

  async function save(publish?: boolean) {
    if (!f.title.trim()) return setError('Give the lesson a title.');
    if (!f.all_phases && f.phase_ids.length === 0 && f.client_ids.length === 0) return setError('Pick at least one phase or client, or choose “Everyone”.');
    const words = f.body.trim().split(/\s+/).filter(Boolean).length;
    const body = {
      title: f.title.trim(), summary: f.summary.trim() || null, body: f.body,
      read_minutes: Number(f.read_minutes) || (words ? Math.max(1, Math.round(words / 200)) : null),
      all_phases: f.all_phases, phase_ids: f.all_phases ? [] : f.phase_ids, client_ids: f.all_phases ? [] : f.client_ids,
      published: publish ?? f.published, updated_at: new Date().toISOString(),
    };
    const res = lesson.id
      ? await supabase.from('lessons').update(body).eq('id', lesson.id)
      : await supabase.from('lessons').insert({ ...body, practice_id: practice.id });
    if (res.error) return setError(res.error.message);
    await onSaved();
  }

  async function remove() {
    if (!lesson.id || !confirm('Delete this lesson?')) return;
    const { error } = await supabase.from('lessons').delete().eq('id', lesson.id);
    if (error) return setError(error.message);
    await onSaved();
  }

  const toggleClient = (id: string) => setF({ ...f, client_ids: f.client_ids.includes(id) ? f.client_ids.filter((x) => x !== id) : [...f.client_ids, id] });
  const shownClients = clients.filter((c) => f.client_ids.includes(c.id) || (clientQ.trim() && `${c.first_name} ${c.last_name ?? ''}`.toLowerCase().includes(clientQ.trim().toLowerCase())));
  const togglePhase = (id: string) => setF({ ...f, phase_ids: f.phase_ids.includes(id) ? f.phase_ids.filter((x) => x !== id) : [...f.phase_ids, id] });

  return (
    <Modal title={lesson.id ? 'Edit lesson' : 'New lesson'} onClose={onClose}>
      <ErrorBox error={error} />
      <label className="field"><span>Title</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Starting retinol without the sting" /></label>
      <label className="field"><span>One-line summary</span><input value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></label>
      <label className="field"><span>Lesson</span><textarea rows={10} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="Write it like you’d explain it in the treatment room." /></label>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack">
        <legend style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Who sees it</legend>
        <div className="seg" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <button type="button" aria-pressed={f.all_phases} onClick={() => setF({ ...f, all_phases: true })}>Everyone</button>
          <button type="button" aria-pressed={!f.all_phases} onClick={() => setF({ ...f, all_phases: false })}>Certain phases or clients</button>
        </div>
        {!f.all_phases && (
          <>
            <div className="stack" style={{ gap: 6 }}>
              <span className="small" style={{ fontWeight: 600 }}>Clients in these phases</span>
              {templates.map((t) => (
                <div key={t.id} className="stack" style={{ gap: 2 }}>
                  <span className="small muted">{t.name}</span>
                  <div className="row" style={{ gap: 6 }}>
                    {phases.filter((p) => p.template_id === t.id).map((p) => (
                      <button key={p.id} type="button" className="chip" aria-pressed={f.phase_ids.includes(p.id)} onClick={() => togglePhase(p.id)}>{p.name}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <span className="small" style={{ fontWeight: 600 }}>Specific clients{f.client_ids.length ? ` (${f.client_ids.length})` : ''}</span>
              {clients.length === 0 ? <span className="small muted">You don’t have any clients yet.</span> : (
                <>
                  <input className="input" type="search" placeholder="Search a client by name" aria-label="Search clients" value={clientQ} onChange={(e) => setClientQ(e.target.value)} />
                  <div className="row" style={{ gap: 6 }}>
                    {shownClients.map((c) => (
                      <button key={c.id} type="button" className="chip" aria-pressed={f.client_ids.includes(c.id)} onClick={() => toggleClient(c.id)}>
                        {clientName(c)}{f.client_ids.includes(c.id) ? ' ✕' : ''}
                      </button>
                    ))}
                    {clientQ.trim() && shownClients.length === 0 && <span className="small muted">No client by that name.</span>}
                  </div>
                </>
              )}
            </div>
            <p className="small muted" style={{ margin: 0 }}>Only the clients you pick here, plus anyone in the phases you picked, can see this lesson.</p>
          </>
        )}
      </fieldset>
      <div className="between">
        <div className="row">
          <button className="btn primary" onClick={() => save(true)}>{f.published ? 'Save' : 'Publish'}</button>
          {!f.published && <button className="btn" onClick={() => save(false)}>Save draft</button>}
          {f.published && <button className="btn" onClick={() => save(false)}>Unpublish</button>}
        </div>
        {lesson.id && <button className="btn danger" onClick={remove}>Delete</button>}
      </div>
    </Modal>
  );
}
