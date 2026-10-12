import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { usePractitioner, useSession } from '../../lib/session';
import { ErrorBox } from '../../components/ui';

const SWATCHES = ['#1E5C57', '#3B3F7A', '#7A3A14', '#5B2A4E', '#2F4A2B', '#17201F'];

export function Settings() {
  const { practice, role, refresh } = usePractitioner();
  const { session } = useSession();
  const [f, setF] = useState({
    name: practice.name,
    brand_color: practice.brand_color,
    checkin_every_days: practice.checkin_every_days,
    quiet_after_days: practice.quiet_after_days,
    send_reminders: practice.send_reminders,
    booking_url: practice.booking_url ?? '',
    shop_url: practice.shop_url ?? '',
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const isOwner = role === 'owner';

  useEffect(() => {
    if (location.hash === '#plan') document.getElementById('plan')?.scrollIntoView();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!/^#[0-9a-f]{6}$/i.test(f.brand_color)) return setError('Brand color needs to be a 6-digit hex like #1E5C57.');
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('practices').update({
      ...f,
      name: f.name.trim(),
      booking_url: cleanUrl(f.booking_url),
      shop_url: cleanUrl(f.shop_url),
    }).eq('id', practice.id);
    setBusy(false);
    if (error) return setError(error.message);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    await refresh();
  }

  async function uploadLogo(file: File) {
    if (file.size > 2 * 1024 * 1024) return setError('Logo needs to be under 2 MB.');
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `${practice.id}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('branding').upload(path, file, { contentType: file.type });
    if (error) return setError(error.message);
    const url = supabase.storage.from('branding').getPublicUrl(path).data.publicUrl;
    const { error: uErr } = await supabase.from('practices').update({ logo_url: url }).eq('id', practice.id);
    if (uErr) return setError(uErr.message);
    await refresh();
  }

  async function billing(kind: 'checkout' | 'portal') {
    setBillingBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/${kind}`, { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}` } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) throw new Error(body.error || 'Billing isn’t set up yet.');
      window.location.href = body.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBillingBusy(false);
    }
  }

  const trialDays = Math.ceil((new Date(practice.trial_ends_at).getTime() - Date.now()) / 86400000);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });

  return (
    <>
      <div className="between">
        <h1>Branding &amp; settings</h1>
        {saved && <span className="tag">Saved</span>}
      </div>
      <ErrorBox error={error} />
      {!isOwner && <div className="notice">Only the practice owner can change these settings.</div>}
      <form className="two-col" onSubmit={save}>
        <div className="main">
          <section className="card stack">
            <h2>Your brand</h2>
            <p className="small muted" style={{ margin: 0 }}>Clients see your name, logo, and color. Skinroom stays in the background.</p>
            <label className="field"><span>Practice name</span><input required value={f.name} onChange={(e) => set('name', e.target.value)} disabled={!isOwner} /></label>
            <div className="field">
              <span>Logo</span>
              <div className="row">
                {practice.logo_url
                  ? <img src={practice.logo_url} alt="Current logo" style={{ width: 64, height: 64, objectFit: 'contain', border: '1px solid var(--line)', borderRadius: 12 }} />
                  : <div style={{ width: 64, height: 64, border: '1px dashed #B9C4C1', borderRadius: 12 }} className="row small muted">&nbsp;Logo</div>}
                <label className="btn" style={{ cursor: isOwner ? 'pointer' : 'default' }}>
                  Upload logo
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="sr" disabled={!isOwner}
                    onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
                </label>
              </div>
            </div>
            <div className="field">
              <span>Brand color</span>
              <div className="row">
                {SWATCHES.map((c) => (
                  <button key={c} type="button" aria-label={`Use ${c}`} aria-pressed={f.brand_color.toLowerCase() === c.toLowerCase()} disabled={!isOwner}
                    onClick={() => set('brand_color', c)}
                    style={{ width: 44, height: 44, borderRadius: 999, background: c, border: '2px solid #fff', cursor: 'pointer',
                      boxShadow: f.brand_color.toLowerCase() === c.toLowerCase() ? '0 0 0 2px var(--ink)' : '0 0 0 1px var(--line)' }} />
                ))}
                <label className="row small"><span className="muted">Custom</span>
                  <input className="input" style={{ width: 120 }} value={f.brand_color} onChange={(e) => set('brand_color', e.target.value)} disabled={!isOwner} />
                </label>
              </div>
            </div>
          </section>

          <section className="card stack">
            <h2>Check-ins &amp; reminders</h2>
            <div className="form-grid">
              <label className="field"><span>Default check-in frequency</span>
                <select value={f.checkin_every_days} onChange={(e) => set('checkin_every_days', Number(e.target.value))} disabled={!isOwner}>
                  <option value={14}>Every 2 weeks</option><option value={30}>Monthly</option><option value={42}>Every 6 weeks</option><option value={60}>Every 2 months</option>
                </select>
              </label>
              <label className="field"><span>Flag “gone quiet” after</span>
                <select value={f.quiet_after_days} onChange={(e) => set('quiet_after_days', Number(e.target.value))} disabled={!isOwner}>
                  <option value={30}>30 days</option><option value={45}>45 days</option><option value={60}>60 days</option><option value={90}>90 days</option>
                </select>
              </label>
            </div>
            <p className="small muted" style={{ margin: 0 }}>Each phase in your plan templates can have its own check-in timing. This is used when a phase doesn’t set one.</p>
            <label className="check"><input type="checkbox" checked={f.send_reminders} onChange={(e) => set('send_reminders', e.target.checked)} disabled={!isOwner} /> Remind clients before their check-in is due</label>
          </section>

          <section className="card stack">
            <h2>Links</h2>
            <label className="field"><span>Booking link</span><input type="url" placeholder="https://… (Acuity, Vagaro, Square, Calendly)" value={f.booking_url} onChange={(e) => set('booking_url', e.target.value)} disabled={!isOwner} /></label>
            <label className="field"><span>Shop link (for reorders)</span><input type="url" placeholder="https://… your online shop" value={f.shop_url} onChange={(e) => set('shop_url', e.target.value)} disabled={!isOwner} /></label>
          </section>
          {isOwner && <div><button className="btn primary lg" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>}
        </div>

        <aside className="side">
          <section className="card stack" style={{ alignItems: 'center' }}>
            <span className="small" style={{ fontWeight: 600, alignSelf: 'flex-start' }}>Client app preview</span>
            <div style={{ width: 220, border: '8px solid var(--ink)', borderRadius: 28, overflow: 'hidden', background: 'var(--ground)' }}>
              <div style={{ padding: 12, background: '#fff', fontWeight: 700, fontSize: 13 }}>{f.name || 'Your practice'}<div style={{ fontSize: 10, fontWeight: 400, color: 'var(--muted)' }}>Powered by Skinroom</div></div>
              <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ background: /^#[0-9a-f]{6}$/i.test(f.brand_color) ? f.brand_color : 'var(--accent)', color: '#fff', borderRadius: 10, padding: 10, fontSize: 12, fontWeight: 600 }}>Correct · month 2</div>
                <div style={{ background: '#fff', borderRadius: 10, height: 48 }} />
                <div style={{ background: '#fff', borderRadius: 10, height: 72 }} />
              </div>
            </div>
          </section>
          <section className="card stack" id="plan">
            <h2>Your plan</h2>
            {practice.subscription_status === 'active' ? (
              <div><div style={{ fontWeight: 600 }}>Founding member</div><div className="small muted">Active · unlimited clients</div></div>
            ) : practice.subscription_status === 'trialing' ? (
              <div><div style={{ fontWeight: 600 }}>Free trial</div><div className="small muted">{trialDays > 0 ? `${trialDays} days left` : 'Trial ended'}</div></div>
            ) : (
              <div><div style={{ fontWeight: 600, color: 'var(--warn)' }}>{practice.subscription_status === 'past_due' ? 'Payment failed' : 'Subscription ended'}</div><div className="small muted">Update billing to keep using Skinroom.</div></div>
            )}
            {isOwner && (practice.subscription_status === 'active' || practice.subscription_status === 'past_due'
              ? <button type="button" className="btn" disabled={billingBusy} onClick={() => billing('portal')}>Manage billing</button>
              : <button type="button" className="btn primary" disabled={billingBusy} onClick={() => billing('checkout')}>Start subscription</button>)}
          </section>
        </aside>
      </form>
    </>
  );
}

function cleanUrl(u: string): string | null {
  const t = u.trim();
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}
