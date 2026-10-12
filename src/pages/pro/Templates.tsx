import { useEffect, useState } from 'react';
import { supabase, must } from '../../lib/supabase';
import { usePractitioner } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { loadPhases, loadTemplates } from '../../lib/queries';
import type { Phase, PlanTemplate } from '../../lib/types';
import { ErrorBox, Loading } from '../../components/ui';

type DraftPhase = Omit<Phase, 'id' | 'template_id' | 'practice_id'> & { id?: string };

export function Templates() {
  const { practice } = usePractitioner();
  const { data, error, loading, reload } = useLoad(async () => {
    const [templates, phases, clients] = await Promise.all([
      loadTemplates(practice.id),
      loadPhases(practice.id),
      supabase.from('clients').select('plan_template_id').eq('practice_id', practice.id).eq('archived', false),
    ]);
    const uses = new Map<string, number>();
    for (const c of must(clients) as { plan_template_id: string | null }[]) if (c.plan_template_id) uses.set(c.plan_template_id, (uses.get(c.plan_template_id) ?? 0) + 1);
    return { templates, phases, uses };
  }, [practice.id]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (data && (!selected || !data.templates.some((t) => t.id === selected))) setSelected(data.templates[0]?.id ?? null);
  }, [data, selected]);

  async function create(copyFrom?: PlanTemplate) {
    const name = copyFrom ? `${copyFrom.name} (copy)` : 'New plan';
    const t = must(await supabase.from('plan_templates').insert({ practice_id: practice.id, name, description: copyFrom?.description ?? null }).select('*').single()) as PlanTemplate;
    const src = copyFrom ? data!.phases.filter((p) => p.template_id === copyFrom.id) : [{ position: 1, name: 'Phase 1', focus: null, description: null, duration_label: null, checkin_every_days: null }];
    must(await supabase.from('template_phases').insert(src.map((p, i) => ({
      template_id: t.id, practice_id: practice.id, position: i + 1, name: p.name, focus: p.focus, description: p.description, duration_label: p.duration_label, checkin_every_days: p.checkin_every_days,
    }))));
    await reload();
    setSelected(t.id);
  }

  const tpl = data?.templates.find((t) => t.id === selected) ?? null;

  return (
    <>
      <div>
        <h1>Plan templates</h1>
        <div className="muted">Build your treatment approach once, then assign it to any client. You move clients between phases yourself.</div>
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : data && (
        <div className="two-col">
          <div className="side" style={{ flex: '1 1 240px', maxWidth: 320 }}>
            {data.templates.map((t) => (
              <button key={t.id} type="button" className="card tight" onClick={() => setSelected(t.id)}
                style={{ textAlign: 'left', cursor: 'pointer', border: t.id === selected ? '2px solid var(--accent)' : undefined }}>
                <div style={{ fontWeight: 600 }}>{t.name}</div>
                <div className="small muted">{data.phases.filter((p) => p.template_id === t.id).length} phases · {data.uses.get(t.id) ?? 0} clients</div>
              </button>
            ))}
            <button type="button" className="btn dashed" onClick={() => create()}>+ New template</button>
          </div>
          <div className="main">
            {tpl ? (
              <TemplateEditor key={tpl.id} template={tpl} phases={data.phases.filter((p) => p.template_id === tpl.id)} uses={data.uses.get(tpl.id) ?? 0}
                onSaved={reload} onDuplicate={() => create(tpl)} />
            ) : <div className="card empty">Create your first plan template.</div>}
          </div>
        </div>
      )}
    </>
  );
}

function TemplateEditor({ template, phases, uses, onSaved, onDuplicate }: {
  template: PlanTemplate; phases: Phase[]; uses: number; onSaved: () => Promise<void>; onDuplicate: () => void;
}) {
  const { practice } = usePractitioner();
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? '');
  const [rows, setRows] = useState<DraftPhase[]>(() => [...phases].sort((a, b) => a.position - b.position));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const upd = (i: number, patch: Partial<DraftPhase>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  };

  async function save() {
    if (!rows.length) return setError('A plan needs at least one phase.');
    if (rows.some((r) => !r.name.trim())) return setError('Every phase needs a name.');
    setBusy(true);
    setError(null);
    try {
      must(await supabase.from('plan_templates').update({ name: name.trim() || 'Untitled plan', description: description.trim() || null }).eq('id', template.id));
      const keep = rows.filter((r) => r.id).map((r) => r.id!);
      const removed = phases.filter((p) => !keep.includes(p.id)).map((p) => p.id);
      if (removed.length) must(await supabase.from('template_phases').delete().in('id', removed));
      for (const [i, r] of rows.entries()) {
        const body = { position: i + 1, name: r.name.trim(), focus: r.focus || null, description: r.description || null, duration_label: r.duration_label || null, checkin_every_days: r.checkin_every_days || null };
        if (r.id) must(await supabase.from('template_phases').update(body).eq('id', r.id));
        else must(await supabase.from('template_phases').insert({ ...body, template_id: template.id, practice_id: practice.id }));
      }
      await onSaved();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(uses ? `${uses} client(s) use this plan. They’ll keep their info but lose their phase. Delete anyway?` : 'Delete this template?')) return;
    const { error } = await supabase.from('plan_templates').delete().eq('id', template.id);
    if (error) return setError(error.message);
    await onSaved();
  }

  return (
    <section className="card stack-lg">
      <div className="between">
        <input className="input" style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 20, maxWidth: 420 }} aria-label="Template name" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="row">
          {saved && <span className="tag">Saved</span>}
          <button type="button" className="btn" onClick={onDuplicate}>Duplicate</button>
          <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
      <label className="field"><span>Short description</span><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Reset → Prep → Correct → Maintain" /></label>
      <ErrorBox error={error} />
      <div className="stack">
        {rows.map((r, i) => (
          <div key={r.id ?? `new-${i}`} className="card tight stack" style={{ background: 'var(--ground)' }}>
            <div className="between">
              <span className="avatar" style={{ width: 36, height: 36 }}>{i + 1}</span>
              <div className="row">
                <button type="button" className="btn link" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move phase up">↑</button>
                <button type="button" className="btn link" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Move phase down">↓</button>
                <button type="button" className="btn link" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>
              </div>
            </div>
            <div className="form-grid">
              <label className="field"><span>Phase name</span><input value={r.name} onChange={(e) => upd(i, { name: e.target.value })} /></label>
              <label className="field"><span>Focus</span><input value={r.focus ?? ''} onChange={(e) => upd(i, { focus: e.target.value })} placeholder="e.g. Barrier support" /></label>
              <label className="field"><span>Typical length</span><input value={r.duration_label ?? ''} onChange={(e) => upd(i, { duration_label: e.target.value })} placeholder="e.g. 4–8 weeks" /></label>
              <label className="field"><span>Check-ins</span>
                <select value={r.checkin_every_days ?? ''} onChange={(e) => upd(i, { checkin_every_days: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Practice default</option><option value={7}>Weekly</option><option value={14}>Every 2 weeks</option><option value={30}>Monthly</option><option value={42}>Every 6 weeks</option><option value={60}>Every 2 months</option>
                </select>
              </label>
            </div>
            <label className="field"><span>What happens in this phase (clients see this)</span><textarea rows={2} value={r.description ?? ''} onChange={(e) => upd(i, { description: e.target.value })} /></label>
          </div>
        ))}
        <button type="button" className="btn dashed" onClick={() => setRows([...rows, { position: rows.length + 1, name: '', focus: null, description: null, duration_label: null, checkin_every_days: null }])}>+ Add a phase</button>
      </div>
      <div><button type="button" className="btn danger" onClick={remove}>Delete template</button></div>
    </section>
  );
}
