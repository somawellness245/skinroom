import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/session';
import { ErrorBox, Mark } from '../../components/ui';

function AuthCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="auth">
      <div className="card stack-lg">
        <div className="row"><Mark /><span className="brand-name">Skinroom</span></div>
        <div className="stack" style={{ gap: 4 }}>
          <h1 style={{ fontSize: 26 }}>{title}</h1>
          {sub && <p className="muted" style={{ margin: 0 }}>{sub}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Login() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { refresh } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return setError(error.message === 'Invalid login credentials' ? 'That email and password don’t match.' : error.message);
    await refresh();
    const next = params.get('next');
    nav(next && next.startsWith('/') ? next : '/', { replace: true });
  }

  return (
    <AuthCard title="Log in">
      <form className="stack" onSubmit={submit}>
        <ErrorBox error={error} />
        <label className="field"><span>Email</span><input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field"><span>Password</span><input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button className="btn primary lg" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
      <div className="between small">
        <Link to="/forgot">Forgot password?</Link>
        <span className="muted">Esthetician? <Link to="/signup">Create your Skinroom</Link></span>
      </div>
    </AuthCard>
  );
}

export function Signup() {
  const nav = useNavigate();
  const { refresh } = useSession();
  const [form, setForm] = useState({ name: '', practice: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.password.length < 8) return setError('Use at least 8 characters for your password.');
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/setup`,
        data: { display_name: form.name.trim(), practice_name: form.practice.trim() },
      },
    });
    if (error) { setBusy(false); return setError(error.message); }
    if (!data.session) { setBusy(false); return setSent(true); }
    const { error: pErr } = await supabase.rpc('create_practice', { practice_name: form.practice.trim(), owner_name: form.name.trim() });
    setBusy(false);
    if (pErr) return setError(pErr.message);
    await refresh();
    nav('/app', { replace: true });
  }

  if (sent) {
    return (
      <AuthCard title="Check your email" sub={`We sent a confirmation link to ${form.email}. Open it on this device to finish setting up ${form.practice}.`}>
        <Link to="/login" className="btn">Back to log in</Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Create your Skinroom" sub="Your virtual treatment room for client check-ins, plans, and progress photos.">
      <form className="stack" onSubmit={submit}>
        <ErrorBox error={error} />
        <label className="field"><span>Your name</span><input required autoComplete="name" value={form.name} onChange={set('name')} /></label>
        <label className="field"><span>Practice name</span><input required value={form.practice} onChange={set('practice')} placeholder="What clients will see" /></label>
        <label className="field"><span>Email</span><input type="email" required autoComplete="email" value={form.email} onChange={set('email')} /></label>
        <label className="field"><span>Password</span><input type="password" required autoComplete="new-password" minLength={8} value={form.password} onChange={set('password')} /></label>
        <button className="btn primary lg" disabled={busy}>{busy ? 'Creating…' : 'Create my Skinroom'}</button>
      </form>
      <p className="small muted" style={{ margin: 0 }}>Already have an account? <Link to="/login">Log in</Link></p>
    </AuthCard>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset` });
    if (error) return setError(error.message);
    setSent(true);
  }
  return (
    <AuthCard title="Reset your password" sub={sent ? 'If that email has an account, a reset link is on its way.' : 'We’ll email you a link to set a new one.'}>
      {!sent && (
        <form className="stack" onSubmit={submit}>
          <ErrorBox error={error} />
          <label className="field"><span>Email</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <button className="btn primary lg">Send reset link</button>
        </form>
      )}
      <Link to="/login" className="small">Back to log in</Link>
    </AuthCard>
  );
}

export function ResetPassword() {
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError('Use at least 8 characters.');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return setError(error.message);
    nav('/', { replace: true });
  }
  return (
    <AuthCard title="Set a new password">
      <form className="stack" onSubmit={submit}>
        <ErrorBox error={error} />
        <label className="field"><span>New password</span><input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button className="btn primary lg">Save password</button>
      </form>
    </AuthCard>
  );
}
