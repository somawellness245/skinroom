import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePractitioner } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { loadClientRows, loadPhases, loadTemplates, phaseLabel, STATUS_LABEL, type ClientRow } from '../../lib/queries';
import { fmtDue, fmtRelative } from '../../lib/dates';
import { clientName, ErrorBox, Loading } from '../../components/ui';
import { AddClient } from '../../components/AddClient';

export function Clients() {
  const { practice } = usePractitioner();
  const { data, error, loading, reload } = useLoad(async () => {
    const [rows, phases, templates] = await Promise.all([loadClientRows(practice), loadPhases(practice.id), loadTemplates(practice.id)]);
    return { rows, phases, templates };
  }, [practice.id]);
  const [filter, setFilter] = useState<string>('all');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);

  const phaseNames = useMemo(() => [...new Set((data?.phases ?? []).map((p) => p.name))], [data]);
  const rows = useMemo(() => {
    let r = data?.rows ?? [];
    if (filter === 'quiet') r = r.filter((c) => c.status === 'quiet');
    else if (filter === 'not-joined') r = r.filter((c) => c.status === 'not-joined');
    else if (filter !== 'all') r = r.filter((c) => c.phase?.name === filter);
    const s = q.trim().toLowerCase();
    if (s) r = r.filter((c) => `${c.first_name} ${c.last_name ?? ''} ${c.main_concern ?? ''} ${c.location ?? ''}`.toLowerCase().includes(s));
    return r;
  }, [data, filter, q]);

  const count = (fn: (c: ClientRow) => boolean) => (data?.rows ?? []).filter(fn).length;

  return (
    <>
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1>Clients</h1>
          {data && <div className="muted">{count((c) => !!c.user_id)} active · {count((c) => !c.user_id)} invited, not signed up yet</div>}
        </div>
        <div className="row">
          <label className="sr" htmlFor="client-search">Search clients</label>
          <input id="client-search" className="input" style={{ width: 260 }} type="search" placeholder="Search by name or concern" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn primary" onClick={() => setAdding(true)} disabled={!data}>+ New client</button>
        </div>
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : data && (
        <>
          <div className="row" role="group" aria-label="Filter clients">
            <button className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All · {data.rows.length}</button>
            {phaseNames.map((n) => (
              <button key={n} className="chip" aria-pressed={filter === n} onClick={() => setFilter(n)}>{n} · {count((c) => c.phase?.name === n)}</button>
            ))}
            <button className="chip warn" aria-pressed={filter === 'quiet'} onClick={() => setFilter('quiet')}>Gone quiet · {count((c) => c.status === 'quiet')}</button>
            <button className="chip" aria-pressed={filter === 'not-joined'} onClick={() => setFilter('not-joined')}>Not joined · {count((c) => c.status === 'not-joined')}</button>
          </div>
          {data.rows.length === 0 ? (
            <div className="card empty">
              <p>No clients yet. Add your first one and send them their invite link.</p>
              <button className="btn primary" onClick={() => setAdding(true)}>+ New client</button>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Client</th><th>Main concern</th><th>Phase</th><th>Last check-in</th><th>Next check-in</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td><Link to={`/app/clients/${c.id}`} style={{ fontWeight: 600 }}>{clientName(c)}</Link>{c.location && <div className="small muted">{c.location}</div>}</td>
                      <td>{c.main_concern ?? <span className="muted">—</span>}</td>
                      <td>{phaseLabel(c.phase, c.phase_started_on)}</td>
                      <td>{c.lastCheckin ? fmtRelative(c.lastCheckin.submitted_at) : <span className="muted">None yet</span>}</td>
                      <td>{c.user_id ? fmtDue(c.next_checkin_on) : <span className="muted">—</span>}</td>
                      <td><span className={`tag ${c.status === 'quiet' || c.status === 'overdue' ? 'warn' : c.status === 'on-track' || c.status === 'needs-review' ? '' : 'plain'}`}>{STATUS_LABEL[c.status]}</span></td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={6} className="muted">No clients match.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {adding && data && (
        <AddClient practice={practice} templates={data.templates} phases={data.phases} onClose={() => setAdding(false)} onAdded={reload} />
      )}
    </>
  );
}
