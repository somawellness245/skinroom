import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { usePractitioner } from '../../../lib/session';
import { addDays, fmtDate, today } from '../../../lib/dates';
import type { Client, Product, RegimenStep } from '../../../lib/types';
import { ErrorBox, Modal } from '../../../components/ui';

type Draft = Partial<RegimenStep> & { time_of_day: 'am' | 'pm' };

export function RegimenEditor({ client, steps, products, onChanged }: {
  client: Client; steps: RegimenStep[]; products: Product[]; onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const byId = new Map(products.map((p) => [p.id, p]));

  async function move(list: RegimenStep[], i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const a = list[i], b = list[j];
    await Promise.all([
      supabase.from('regimen_steps').update({ position: j }).eq('id', a.id),
      supabase.from('regimen_steps').update({ position: i }).eq('id', b.id),
    ]);
    await onChanged();
  }

  async function remove(s: RegimenStep) {
    if (!confirm(`Remove “${s.label}” from ${client.first_name}’s routine?`)) return;
    const { error } = await supabase.from('regimen_steps').delete().eq('id', s.id);
    if (error) return setError(error.message);
    await onChanged();
  }

  return (
    <section className="stack-lg">
      <ErrorBox error={error} />
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        {(['am', 'pm'] as const).map((tod) => {
          const list = steps.filter((s) => s.time_of_day === tod).sort((a, b) => a.position - b.position);
          return (
            <div key={tod} className="card stack">
              <h2>{tod === 'am' ? 'Morning (AM)' : 'Evening (PM)'}</h2>
              {list.length === 0 && <p className="muted" style={{ margin: 0 }}>No steps yet.</p>}
              <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }} className="list">
                {list.map((s, i) => {
                  const p = s.product_id ? byId.get(s.product_id) : undefined;
                  const runsOut = p?.lasts_days && s.supply_started_on ? addDays(s.supply_started_on, p.lasts_days) : null;
                  return (
                    <li key={s.id} className="between" style={{ alignItems: 'flex-start' }}>
                      <div className="grow">
                        <div style={{ fontWeight: 600 }}>{i + 1}. {s.label}</div>
                        <div className="small muted">{[s.frequency, s.instructions].filter(Boolean).join(' · ') || 'Daily'}</div>
                        {runsOut && <div className="small muted">Runs out ~{fmtDate(runsOut)}</div>}
                      </div>
                      <div className="row" style={{ gap: 2 }}>
                        <button className="btn link" aria-label="Move up" onClick={() => move(list, i, -1)} disabled={i === 0}>↑</button>
                        <button className="btn link" aria-label="Move down" onClick={() => move(list, i, 1)} disabled={i === list.length - 1}>↓</button>
                        <button className="btn link" onClick={() => setEditing(s)}>Edit</button>
                        <button className="btn link" onClick={() => remove(s)}>Remove</button>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <button className="btn dashed" onClick={() => setEditing({ time_of_day: tod, position: list.length })}>+ Add {tod.toUpperCase()} step</button>
            </div>
          );
        })}
      </div>
      {editing && <StepForm client={client} step={editing} products={products} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await onChanged(); }} />}
    </section>
  );
}

function StepForm({ client, step, products, onClose, onSaved }: {
  client: Client; step: Draft; products: Product[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const { practice } = usePractitioner();
  const [f, setF] = useState({
    time_of_day: step.time_of_day,
    product_id: step.product_id ?? '',
    label: step.label ?? '',
    instructions: step.instructions ?? '',
    frequency: step.frequency ?? '',
    supply_started_on: step.supply_started_on ?? (step.id ? '' : today()),
  });
  const [error, setError] = useState<string | null>(null);
  const [notify, setNotify] = useState(true);

  function pickProduct(id: string) {
    const p = products.find((x) => x.id === id);
    setF({ ...f, product_id: id, label: p ? p.name : f.label });
  }

  async function save() {
    if (!f.label.trim()) return setError('Give this step a name or pick a product.');
    const body = {
      time_of_day: f.time_of_day,
      product_id: f.product_id || null,
      label: f.label.trim(),
      instructions: f.instructions.trim() || null,
      frequency: f.frequency.trim() || null,
      supply_started_on: f.product_id ? f.supply_started_on || null : null,
    };
    const res = step.id
      ? await supabase.from('regimen_steps').update(body).eq('id', step.id)
      : await supabase.from('regimen_steps').insert({ ...body, client_id: client.id, practice_id: practice.id, position: step.position ?? 0 });
    if (res.error) return setError(res.error.message);
    if (notify) {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      const what = step.id ? `Routine updated: ${body.label}${body.frequency ? ` · ${body.frequency}` : ''}` : `New ${body.time_of_day.toUpperCase()} step: ${body.label}`;
      await supabase.from('messages').insert({ client_id: client.id, practice_id: practice.id, sender_role: 'system', sender_user_id: uid, body: what });
    }
    await onSaved();
  }

  return (
    <Modal title={step.id ? 'Edit step' : 'Add step'} onClose={onClose}>
      <ErrorBox error={error} />
      <div className="form-grid">
        <label className="field"><span>When</span>
          <select value={f.time_of_day} onChange={(e) => setF({ ...f, time_of_day: e.target.value as 'am' | 'pm' })}><option value="am">Morning (AM)</option><option value="pm">Evening (PM)</option></select>
        </label>
        <label className="field"><span>From your product shelf</span>
          <select value={f.product_id} onChange={(e) => pickProduct(e.target.value)}>
            <option value="">— Not on shelf / custom step —</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>
      <label className="field"><span>Step name</span><input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="e.g. Gentle cleanser" /></label>
      <div className="form-grid">
        <label className="field"><span>How often</span><input value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })} placeholder="e.g. Every 3rd night" /></label>
        {f.product_id && <label className="field"><span>Started this bottle on</span><input type="date" value={f.supply_started_on} onChange={(e) => setF({ ...f, supply_started_on: e.target.value })} /></label>}
      </div>
      <label className="field"><span>Instructions for {client.first_name}</span><input value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} placeholder="e.g. Pea-sized, avoid nose creases" /></label>
      <label className="check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Let {client.first_name} know in messages</label>
      <button className="btn primary lg" onClick={save}>Save step</button>
    </Modal>
  );
}
