import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/session';
import { ErrorBox, Mark } from '../../components/ui';

/** Shown to a signed-in person who isn't an esthetician or a client yet. */
export function SetupPractice() {
  const { session, refresh, signOut } = useSession();
  const nav = useNavigate();
  const meta = (session?.user.user_metadata ?? {}) as { practice_name?: string; display_name?: string };
  const [practice, setPractice] = useState(meta.practice_name ?? '');
  const [name, setName] = useState(meta.display_name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.rpc('create_practice', { practice_name: practice.trim(), owner_name: name.trim() || null });
    setBusy(false);
    if (error) return setError(error.message);
    await refresh();
    nav('/app', { replace: true });
  }

  return (
    <div className="auth">
      <div className="card stack-lg">
        <div className="row"><Mark /><span className="brand-name">Skinroom</span></div>
        <div className="stack" style={{ gap: 4 }}>
          <h1 style={{ fontSize: 26 }}>Set up your practice</h1>
          <p className="muted" style={{ margin: 0 }}>You can change any of this later in Branding &amp; settings.</p>
        </div>
        <form className="stack" onSubmit={submit}>
          <ErrorBox error={error} />
          <label className="field"><span>Your name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="field"><span>Practice name</span><input required value={practice} onChange={(e) => setPractice(e.target.value)} /></label>
          <button className="btn primary lg" disabled={busy}>{busy ? 'Setting up…' : 'Open my Skinroom'}</button>
        </form>
        <p className="small muted" style={{ margin: 0 }}>
          Are you a client? Open the invite link your esthetician sent you. <Link to="/login" onClick={() => signOut()}>Use a different account</Link>
        </p>
      </div>
    </div>
  );
}
