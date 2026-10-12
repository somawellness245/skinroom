import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useClientSelf } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { reordersFor } from '../../lib/queries';
import { daysBetween, fmtDate, fmtRelative, today } from '../../lib/dates';
import { ErrorBox, Icon, Loading, PhaseBar } from '../../components/ui';
import { PhotoTile } from '../../components/PhotoTile';
import { currentTimeOfDay, loadClientWorld } from './data';

export function ClientHome() {
  const { client, practice } = useClientSelf();
  const { data, error, loading, reload } = useLoad(() => loadClientWorld(client), [client.id]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const tod = currentTimeOfDay();

  useEffect(() => {
    supabase.from('routine_checks').select('step_id').eq('client_id', client.id).eq('on_date', today())
      .then(({ data }) => setChecked(new Set((data ?? []).map((r) => r.step_id as string))));
  }, [client.id]);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} />;

  const phase = data.phases.find((p) => p.id === client.current_phase_id) ?? null;
  const steps = data.steps.filter((s) => s.time_of_day === tod).sort((a, b) => a.position - b.position);
  const reorders = reordersFor(data.steps, data.products, 10);
  const dueIn = client.next_checkin_on ? daysBetween(today(), client.next_checkin_on) : null;
  const checkinDue = dueIn !== null && dueIn <= 3;
  const lastCk = data.checkins[0];
  const sentThisCycle = lastCk && daysBetween(lastCk.submitted_at.slice(0, 10), today()) < 7;
  const baseline = data.photos.find((p) => p.kind === 'baseline' && p.angle === 'front') ?? data.photos.find((p) => p.angle === 'front');
  const latest = [...data.photos].reverse().find((p) => p.kind === 'checkin' && p.angle === 'front');

  async function toggle(stepId: string) {
    const next = new Set(checked);
    if (next.has(stepId)) {
      next.delete(stepId);
      await supabase.from('routine_checks').delete().eq('step_id', stepId).eq('on_date', today());
    } else {
      next.add(stepId);
      await supabase.from('routine_checks').upsert({ client_id: client.id, step_id: stepId, on_date: today() });
    }
    setChecked(next);
  }

  async function reordered(stepId: string) {
    await supabase.rpc('mark_reordered', { step: stepId });
    await reload();
  }

  return (
    <>
      <h1 style={{ fontSize: 26 }}>Hi {client.first_name}</h1>

      {phase ? (
        <section className="card accent stack">
          <div className="small" style={{ opacity: 0.9 }}>Your plan</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 700 }}>
            {phase.name} · phase {phase.position} of {data.phases.length}
          </div>
          <PhaseBar phases={data.phases} currentId={phase.id} compact onDark />
          {(client.goal || phase.description) && <div style={{ fontSize: 14 }}>{client.goal ? `Focus: ${client.goal}` : phase.description}</div>}
        </section>
      ) : (
        <section className="card"><p style={{ margin: 0 }}>Your esthetician is putting your plan together.</p></section>
      )}

      {sentThisCycle && !lastCk.reviewed_at ? (
        <div className="card tight row"><Icon name="check" /> Check-in sent {fmtRelative(lastCk.submitted_at)}. Your esthetician will review it.</div>
      ) : checkinDue ? (
        <Link to="/me/checkin" className="card warn between" style={{ textDecoration: 'none' }}>
          <span>
            <span style={{ display: 'block', fontWeight: 700 }}>{dueIn! < 0 ? 'Check-in overdue' : dueIn === 0 ? 'Check-in due today' : `Check-in due ${fmtDate(client.next_checkin_on)}`}</span>
            <span className="small">3 photos + 4 quick questions · about 5 min</span>
          </span>
          <strong>Start →</strong>
        </Link>
      ) : (
        <div className="between small muted">
          <span>Next check-in: {fmtDate(client.next_checkin_on, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          <Link to="/me/checkin">Check in early</Link>
        </div>
      )}

      {data.lastNote && (
        <section className="card stack" style={{ gap: 6 }}>
          <div className="between"><h3>From your esthetician</h3><span className="small muted">{fmtDate(data.lastNote.created_at)}</span></div>
          <p className="pre" style={{ margin: 0, fontSize: 14 }}>{data.lastNote.body}</p>
          <Link to="/me/messages" className="small">Reply</Link>
        </section>
      )}

      <section className="card stack" style={{ gap: 4 }}>
        <div className="between"><h3>{tod === 'am' ? 'This morning' : 'Tonight'}</h3><Link to="/me/routine" className="small">Full routine</Link></div>
        {steps.length === 0 ? <p className="muted small" style={{ margin: 0 }}>Your routine will show up here once it’s set.</p> : steps.map((s) => (
          <label key={s.id} className="check">
            <input type="checkbox" checked={checked.has(s.id)} onChange={() => toggle(s.id)} />
            <span>{s.label}{s.instructions && <span className="muted"> · {s.instructions}</span>}{s.frequency && <span className="muted"> · {s.frequency}</span>}</span>
          </label>
        ))}
      </section>

      {(baseline || latest) && (
        <section className="card stack">
          <div className="between"><h3>Your progress</h3><Link to="/me/progress" className="small">All photos</Link></div>
          <div className="photos-2">
            <figure style={{ margin: 0 }}><PhotoTile path={baseline?.storage_path} /><figcaption className="small muted">Start · {fmtDate(baseline?.taken_on)}</figcaption></figure>
            <figure style={{ margin: 0 }}><PhotoTile path={latest?.storage_path} /><figcaption className="small muted">{latest ? `Latest · ${fmtDate(latest.taken_on)}` : 'After your first check-in'}</figcaption></figure>
          </div>
        </section>
      )}

      {reorders.map((r) => (
        <section key={r.step.id} className="card between">
          <div>
            <div style={{ fontWeight: 700 }}>{r.daysLeft <= 0 ? 'Probably out by now' : 'Running low soon'}</div>
            <div className="small muted">{r.product.name} · {r.daysLeft <= 0 ? 'time to restock' : `about ${r.daysLeft} days left`}</div>
          </div>
          <div className="row">
            {(r.product.shop_url || practice.shop_url) && <a className="btn soft" href={r.product.shop_url || practice.shop_url!} target="_blank" rel="noreferrer">Reorder</a>}
            <button className="btn link small" onClick={() => reordered(r.step.id)}>I restocked</button>
          </div>
        </section>
      ))}

      {data.lessons.length > 0 && (
        <section className="card stack" style={{ gap: 4 }}>
          <h3>For this phase</h3>
          {data.lessons.slice(0, 4).map((l) => (
            <Link key={l.id} to={`/me/learn/${l.id}`} className="between" style={{ minHeight: 44, textDecoration: 'none', color: 'var(--ink)' }}>
              <span>{l.title}</span><span className="small muted">{l.read_minutes ? `${l.read_minutes} min` : ''} →</span>
            </Link>
          ))}
        </section>
      )}

      {practice.booking_url && <a className="btn block" href={practice.booking_url} target="_blank" rel="noreferrer">Book a session</a>}
    </>
  );
}
