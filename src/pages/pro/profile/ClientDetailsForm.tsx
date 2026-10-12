import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import type { Client } from '../../../lib/types';
import { ErrorBox, Modal } from '../../../components/ui';

export function ClientDetailsForm({ client, onClose, onSaved }: { client: Client; onClose: () => void; onSaved: () => Promise<void> }) {
  const [f, setF] = useState({
    first_name: client.first_name, last_name: client.last_name ?? '', email: client.email ?? '', location: client.location ?? '',
    main_concern: client.main_concern ?? '', goal: client.goal ?? '', sensitivities: client.sensitivities ?? '',
    fitzpatrick: client.fitzpatrick ?? '', started_on: client.started_on, is_virtual: client.is_virtual,
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });

  async function save() {
    if (!f.first_name.trim()) return setError('First name is required.');
    const blank = (s: string) => s.trim() || null;
    const { error } = await supabase.from('clients').update({
      first_name: f.first_name.trim(), last_name: blank(f.last_name), email: blank(f.email), location: blank(f.location),
      main_concern: blank(f.main_concern), goal: blank(f.goal), sensitivities: blank(f.sensitivities), fitzpatrick: blank(f.fitzpatrick),
      started_on: f.started_on, is_virtual: f.is_virtual,
    }).eq('id', client.id);
    if (error) return setError(error.message);
    await onSaved();
  }

  return (
    <Modal title="Client details" onClose={onClose}>
      <ErrorBox error={error} />
      <div className="form-grid">
        <label className="field"><span>First name</span><input value={f.first_name} onChange={set('first_name')} /></label>
        <label className="field"><span>Last name</span><input value={f.last_name} onChange={set('last_name')} /></label>
        <label className="field"><span>Email</span><input type="email" value={f.email} onChange={set('email')} /></label>
        <label className="field"><span>City, state</span><input value={f.location} onChange={set('location')} /></label>
        <label className="field"><span>Fitzpatrick</span>
          <select value={f.fitzpatrick} onChange={set('fitzpatrick')}><option value="">—</option>{['I', 'II', 'III', 'IV', 'V', 'VI'].map((x) => <option key={x}>{x}</option>)}</select>
        </label>
        <label className="field"><span>Started</span><input type="date" value={f.started_on} onChange={set('started_on')} /></label>
      </div>
      <label className="field"><span>Main concern</span><input value={f.main_concern} onChange={set('main_concern')} /></label>
      <label className="field"><span>Goal (client sees this)</span><input value={f.goal} onChange={set('goal')} /></label>
      <label className="field"><span>Sensitivities</span><input value={f.sensitivities} onChange={set('sensitivities')} placeholder="e.g. Retinoids, fragrance" /></label>
      <label className="check"><input type="checkbox" checked={f.is_virtual} onChange={set('is_virtual')} /> Virtual client</label>
      <button className="btn primary lg" onClick={save}>Save</button>
    </Modal>
  );
}
