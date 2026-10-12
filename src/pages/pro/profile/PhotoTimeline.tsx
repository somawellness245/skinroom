import { useMemo, useState } from 'react';
import { supabase, shrinkImage } from '../../../lib/supabase';
import { usePractitioner } from '../../../lib/session';
import { fmtDate, today } from '../../../lib/dates';
import type { Client, Photo } from '../../../lib/types';
import { ErrorBox, Modal } from '../../../components/ui';
import { PhotoTile } from '../../../components/PhotoTile';

const KIND_LABEL = { baseline: 'Baseline', checkin: 'Client check-in', session: 'Session (taken by you)' } as const;

export function PhotoTimeline({ client, photos, onChanged }: { client: Client; photos: Photo[]; onChanged: () => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<'all' | Photo['kind']>('all');
  const groups = useMemo(() => {
    const m = new Map<string, Photo[]>();
    for (const p of photos.filter((p) => kind === 'all' || p.kind === kind)) {
      const key = `${p.taken_on}|${p.kind}|${p.checkin_id ?? ''}`;
      m.set(key, [...(m.get(key) ?? []), p]);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [photos, kind]);

  return (
    <section className="stack-lg">
      <div className="between">
        <div className="row" role="group" aria-label="Photo type">
          {(['all', 'baseline', 'checkin', 'session'] as const).map((k) => (
            <button key={k} className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{k === 'all' ? 'All' : KIND_LABEL[k]}</button>
          ))}
        </div>
        <button className="btn primary" onClick={() => setAdding(true)}>+ Add photos</button>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Client check-in photos are kept separate from the baseline and session photos you take. Clients can add photos but can’t delete any.</p>
      {groups.length === 0 ? <div className="card empty">No photos yet. Add baseline photos from {client.first_name}’s intake to compare against later.</div> : groups.map(([key, ps]) => (
        <div key={key} className="card stack">
          <div className="between"><strong>{fmtDate(ps[0].taken_on, { month: 'long', day: 'numeric', year: 'numeric' })}</strong><span className="tag plain">{KIND_LABEL[ps[0].kind]}</span></div>
          <div className="photos-3" style={{ maxWidth: 520 }}>
            {(['front', 'left', 'right'] as const).map((a) => <PhotoTile key={a} path={ps.find((p) => p.angle === a)?.storage_path} label={a[0].toUpperCase() + a.slice(1)} />)}
          </div>
          {ps.filter((p) => p.angle === 'other').length > 0 && (
            <div className="photos-3" style={{ maxWidth: 520 }}>{ps.filter((p) => p.angle === 'other').map((p) => <PhotoTile key={p.id} path={p.storage_path} />)}</div>
          )}
        </div>
      ))}
      {adding && <AddPhotos client={client} onClose={() => setAdding(false)} onDone={async () => { setAdding(false); await onChanged(); }} />}
    </section>
  );
}

function AddPhotos({ client, onClose, onDone }: { client: Client; onClose: () => void; onDone: () => Promise<void> }) {
  const { practice } = usePractitioner();
  const [kind, setKind] = useState<'baseline' | 'session'>('baseline');
  const [date, setDate] = useState(today());
  const [files, setFiles] = useState<Partial<Record<'front' | 'left' | 'right', File>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const entries = Object.entries(files) as ['front' | 'left' | 'right', File][];
    if (!entries.length) return setError('Pick at least one photo.');
    setBusy(true);
    setError(null);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    for (const [angle, file] of entries) {
      const path = `${practice.id}/${client.id}/${kind}-${angle}-${crypto.randomUUID()}.jpg`;
      const blob = await shrinkImage(file);
      const up = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' });
      if (up.error) { setBusy(false); return setError(up.error.message); }
      const ins = await supabase.from('photos').insert({ client_id: client.id, practice_id: practice.id, kind, angle, storage_path: path, taken_on: date, uploaded_by: uid });
      if (ins.error) { setBusy(false); return setError(ins.error.message); }
    }
    setBusy(false);
    await onDone();
  }

  return (
    <Modal title="Add photos" onClose={onClose}>
      <ErrorBox error={error} />
      <div className="form-grid">
        <label className="field"><span>Type</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as 'baseline' | 'session')}>
            <option value="baseline">Baseline (intake / starting point)</option>
            <option value="session">Session (before/after you took)</option>
          </select>
        </label>
        <label className="field"><span>Date taken</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      </div>
      <div className="photos-3">
        {(['front', 'left', 'right'] as const).map((a) => (
          <label key={a} className="stack" style={{ gap: 4, cursor: 'pointer' }}>
            <PhotoTile url={files[a] ? URL.createObjectURL(files[a]!) : null} label={a[0].toUpperCase() + a.slice(1)} />
            <span className="btn soft">Choose</span>
            <input className="sr" type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && setFiles({ ...files, [a]: e.target.files[0] })} />
          </label>
        ))}
      </div>
      <button className="btn primary lg" onClick={save} disabled={busy}>{busy ? 'Uploading…' : 'Save photos'}</button>
    </Modal>
  );
}
