import { useState } from 'react';
import { supabase, must } from '../../lib/supabase';
import { usePractitioner } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { loadPhases, loadTemplates } from '../../lib/queries';
import type { Lesson, Phase, PlanTemplate } from '../../lib/types';
import { ErrorBox, Loading, Modal } from '../../components/ui';

export function Learn() {
  const { practice } = usePractitioner();
  const [editing, setEditing] = useState<Partial<Lesson> | null>(null);
  const { data, error, loading, reload } = useLoad(async () => {
    const [lessons, phases, templates] = await Promise.all([
      supabase.from('lessons').select('*').eq('practice_id', practice.id).order('created_at'),
      loadPhases(practice.id),
      loadTemplates(practice.id),
    ]);
    return { lessons: must(lessons) as Lesson[], phases, templates };
  }, [practice.id]);

  const phaseNames = (l: Lesson) => (l.all_phases ? ['All phases'] : l.phase_ids.map((id) => data?.phases.find((p) => p.id === id)?.name).filter(Boolean) as string[]);

  return (
    <>
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div style={{ maxWidth: 720 }}>
          <h1>Learn library</h1>
          <div className="muted">Short lessons you write once. Attach them to a phase and every client in that phase sees them on their home screen.</div>
        </div>
        <button className="btn primary" onClick={() => setEditing({ all_phases: true, phase_ids: [], published: false })}>+ New lesson</button>
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : data && (
        data.lessons.length === 0 ? (
          <div className="card empty">
            <p>No lessons yet. Good first ones: how to take check-in photos, what to expect in each phase, sunscreen basics.</p>
            <button className="btn primary" onClick={() => setEditing({ all_phases: true, phase_ids: [], published: false })}>Write your first lesson</button>
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
                  {phaseNames(l).map((n) => <span key={n} className="tag">{n}</span>)}
                  <span className={`tag ${l.published ? '' : 'plain'}`}>{l.published ? 'Published' : 'Draft'}</span>
                </div>
              </button>
            ))}
          </div>
        )
      )}
      {editing && data && <LessonForm lesson={editing} phases={data.phases} templates={data.templates} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(); }} />}
    </>
  );
}

function LessonForm({ lesson, phases, templates, onClose, onSaved }: {
  lesson: Partial<Lesson>; phases: Phase[]; templates: PlanTemplate[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const { practice } = usePractitioner();
  const [f, setF] = useState({
    title: lesson.title ?? '', summary: lesson.summary ?? '', body: lesson.body ?? '',
    read_minutes: lesson.read_minutes ? String(lesson.read_minutes) : '',
    all_phases: lesson.all_phases ?? true, phase_ids: lesson.phase_ids ?? [], published: lesson.published ?? false,
  });
  const [error, setError] = useState<string | null>(null);

  async function save(publish?: boolean) {
    if (!f.title.trim()) return setError('Give the lesson a title.');
    if (!f.all_phases && f.phase_ids.length === 0) return setError('Pick at least one phase, or choose “All phases”.');
    const words = f.body.trim().split(/\s+/).filter(Boolean).length;
    const body = {
      title: f.title.trim(), summary: f.summary.trim() || null, body: f.body,
      read_minutes: Number(f.read_minutes) || (words ? Math.max(1, Math.round(words / 200)) : null),
      all_phases: f.all_phases, phase_ids: f.all_phases ? [] : f.phase_ids,
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

  const togglePhase = (id: string) => setF({ ...f, phase_ids: f.phase_ids.includes(id) ? f.phase_ids.filter((x) => x !== id) : [...f.phase_ids, id] });

  return (
    <Modal title={lesson.id ? 'Edit lesson' : 'New lesson'} onClose={onClose}>
      <ErrorBox error={error} />
      <label className="field"><span>Title</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Starting retinol without the sting" /></label>
      <label className="field"><span>One-line summary</span><input value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></label>
      <label className="field"><span>Lesson</span><textarea rows={10} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="Write it like you’d explain it in the treatment room." /></label>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack">
        <legend style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Who sees it</legend>
        <label className="check"><input type="checkbox" checked={f.all_phases} onChange={(e) => setF({ ...f, all_phases: e.target.checked })} /> All clients, every phase</label>
        {!f.all_phases && templates.map((t) => (
          <div key={t.id} className="stack" style={{ gap: 2 }}>
            <span className="small muted">{t.name}</span>
            <div className="row" style={{ gap: 6 }}>
              {phases.filter((p) => p.template_id === t.id).map((p) => (
                <button key={p.id} type="button" className="chip" aria-pressed={f.phase_ids.includes(p.id)} onClick={() => togglePhase(p.id)}>{p.name}</button>
              ))}
            </div>
          </div>
        ))}
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
