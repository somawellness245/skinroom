import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, shrinkImage } from '../../lib/supabase';
import { useClientSelf } from '../../lib/session';
import { REACTIONS } from '../../lib/types';
import { ErrorBox, Icon } from '../../components/ui';

type Angle = 'front' | 'left' | 'right';
const ANGLE_LABEL: Record<Angle, string> = { front: 'Front', left: 'Left side', right: 'Right side' };

export function ClientCheckin() {
  const { client, practice, refresh } = useClientSelf();
  const nav = useNavigate();
  const [files, setFiles] = useState<Partial<Record<Angle, File>>>({});
  const [previews, setPreviews] = useState<Partial<Record<Angle, string>>>({});
  const [nights, setNights] = useState<string | null>(null);
  const [change, setChange] = useState<string | null>(null);
  const [reactions, setReactions] = useState<string[]>([]);
  const [none, setNone] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => () => Object.values(previews).forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  function pick(angle: Angle, f: File | undefined) {
    if (!f) return;
    setFiles((x) => ({ ...x, [angle]: f }));
    setPreviews((x) => ({ ...x, [angle]: URL.createObjectURL(f) }));
  }

  function toggleReaction(r: string) {
    setNone(false);
    setReactions((x) => (x.includes(r) ? x.filter((y) => y !== r) : [...x, r]));
  }

  async function submit() {
    setError(null);
    const angles = Object.keys(files) as Angle[];
    if (angles.length === 0) return setError('Add at least your front photo so your esthetician can see your progress.');
    if (!nights || !change) return setError('Answer the two quick questions above.');
    try {
      setBusy('Uploading photos…');
      const uploaded: { angle: Angle; path: string }[] = [];
      for (const a of angles) {
        const path = `${practice.id}/${client.id}/checkin-${a}-${crypto.randomUUID()}.jpg`;
        const blob = await shrinkImage(files[a]!);
        const { error } = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' });
        if (error) throw new Error(`Photo upload failed: ${error.message}`);
        uploaded.push({ angle: a, path });
      }
      setBusy('Sending…');
      const { data: ck, error: cErr } = await supabase.from('checkins').insert({
        client_id: client.id, practice_id: practice.id,
        nights_followed: nights, concern_change: change, reactions: none ? [] : reactions, note: note.trim() || null,
      }).select('id').single();
      if (cErr) throw new Error(cErr.message);
      const uid = (await supabase.auth.getUser()).data.user?.id;
      const { error: pErr } = await supabase.from('photos').insert(uploaded.map((u) => ({
        client_id: client.id, practice_id: practice.id, checkin_id: ck.id, kind: 'checkin', angle: u.angle, storage_path: u.path, uploaded_by: uid,
      })));
      if (pErr) throw new Error(pErr.message);
      await supabase.from('messages').insert({ client_id: client.id, practice_id: practice.id, sender_role: 'client', sender_user_id: uid,
        body: `Sent my check-in with ${uploaded.length} photo${uploaded.length === 1 ? '' : 's'}.${note.trim() ? `\n\n${note.trim()}` : ''}` });
      await refresh();
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    return (
      <section className="card stack" style={{ textAlign: 'center', alignItems: 'center', padding: 28 }}>
        <span className="avatar lg" style={{ background: 'var(--accent)', color: '#fff' }}><Icon name="check" size={30} /></span>
        <h1 style={{ fontSize: 24 }}>Check-in sent</h1>
        <p className="muted" style={{ margin: 0 }}>Your esthetician will look at your photos and answers and get back to you here.</p>
        <button className="btn primary lg block" onClick={() => nav('/me')}>Back to home</button>
      </section>
    );
  }

  return (
    <>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <Link to="/me" className="btn link" aria-label="Back to home"><Icon name="back" /></Link>
        <div><div style={{ fontWeight: 700 }}>Your check-in</div><div className="small muted">Goes straight to {practice.name}</div></div>
      </div>

      <section className="stack">
        <h2 style={{ fontSize: 22 }}>1 · Your photos</h2>
        <div className="notice">Face a window, no makeup, hair pulled back. Same spot as last time so the comparison is fair.</div>
        <div className="photos-3">
          {(['front', 'left', 'right'] as Angle[]).map((a) => (
            <label key={a} className="stack" style={{ gap: 4, cursor: 'pointer' }}>
              {previews[a] ? (
                <div className="photo"><img src={previews[a]} alt={`${ANGLE_LABEL[a]} photo`} /><span className="label">Retake</span></div>
              ) : (
                <div className="photo" style={{ border: '2px dashed #B9C4C1', background: '#fff', color: 'var(--accent)', flexDirection: 'column', gap: 4, fontWeight: 700 }}>
                  <Icon name="camera" size={26} />Add photo
                </div>
              )}
              <span className="small" style={{ textAlign: 'center' }}>{ANGLE_LABEL[a]}</span>
              <input className="sr" type="file" accept="image/*" capture="user" onChange={(e) => pick(a, e.target.files?.[0])} />
            </label>
          ))}
        </div>
      </section>

      <section className="stack-lg">
        <h2 style={{ fontSize: 22 }}>2 · Quick questions</h2>
        <fieldset style={{ border: 0, margin: 0, padding: 0 }} className="stack">
          <legend style={{ fontWeight: 600, marginBottom: 8 }}>Nights you followed your evening routine this past week</legend>
          <div className="seg" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            {['0-2', '3-4', '5-6', '7'].map((n) => <button key={n} type="button" aria-pressed={nights === n} onClick={() => setNights(n)}>{n.replace('-', '–')}</button>)}
          </div>
        </fieldset>
        <fieldset style={{ border: 0, margin: 0, padding: 0 }} className="stack">
          <legend style={{ fontWeight: 600, marginBottom: 8 }}>{client.main_concern ? `Your ${client.main_concern.toLowerCase()}` : 'Your skin overall'} compared to last time</legend>
          <div className="seg" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {[['worse', 'Worse'], ['same', 'Same'], ['better', 'Better']].map(([v, l]) => <button key={v} type="button" aria-pressed={change === v} onClick={() => setChange(v)}>{l}</button>)}
          </div>
        </fieldset>
        <fieldset style={{ border: 0, margin: 0, padding: 0 }} className="stack">
          <legend style={{ fontWeight: 600, marginBottom: 8 }}>Any reactions? Pick all that apply</legend>
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="chip" aria-pressed={none} onClick={() => { setNone(!none); setReactions([]); }}>None</button>
            {REACTIONS.map((r) => <button key={r} type="button" className="chip warn" aria-pressed={reactions.includes(r)} onClick={() => toggleReaction(r)}>{r}</button>)}
          </div>
        </fieldset>
        <label className="field"><span>Anything else your esthetician should know?</span>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Travel, stress, new products, questions…" />
        </label>
      </section>

      <ErrorBox error={error} />
      <button className="btn primary lg block" onClick={submit} disabled={!!busy}>{busy ?? 'Send check-in'}</button>
      <p className="small muted" style={{ textAlign: 'center', margin: 0 }}>Your photos are private to you and your esthetician.</p>
    </>
  );
}
