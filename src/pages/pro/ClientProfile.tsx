import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, must } from '../../lib/supabase';
import { usePractitioner } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { loadPhases, loadTemplates } from '../../lib/queries';
import { addDays, fmtDate, today } from '../../lib/dates';
import type { Checkin, Client, Photo, Product, RegimenStep } from '../../lib/types';
import { ErrorBox, initials, Loading, Modal, PhaseBar } from '../../components/ui';
import { InviteLink } from '../../components/InviteLink';
import { CheckinReview } from './profile/CheckinReview';
import { PhotoTimeline } from './profile/PhotoTimeline';
import { RegimenEditor } from './profile/RegimenEditor';
import { PrivateNotes } from './profile/PrivateNotes';
import { ClientDetailsForm } from './profile/ClientDetailsForm';

type Tab = 'checkin' | 'photos' | 'regimen' | 'notes' | 'history';

export function ClientProfile() {
  const { id = '' } = useParams();
  const { practice } = usePractitioner();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>('checkin');
  const [editing, setEditing] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data, error, loading, reload } = useLoad(async () => {
    const [client, templates, phases, checkins, photos, steps, products] = await Promise.all([
      supabase.from('clients').select('*').eq('id', id).single(),
      loadTemplates(practice.id),
      loadPhases(practice.id),
      supabase.from('checkins').select('*').eq('client_id', id).order('submitted_at', { ascending: false }),
      supabase.from('photos').select('*').eq('client_id', id).order('taken_on', { ascending: true }),
      supabase.from('regimen_steps').select('*').eq('client_id', id).order('position'),
      supabase.from('products').select('*').eq('practice_id', practice.id).eq('active', true).order('name'),
    ]);
    return {
      client: must(client) as Client,
      templates, phases,
      checkins: must(checkins) as Checkin[],
      photos: must(photos) as Photo[],
      steps: must(steps) as RegimenStep[],
      products: must(products) as Product[],
    };
  }, [id, practice.id]);

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox error={error ?? 'Client not found'} />;
  const { client, templates, phases, checkins } = data;
  const planPhases = phases.filter((p) => p.template_id === client.plan_template_id).sort((a, b) => a.position - b.position);

  async function updateClient(patch: Partial<Client>) {
    setErr(null);
    const { error } = await supabase.from('clients').update(patch).eq('id', client.id);
    if (error) return setErr(error.message);
    await reload();
  }

  async function changeTemplate(templateId: string) {
    const first = phases.filter((p) => p.template_id === templateId).sort((a, b) => a.position - b.position)[0];
    await updateClient({ plan_template_id: templateId || null, current_phase_id: first?.id ?? null, phase_started_on: first ? today() : null });
  }

  async function changePhase(phaseId: string) {
    const phase = phases.find((p) => p.id === phaseId);
    await updateClient({ current_phase_id: phaseId, phase_started_on: today() });
    if (phase) {
      await supabase.from('messages').insert({ client_id: client.id, practice_id: practice.id, sender_role: 'system', sender_user_id: (await supabase.auth.getUser()).data.user?.id, body: `Moved to ${phase.name}` });
    }
  }

  async function archive() {
    if (!confirm(`Archive ${client.first_name}? They’ll lose access to their portal. You can’t undo this from the app yet.`)) return;
    await updateClient({ archived: true });
    nav('/app/clients');
  }

  const unreviewed = checkins.filter((c) => !c.reviewed_at).length;

  return (
    <>
      <div><Link to="/app/clients" className="small">← All clients</Link></div>
      <section className="between" style={{ alignItems: 'flex-start' }}>
        <div className="row" style={{ alignItems: 'center', gap: 16 }}>
          <span className="avatar lg">{initials(client.first_name, client.last_name)}</span>
          <div className="stack" style={{ gap: 4 }}>
            <h1>{client.first_name} {client.last_name}</h1>
            <div className="small muted">
              {[client.is_virtual ? 'Virtual client' : 'In-person client', client.location, `Started ${fmtDate(client.started_on, { month: 'short', day: 'numeric', year: 'numeric' })}`, client.fitzpatrick && `Fitzpatrick ${client.fitzpatrick}`].filter(Boolean).join(' · ')}
            </div>
            <div className="row" style={{ gap: 6 }}>
              {client.goal && <span className="tag">Goal: {client.goal}</span>}
              {client.sensitivities && <span className="tag warn">Sensitive to: {client.sensitivities}</span>}
              {!client.user_id && <span className="tag plain">Hasn’t accepted invite</span>}
            </div>
          </div>
        </div>
        <div className="row">
          {!client.user_id && <button className="btn primary" onClick={() => setInviting(true)}>Send invite link</button>}
          <Link className="btn" to={`/app/messages/${client.id}`}>Message</Link>
          <button className="btn" onClick={() => setEditing(true)}>Edit details</button>
        </div>
      </section>
      <ErrorBox error={err} />

      <section className="card stack" aria-label="Treatment plan">
        <div className="between">
          <h2>Treatment plan</h2>
          <div className="row">
            <label className="row small"><span className="muted">Plan</span>
              <select className="input" style={{ width: 'auto' }} value={client.plan_template_id ?? ''} onChange={(e) => changeTemplate(e.target.value)}>
                <option value="">No plan</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            {planPhases.length > 0 && (
              <label className="row small"><span className="muted">Phase</span>
                <select className="input" style={{ width: 'auto' }} value={client.current_phase_id ?? ''} onChange={(e) => changePhase(e.target.value)}>
                  {planPhases.map((p) => <option key={p.id} value={p.id}>{p.position}. {p.name}</option>)}
                </select>
              </label>
            )}
          </div>
        </div>
        {planPhases.length ? <PhaseBar phases={planPhases} currentId={client.current_phase_id} /> : <p className="muted" style={{ margin: 0 }}>Pick a plan to set this client’s phases.</p>}
        <div className="row small muted">
          {client.phase_started_on && <span>In this phase since {fmtDate(client.phase_started_on)}</span>}
          <span>·</span>
          <label className="row"><span>Next check-in</span>
            <input type="date" className="input" style={{ width: 'auto', minHeight: 36, padding: '4px 10px' }} value={client.next_checkin_on ?? ''}
              onChange={(e) => updateClient({ next_checkin_on: e.target.value || null })} />
          </label>
          {!client.next_checkin_on && <button className="btn link" onClick={() => updateClient({ next_checkin_on: addDays(today(), practice.checkin_every_days) })}>Schedule</button>}
        </div>
      </section>

      <div className="tabs" role="tablist" aria-label="Client sections">
        {([
          ['checkin', `Latest check-in${unreviewed ? ` (${unreviewed})` : ''}`],
          ['photos', 'Photo timeline'],
          ['regimen', 'Regimen'],
          ['notes', 'Private notes'],
          ['history', 'Check-in history'],
        ] as [Tab, string][]).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'checkin' && <CheckinReview client={client} data={data} onChanged={reload} />}
      {tab === 'photos' && <PhotoTimeline client={client} photos={data.photos} onChanged={reload} />}
      {tab === 'regimen' && <RegimenEditor client={client} steps={data.steps} products={data.products} onChanged={reload} />}
      {tab === 'notes' && <PrivateNotes client={client} />}
      {tab === 'history' && (
        <section className="card">
          {checkins.length === 0 ? <div className="empty">No check-ins yet.</div> : (
            <div className="list">
              {checkins.map((c) => (
                <div key={c.id} className="between">
                  <div>
                    <div style={{ fontWeight: 600 }}>{fmtDate(c.submitted_at, { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                    <div className="small muted">
                      {[c.nights_followed && `Routine ${c.nights_followed} nights`, c.concern_change && `Concern ${c.concern_change}`, c.reactions.length ? `Reactions: ${c.reactions.join(', ')}` : 'No reactions'].filter(Boolean).join(' · ')}
                    </div>
                    {c.response && <div className="small" style={{ marginTop: 4 }}><strong>You:</strong> {c.response}</div>}
                  </div>
                  <span className={`tag ${c.reviewed_at ? '' : 'warn'}`}>{c.reviewed_at ? 'Reviewed' : 'Needs review'}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <div><button className="btn danger" onClick={archive}>Archive client</button></div>

      {editing && <ClientDetailsForm client={client} onClose={() => setEditing(false)} onSaved={async () => { setEditing(false); await reload(); }} />}
      {inviting && (
        <Modal title={`Invite ${client.first_name}`} onClose={() => setInviting(false)}>
          <p style={{ margin: 0 }}>This link opens {client.first_name}’s portal with your branding. They create their own login.</p>
          <InviteLink client={client} practice={practice} />
        </Modal>
      )}
    </>
  );
}

