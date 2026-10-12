import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/session';
import { ErrorBox, Loading, useBrand } from '../../components/ui';

type Preview = { practice_name: string; logo_url: string | null; brand_color: string; client_first_name: string; claimed: boolean };

/** Where a client lands from their esthetician's invite link. */
export function Invite() {
  const { code = '' } = useParams();
  const nav = useNavigate();
  const { who, session, refresh } = useSession();
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined);
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  useBrand(preview ?? undefined);

  useEffect(() => {
    supabase.rpc('invite_preview', { code }).then(({ data }) => setPreview((data?.[0] as Preview) ?? null));
  }, [code]);

  async function claim() {
    setBusy(true);
    const { error } = await supabase.rpc('claim_invite', { code });
    setBusy(false);
    if (error) return setError(error.message);
    await refresh();
    nav('/me', { replace: true });
  }

  // Signed in already (e.g. returning from the email confirmation link): link the account.
  useEffect(() => {
    if (session && preview && who.kind !== 'loading' && who.kind !== 'practitioner') {
      if (who.kind === 'client' && preview.claimed) { nav('/me', { replace: true }); return; }
      if (!preview.claimed) claim();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, preview, who.kind]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === 'signup' && password.length < 8) return setError('Use at least 8 characters for your password.');
    setBusy(true);
    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { emailRedirectTo: `${window.location.origin}/invite/${code}` },
      });
      setBusy(false);
      if (error) return setError(error.message);
      if (!data.session) setSent(true);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setBusy(false);
      if (error) return setError('That email and password don’t match.');
    }
  }

  if (preview === undefined) return <Loading />;
  if (preview === null) {
    return <div className="auth"><div className="card stack"><h1 style={{ fontSize: 24 }}>This link isn’t valid</h1><p className="muted">Ask your esthetician to send you a new invite link.</p></div></div>;
  }

  return (
    <div className="auth">
      <div className="card stack-lg">
        <div className="row">
          {preview.logo_url
            ? <img src={preview.logo_url} alt="" style={{ width: 48, height: 48, objectFit: 'contain' }} />
            : <span className="avatar" style={{ background: 'var(--accent)', color: '#fff' }}>{preview.practice_name[0]}</span>}
          <div>
            <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 20 }}>{preview.practice_name}</div>
            <div className="small muted">Powered by Skinroom</div>
          </div>
        </div>
        {who.kind === 'practitioner' ? (
          <div className="notice">You’re signed in as an esthetician. Clients should open this link on their own phone.</div>
        ) : sent ? (
          <div className="stack">
            <h1 style={{ fontSize: 24 }}>Check your email</h1>
            <p className="muted" style={{ margin: 0 }}>We sent a link to {email}. Open it on this phone to get into your skin portal.</p>
          </div>
        ) : session ? (
          <div className="stack">
            <ErrorBox error={error} />
            <button className="btn primary lg" onClick={claim} disabled={busy}>{busy ? 'Connecting…' : 'Open my portal'}</button>
          </div>
        ) : (
          <>
            <div className="stack" style={{ gap: 4 }}>
              <h1 style={{ fontSize: 24 }}>Hi {preview.client_first_name}</h1>
              <p className="muted" style={{ margin: 0 }}>
                {mode === 'signup'
                  ? 'Create a login to see your treatment plan, routine, and send your monthly check-ins.'
                  : 'Log in to connect this invite to your account.'}
              </p>
            </div>
            <form className="stack" onSubmit={submit}>
              <ErrorBox error={error} />
              <label className="field"><span>Email</span><input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <label className="field"><span>Password</span><input type="password" required autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
              <button className="btn primary lg" disabled={busy}>{busy ? 'One sec…' : mode === 'signup' ? 'Create my login' : 'Log in'}</button>
            </form>
            <button type="button" className="btn link small" onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>
              {mode === 'signup' ? 'Already have a login? Log in' : 'New here? Create a login'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
