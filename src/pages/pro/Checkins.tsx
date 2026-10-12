import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, must, photoUrls } from '../../lib/supabase';
import { usePractitioner } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { loadClientRows, phaseLabel, type ClientRow } from '../../lib/queries';
import { fmtDue, fmtRelative } from '../../lib/dates';
import type { Checkin, Photo } from '../../lib/types';
import { clientName, ErrorBox, Loading } from '../../components/ui';
import { PhotoTile } from '../../components/PhotoTile';

type Tab = 'review' | 'due' | 'overdue' | 'reviewed';

export function Checkins() {
  const { practice } = usePractitioner();
  const [tab, setTab] = useState<Tab>('review');
  const { data, error, loading } = useLoad(async () => {
    const [rows, cks] = await Promise.all([
      loadClientRows(practice),
      supabase.from('checkins').select('*').eq('practice_id', practice.id).order('submitted_at', { ascending: false }).limit(200),
    ]);
    const checkins = must(cks) as Checkin[];
    const photos = must(await supabase.from('photos').select('*').in('checkin_id', checkins.map((c) => c.id).slice(0, 200))) as Photo[];
    const urls = await photoUrls(photos.filter((p) => checkins.find((c) => c.id === p.checkin_id && !c.reviewed_at)).map((p) => p.storage_path));
    return { rows, checkins, photos, urls };
  }, [practice.id]);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} />;
  const byClient = new Map(data.rows.map((r) => [r.id, r]));
  const pending = data.checkins.filter((c) => !c.reviewed_at && byClient.has(c.client_id));
  const reviewed = data.checkins.filter((c) => c.reviewed_at && byClient.has(c.client_id)).slice(0, 40);
  const due = data.rows.filter((r) => r.status === 'due-soon');
  const overdue = data.rows.filter((r) => r.status === 'overdue' || r.status === 'quiet');
  const cadence = practice.checkin_every_days === 30 ? 'monthly' : `every ${practice.checkin_every_days} days`;

  return (
    <>
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1>Check-ins</h1>
          <div className="muted">Clients send photos and answers. You review and respond here.</div>
        </div>
        <div className="card tight small muted">Default: {cadence}{practice.send_reminders ? ' · reminders on' : ''} · <Link to="/app/settings">Change</Link></div>
      </div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'review'} onClick={() => setTab('review')}>Needs review · {pending.length}</button>
        <button role="tab" aria-selected={tab === 'due'} onClick={() => setTab('due')}>Due this week · {due.length}</button>
        <button role="tab" aria-selected={tab === 'overdue'} onClick={() => setTab('overdue')}>Overdue · {overdue.length}</button>
        <button role="tab" aria-selected={tab === 'reviewed'} onClick={() => setTab('reviewed')}>Reviewed</button>
      </div>

      {tab === 'review' && (pending.length === 0 ? <div className="card empty">You’re all caught up.</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {pending.map((c) => <CheckinCard key={c.id} ck={c} row={byClient.get(c.client_id)!} photos={data.photos.filter((p) => p.checkin_id === c.id)} urls={data.urls} />)}
        </div>
      ))}
      {(tab === 'due' || tab === 'overdue') && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Client</th><th>Phase</th><th>Last check-in</th><th>Due</th><th></th></tr></thead>
            <tbody>
              {(tab === 'due' ? due : overdue).map((r) => (
                <tr key={r.id}>
                  <td><Link to={`/app/clients/${r.id}`} style={{ fontWeight: 600 }}>{clientName(r)}</Link></td>
                  <td>{phaseLabel(r.phase, r.phase_started_on)}</td>
                  <td>{r.lastCheckin ? fmtRelative(r.lastCheckin.submitted_at) : 'None yet'}</td>
                  <td>{fmtDue(r.next_checkin_on)}</td>
                  <td><Link className="btn" to={`/app/messages/${r.id}`}>Message</Link></td>
                </tr>
              ))}
              {(tab === 'due' ? due : overdue).length === 0 && <tr><td colSpan={5} className="muted">Nobody here right now.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {tab === 'reviewed' && (
        <div className="card list">
          {reviewed.length === 0 && <div className="empty">Nothing reviewed yet.</div>}
          {reviewed.map((c) => {
            const r = byClient.get(c.client_id)!;
            return (
              <div key={c.id} className="between">
                <div><Link to={`/app/clients/${r.id}`} style={{ fontWeight: 600 }}>{clientName(r)}</Link><div className="small muted">Sent {fmtRelative(c.submitted_at)} · reviewed {fmtRelative(c.reviewed_at!)}</div></div>
                {c.response && <div className="small muted" style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.response}</div>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function CheckinCard({ ck, row, photos, urls }: { ck: Checkin; row: ClientRow; photos: Photo[]; urls: Record<string, string> }) {
  const flags = [...ck.reactions];
  if (photos.length < 3) flags.push(`${3 - photos.length} photo${photos.length === 2 ? '' : 's'} missing`);
  return (
    <article className="card stack">
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div><div style={{ fontWeight: 600 }}>{clientName(row)}</div><div className="small muted">{phaseLabel(row.phase, row.phase_started_on)} · {fmtRelative(ck.submitted_at)}</div></div>
        <span className={`tag ${flags.length ? 'warn' : ''}`}>{ck.reactions.length ? 'Reaction' : flags.length ? 'Missing photo' : 'On track'}</span>
      </div>
      <div className="photos-3">
        {(['front', 'left', 'right'] as const).map((a) => {
          const p = photos.find((x) => x.angle === a);
          return <PhotoTile key={a} url={p ? urls[p.storage_path] : null} path={p && !urls[p.storage_path] ? p.storage_path : null} />;
        })}
      </div>
      <div className="small">
        {[ck.nights_followed && `Routine ${ck.nights_followed.replace('-', '–')} nights`, ck.concern_change && `concern ${ck.concern_change}`, ck.reactions.length ? ck.reactions.join(', ').toLowerCase() : 'no reactions'].filter(Boolean).join(' · ')}
      </div>
      <Link to={`/app/clients/${row.id}`} className="btn primary" style={{ alignSelf: 'flex-start' }}>Review &amp; respond</Link>
    </article>
  );
}
