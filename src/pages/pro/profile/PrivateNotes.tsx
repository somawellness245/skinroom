import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { usePractitioner } from '../../../lib/session';
import { fmtRelative } from '../../../lib/dates';
import type { Client } from '../../../lib/types';
import { ErrorBox } from '../../../components/ui';

const STARTER = `Skin type:
Fitzpatrick / Glogau:
Areas of concern:
Skin analysis (pores, moisture, texture, elasticity, sensitivity):
Acne grade:
Treatment protocol:
Tolerance / reactions:
`;

/** Notes only the practice can see. Saves automatically as you type. */
export function PrivateNotes({ client }: { client: Client }) {
  const { practice } = usePractitioner();
  const [body, setBody] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    supabase.from('practitioner_notes').select('body, updated_at').eq('client_id', client.id).maybeSingle().then(({ data, error }) => {
      if (error) setError(error.message);
      setBody(data?.body ?? STARTER);
      setSavedAt(data?.updated_at ?? null);
    });
  }, [client.id]);

  function change(v: string) {
    setBody(v);
    setState('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const now = new Date().toISOString();
      const { error } = await supabase.from('practitioner_notes').upsert({ client_id: client.id, practice_id: practice.id, body: v, updated_at: now });
      if (error) { setError(error.message); setState('idle'); return; }
      setSavedAt(now);
      setState('saved');
    }, 800);
  }

  return (
    <section className="card stack">
      <div className="between">
        <div className="row"><h2>Practitioner notes</h2><span className="tag dark">Only you</span></div>
        <span className="small muted" aria-live="polite">{state === 'saving' ? 'Saving…' : savedAt ? `Saved ${fmtRelative(savedAt)}` : ''}</span>
      </div>
      <ErrorBox error={error} />
      {body === null ? <div className="muted">Loading…</div> : (
        <textarea className="input" rows={16} value={body} onChange={(e) => change(e.target.value)} aria-label="Private notes" style={{ fontFamily: 'var(--body)' }} />
      )}
      <p className="small muted" style={{ margin: 0 }}>{client.first_name} never sees these notes.</p>
    </section>
  );
}
