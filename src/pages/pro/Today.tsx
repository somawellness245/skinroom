import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, must, photoUrls } from '../../lib/supabase';
import { usePractitioner } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { loadClientRows, loadPhases, loadTemplates, phaseLabel, reordersFor } from '../../lib/queries';
import { daysSince, fmtDate, fmtDue, fmtRelative, parseDate, today } from '../../lib/dates';
import type { Checkin, Photo, Product, RegimenStep } from '../../lib/types';
import { clientName, ErrorBox, initials, Loading } from '../../components/ui';
import { PhotoTile } from '../../components/PhotoTile';
import { AddClient } from '../../components/AddClient';

export function Today() {
  const { practice } = usePractitioner();
  const [adding, setAdding] = useState(false);
  const [nudged, setNudged] = useState<Set<string>>(new Set());
  const { data, error, loading, reload } = useLoad(async () => {
    const [rows, pending, steps, products, phases, templates] = await Promise.all([
      loadClientRows(practice),
      supabase.from('checkins').select('*').eq('practice_id', practice.id).is('reviewed_at', null).order('submitted_at', { ascending: false }).limit(20),
      supabase.from('regimen_steps').select('*').eq('practice_id', practice.id).not('product_id', 'is', null),
      supabase.from('products').select('*').eq('practice_id', practice.id),
      loadPhases(practice.id),
      loadTemplates(practice.id),
    ]);
    const checkins = must(pending) as Checkin[];
    const photos = checkins.length ? must(await supabase.from('photos').select('*').in('checkin_id', checkins.map((c) => c.id))) as Photo[] : [];
    const urls = await photoUrls(photos.map((p) => p.storage_path));
    return { rows, checkins, photos, urls, steps: must(steps) as RegimenStep[], products: must(products) as Product[], phases, templates };
  }, [practice.id]);

  async function nudge(clientId: string, first: string) {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const { error } = await supabase.from('messages').insert({
      client_id: clientId, practice_id: practice.id, sender_role: 'practitioner', sender_user_id: uid,
      body: `Hi ${first}, checking in on you! When you get a minute, send me a quick check-in with your photos so I can see how your skin is doing.`,
    });
    if (!error) setNudged(new Set([...nudged, clientId]));
  }

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} />;

  const byId = new Map(data.rows.map((r) => [r.id, r]));
  const toReview = data.checkins.filter((c) => byId.has(c.client_id));
  const dueThisWeek = data.rows.filter((r) => r.status === 'due-soon').sort((a, b) => (a.next_checkin_on ?? '').localeCompare(b.next_checkin_on ?? ''));
  const quiet = data.rows.filter((r) => r.status === 'quiet' || r.status === 'overdue');
  const reorders = reordersFor(data.steps.filter((s) => byId.has(s.client_id)), data.products, 14);
  const greeting = parseDate(today()).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  if (data.rows.length === 0) {
    return (
      <>
        <div><div className="muted small">{greeting}</div><h1>Welcome to your Skinroom</h1></div>
        <section className="card stack-lg">
          <h2>Get set up in three steps</h2>
          <ol className="stack" style={{ margin: 0, paddingLeft: 20 }}>
            <li><Link to="/app/settings">Add your logo and brand color</Link> so clients see your practice, not ours.</li>
            <li><Link to="/app/templates">Check your plan template.</Link> We started you with Reset → Prep → Correct → Maintain. Edit it to match how you work.</li>
            <li><Link to="/app/products">Add the products you recommend</Link> and how long each lasts, so reorder reminders work.</li>
          </ol>
          <div><button className="btn primary lg" onClick={() => setAdding(true)}>Add your first client</button></div>
        </section>
        {adding && <AddClient practice={practice} templates={data.templates} phases={data.phases} onClose={() => setAdding(false)} onAdded={reload} />}
      </>
    );
  }

  return (
    <>
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div><div className="muted small">{greeting}</div><h1>Your virtual treatment room</h1></div>
        <button className="btn primary" onClick={() => setAdding(true)}>+ New client</button>
      </div>

      <div className="stats">
        <Link to="/app/checkins" className="card stat" style={{ textDecoration: 'none', color: 'inherit' }}><div className="l">Check-ins to review</div><div className="n" style={{ color: 'var(--accent)' }}>{toReview.length}</div><div className="small muted">Photos + answers waiting</div></Link>
        <div className="card stat"><div className="l">Due this week</div><div className="n">{dueThisWeek.length}</div><div className="small muted">{practice.send_reminders ? 'Reminders go out automatically' : 'Reminders are off'}</div></div>
        <div className={`card stat ${quiet.length ? 'warn' : ''}`}><div className="l" style={quiet.length ? { color: 'inherit' } : undefined}>Gone quiet / overdue</div><div className="n">{quiet.length}</div><div className="small" style={{ opacity: 0.85 }}>No check-in in {practice.quiet_after_days}+ days or past due</div></div>
        <div className="card stat"><div className="l">Reorders coming up</div><div className="n">{reorders.length}</div><div className="small muted">Within the next 14 days</div></div>
      </div>

      <div className="two-col">
        <section className="main">
          <div className="between"><h2>Waiting for your review</h2><Link to="/app/checkins" className="small" style={{ fontWeight: 600 }}>See all check-ins</Link></div>
          {toReview.length === 0 && <div className="card empty">You’re all caught up.</div>}
          {toReview.slice(0, 5).map((ck, i) => {
            const r = byId.get(ck.client_id)!;
            const ps = data.photos.filter((p) => p.checkin_id === ck.id);
            return (
              <article key={ck.id} className="card stack">
                <div className="between" style={{ alignItems: 'flex-start' }}>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <span className="avatar">{initials(r.first_name, r.last_name)}</span>
                    <div><div style={{ fontWeight: 600 }}>{clientName(r)}</div><div className="small muted">{[phaseLabel(r.phase, r.phase_started_on), r.main_concern, r.location].filter(Boolean).join(' · ')}</div></div>
                  </div>
                  <span className="small muted">Sent {fmtRelative(ck.submitted_at)}</span>
                </div>
                {i === 0 && (
                  <div className="photos-3">
                    {(['front', 'left', 'right'] as const).map((a) => {
                      const p = ps.find((x) => x.angle === a);
                      return <PhotoTile key={a} url={p ? data.urls[p.storage_path] : null} label={a[0].toUpperCase() + a.slice(1)} />;
                    })}
                  </div>
                )}
                {ck.note && <div className="card tight pre" style={{ background: 'var(--ground)', border: 0, fontSize: 14 }}><strong>{r.first_name}:</strong> {ck.note}</div>}
                <div className="row" style={{ gap: 6 }}>
                  {ck.reactions.length > 0 && <span className="tag warn">Reported: {ck.reactions.join(', ').toLowerCase()}</span>}
                  {ck.nights_followed && <span className="tag">Routine {ck.nights_followed.replace('-', '–')} of 7 nights</span>}
                  {ck.concern_change && <span className="tag plain">Concern {ck.concern_change}</span>}
                  {ps.length < 3 && <span className="tag warn">{3 - ps.length} photo{ps.length === 2 ? '' : 's'} missing</span>}
                </div>
                <div><Link to={`/app/clients/${r.id}`} className="btn primary">Review &amp; respond</Link></div>
              </article>
            );
          })}
        </section>

        <aside className="side">
          <section className="card">
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>Check-ins due this week</h2>
            {dueThisWeek.length === 0 ? <p className="muted small" style={{ margin: 0 }}>None this week.</p> : (
              <div className="list">
                {dueThisWeek.map((r) => (
                  <div key={r.id} className="between"><Link to={`/app/clients/${r.id}`} style={{ color: 'var(--ink)' }}>{clientName(r)}</Link><span className="small muted">{fmtDue(r.next_checkin_on)}</span></div>
                ))}
              </div>
            )}
          </section>

          {quiet.length > 0 && (
            <section className="card warn stack">
              <div><h2 style={{ fontSize: 18 }}>Gone quiet</h2><p className="small" style={{ margin: '4px 0 0' }}>These clients haven’t checked in. One tap sends a personal nudge.</p></div>
              {quiet.map((r) => (
                <div key={r.id} className="between">
                  <Link to={`/app/clients/${r.id}`} style={{ color: 'inherit' }}>{clientName(r)} · {r.lastCheckin ? `${daysSince(r.lastCheckin.submitted_at.slice(0, 10))} days` : 'no check-ins yet'}</Link>
                  {nudged.has(r.id) ? <span className="small">Sent</span> : <button className="btn warn" onClick={() => nudge(r.id, r.first_name)}>Nudge</button>}
                </div>
              ))}
            </section>
          )}

          <section className="card">
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>Reorders coming up</h2>
            {reorders.length === 0 ? <p className="muted small" style={{ margin: 0 }}>Nothing running low. Set how long products last on your <Link to="/app/products">product shelf</Link>.</p> : (
              <div className="list">
                {reorders.map((ro) => (
                  <div key={`${ro.step.client_id}-${ro.product.id}`}>
                    <Link to={`/app/clients/${ro.step.client_id}`} style={{ color: 'var(--ink)' }}>{clientName(byId.get(ro.step.client_id)!)}</Link>
                    <div className="small muted">{ro.product.name} · {ro.daysLeft <= 0 ? 'likely out now' : `runs out ~${fmtDate(ro.runsOutOn)}`}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
      {adding && <AddClient practice={practice} templates={data.templates} phases={data.phases} onClose={() => setAdding(false)} onAdded={reload} />}
    </>
  );
}
