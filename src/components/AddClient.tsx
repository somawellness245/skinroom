import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { addDays, today } from '../lib/dates';
import type { Client, Phase, PlanTemplate, Practice } from '../lib/types';
import { ErrorBox, Modal } from './ui';
import { InviteLink } from './InviteLink';

export function AddClient({ practice, templates, phases, onClose, onAdded }: {
  practice: Practice; templates: PlanTemplate[]; phases: Phase[]; onClose: () => void; onAdded: () => void;
}) {
  const [f, setF] = useState({
    first_name: '', last_name: '', email: '', location: '', main_concern: '', goal: '',
    template: templates[0]?.id ?? '', is_virtual: true,
  });
  const [created, setCreated] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const first = phases.filter((p) => p.template_id === f.template).sort((a, b) => a.position - b.position)[0];
    const { data, error } = await supabase.from('clients').insert({
      practice_id: practice.id,
      first_name: f.first_name.trim(),
      last_name: f.last_name.trim() || null,
      email: f.email.trim() || null,
      location: f.location.trim() || null,
      main_concern: f.main_concern.trim() || null,
      goal: f.goal.trim() || null,
      is_virtual: f.is_virtual,
      plan_template_id: f.template || null,
      current_phase_id: first?.id ?? null,
      phase_started_on: first ? today() : null,
      next_checkin_on: addDays(today(), first?.checkin_every_days ?? practice.checkin_every_days),
    }).select('*').single();
    setBusy(false);
    if (error) return setError(error.message);
    setCreated(data as Client);
    onAdded();
  }

  if (created) {
    return (
      <Modal title={`${created.first_name} is added`} onClose={onClose}>
        <p style={{ margin: 0 }}>Send {created.first_name} this link. It opens their portal with your branding, and they create their own login.</p>
        <InviteLink client={created} practice={practice} />
        <button className="btn primary" onClick={onClose}>Done</button>
      </Modal>
    );
  }

  return (
    <Modal title="New client" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <ErrorBox error={error} />
        <div className="form-grid">
          <label className="field"><span>First name</span><input required value={f.first_name} onChange={set('first_name')} /></label>
          <label className="field"><span>Last name</span><input value={f.last_name} onChange={set('last_name')} /></label>
          <label className="field"><span>Email (optional)</span><input type="email" value={f.email} onChange={set('email')} /></label>
          <label className="field"><span>City, state</span><input value={f.location} onChange={set('location')} /></label>
        </div>
        <label className="field"><span>Main concern</span><input value={f.main_concern} onChange={set('main_concern')} placeholder="e.g. Post-inflammatory hyperpigmentation" /></label>
        <label className="field"><span>Goal</span><input value={f.goal} onChange={set('goal')} placeholder="e.g. Fade dark spots on cheeks and jawline" /></label>
        <label className="field"><span>Treatment plan</span>
          <select value={f.template} onChange={set('template')}>
            <option value="">No plan yet</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={f.is_virtual} onChange={set('is_virtual')} /> Virtual client</label>
        <button className="btn primary lg" disabled={busy}>{busy ? 'Adding…' : 'Add client'}</button>
      </form>
    </Modal>
  );
}
