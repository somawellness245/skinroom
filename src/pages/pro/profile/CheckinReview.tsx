import { useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { usePractitioner } from '../../../lib/session';
import { fmtDate, fmtRelative } from '../../../lib/dates';
import type { Checkin, Client, Photo } from '../../../lib/types';
import { ErrorBox } from '../../../components/ui';
import { PhotoTile } from '../../../components/PhotoTile';

const NIGHTS: Record<string, string> = { '0-2': '0–2 of 7 nights', '3-4': '3–4 of 7 nights', '5-6': '5–6 of 7 nights', '7': 'Every night' };
const CHANGE: Record<string, string> = { worse: 'Worse', same: 'About the same', better: 'Better' };

export function CheckinReview({ client, data, onChanged }: {
  client: Client;
  data: { checkins: Checkin[]; photos: Photo[] };
  onChanged: () => Promise<void>;
}) {
  const { practice } = usePractitioner();
  const pending = data.checkins.filter((c) => !c.reviewed_at);
  const [selectedId, setSelectedId] = useState<string | null>(pending[pending.length - 1]?.id ?? data.checkins[0]?.id ?? null);
  const ck = data.checkins.find((c) => c.id === selectedId) ?? null;
  const [angle, setAngle] = useState<'front' | 'left' | 'right'>('front');
  const [reply, setReply] = useState(ck?.response ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const baseline = useMemo(() => {
    const base = data.photos.filter((p) => p.kind === 'baseline');
    const pool = base.length ? base : data.photos.filter((p) => p.kind === 'checkin' && p.checkin_id !== ck?.id);
    return pool.find((p) => p.angle === angle) ?? null;
  }, [data.photos, angle, ck?.id]);
  const current = data.photos.find((p) => p.checkin_id === ck?.id && p.angle === angle) ?? null;
  const ckPhotos = data.photos.filter((p) => p.checkin_id === ck?.id);

  if (!client.user_id) return <section className="card empty">{client.first_name} hasn’t accepted their invite yet, so there are no check-ins.</section>;
  if (!ck) return <section className="card empty">No check-ins yet. {client.first_name}’s first one is due {fmtDate(client.next_checkin_on)}.</section>;

  async function respond(sendMessage: boolean) {
    if (!ck) return;
    setBusy(true);
    setError(null);
    const text = reply.trim();
    const { error } = await supabase.from('checkins').update({ response: text || null, reviewed_at: new Date().toISOString() }).eq('id', ck.id);
    if (!error && sendMessage && text) {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      await supabase.from('messages').insert({ client_id: client.id, practice_id: practice.id, sender_role: 'practitioner', sender_user_id: uid, body: text });
    }
    setBusy(false);
    if (error) return setError(error.message);
    const next = data.checkins.find((c) => !c.reviewed_at && c.id !== ck.id);
    if (next) { setSelectedId(next.id); setReply(''); }
    await onChanged();
  }

  return (
    <div className="two-col">
      <div className="main">
        {pending.length > 1 && (
          <div className="notice row">
            {pending.length} check-ins waiting.
            {pending.map((p) => (
              <button key={p.id} className="btn link" aria-pressed={p.id === ck.id} onClick={() => { setSelectedId(p.id); setReply(p.response ?? ''); }}>{fmtDate(p.submitted_at)}</button>
            ))}
          </div>
        )}
        <section className="card stack">
          <div className="between">
            <h2>{baseline ? 'Baseline vs. this check-in' : 'Check-in photos'}</h2>
            <div className="row" role="group" aria-label="Photo angle">
              {(['front', 'left', 'right'] as const).map((a) => (
                <button key={a} className="chip" aria-pressed={angle === a} onClick={() => setAngle(a)}>{a[0].toUpperCase() + a.slice(1)}</button>
              ))}
            </div>
          </div>
          <div className="photos-2">
            <figure style={{ margin: 0 }} className="stack">
              <PhotoTile path={baseline?.storage_path} label="Baseline" />
              <figcaption className="small muted">{baseline ? `${baseline.kind === 'baseline' ? 'Baseline' : 'Earlier check-in'} · ${fmtDate(baseline.taken_on)}` : 'Add baseline photos in the Photo timeline tab'}</figcaption>
            </figure>
            <figure style={{ margin: 0 }} className="stack">
              <PhotoTile path={current?.storage_path} label="This check-in" />
              <figcaption className="small muted">{fmtDate(ck.submitted_at)} · {ckPhotos.length} of 3 photos sent</figcaption>
            </figure>
          </div>
        </section>

        <section className="card stack">
          <div className="between">
            <h2>What {client.first_name} reported</h2>
            <span className="small muted">{fmtRelative(ck.submitted_at)}</span>
          </div>
          <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <div className="card tight" style={{ background: 'var(--ground)', border: 0 }}><div className="small muted">Routine followed</div><div style={{ fontWeight: 600 }}>{ck.nights_followed ? NIGHTS[ck.nights_followed] : '—'}</div></div>
            <div className="card tight" style={{ background: 'var(--ground)', border: 0 }}><div className="small muted">{client.main_concern ? 'Main concern' : 'Skin overall'}</div><div style={{ fontWeight: 600 }}>{ck.concern_change ? CHANGE[ck.concern_change] : '—'}</div></div>
            <div className={`card tight ${ck.reactions.length ? 'warn' : ''}`} style={ck.reactions.length ? undefined : { background: 'var(--ground)', border: 0 }}>
              <div className="small" style={{ opacity: 0.85 }}>Reactions</div>
              <div style={{ fontWeight: 600 }}>{ck.reactions.length ? ck.reactions.join(', ') : 'None'}</div>
            </div>
          </div>
          {ck.note && <div className="card tight pre" style={{ background: 'var(--ground)', border: 0 }}>“{ck.note}”</div>}
        </section>

        <section className="card stack">
          <h2>Your response</h2>
          <ErrorBox error={error} />
          <label className="field"><span>Note to {client.first_name} (shows in their portal and messages)</span>
            <textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="What you’re seeing, what to keep doing, what to change…" />
          </label>
          <p className="small muted" style={{ margin: 0 }}>Need to change their routine? Edit it in the Regimen tab. Changes show up for them right away.</p>
          <div className="row">
            <button className="btn primary" onClick={() => respond(true)} disabled={busy || !reply.trim()}>{ck.reviewed_at ? 'Update & send' : `Send to ${client.first_name}`}</button>
            {!ck.reviewed_at && <button className="btn" onClick={() => respond(false)} disabled={busy}>Mark reviewed, no message</button>}
            {ck.reviewed_at && <span className="tag">Reviewed {fmtRelative(ck.reviewed_at)}</span>}
          </div>
        </section>
      </div>
      <aside className="side">
        <section className="card stack">
          <h3>All photos from this check-in</h3>
          <div className="photos-3">
            {(['front', 'left', 'right'] as const).map((a) => (
              <PhotoTile key={a} path={ckPhotos.find((p) => p.angle === a)?.storage_path} label={a[0].toUpperCase() + a.slice(1)} />
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
