import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useClientSelf } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { today } from '../../lib/dates';
import { ErrorBox, Loading } from '../../components/ui';
import { loadClientWorld } from './data';

export function ClientRoutine() {
  const { client } = useClientSelf();
  const { data, error, loading } = useLoad(() => loadClientWorld(client), [client.id]);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase.from('routine_checks').select('step_id').eq('client_id', client.id).eq('on_date', today())
      .then(({ data }) => setChecked(new Set((data ?? []).map((r) => r.step_id as string))));
  }, [client.id]);

  async function toggle(id: string) {
    const next = new Set(checked);
    if (next.has(id)) { next.delete(id); await supabase.from('routine_checks').delete().eq('step_id', id).eq('on_date', today()); }
    else { next.add(id); await supabase.from('routine_checks').upsert({ client_id: client.id, step_id: id, on_date: today() }); }
    setChecked(next);
  }

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} />;

  return (
    <>
      <h1 style={{ fontSize: 26 }}>Your routine</h1>
      <p className="muted" style={{ margin: 0 }}>Check steps off as you go. Your esthetician sees how consistent you’ve been.</p>
      {(['am', 'pm'] as const).map((tod) => {
        const steps = data.steps.filter((s) => s.time_of_day === tod).sort((a, b) => a.position - b.position);
        return (
          <section key={tod} className="card stack" style={{ gap: 4 }}>
            <h2>{tod === 'am' ? 'Morning' : 'Evening'}</h2>
            {steps.length === 0 ? <p className="muted small" style={{ margin: 0 }}>Nothing here yet.</p> : steps.map((s, i) => (
              <label key={s.id} className="check" style={{ alignItems: 'flex-start', paddingTop: 10 }}>
                <input type="checkbox" checked={checked.has(s.id)} onChange={() => toggle(s.id)} style={{ marginTop: 2 }} />
                <span>
                  <span style={{ fontWeight: 600 }}>{i + 1}. {s.label}</span>
                  {(s.frequency || s.instructions) && <span className="small muted" style={{ display: 'block' }}>{[s.frequency, s.instructions].filter(Boolean).join(' · ')}</span>}
                </span>
              </label>
            ))}
          </section>
        );
      })}
    </>
  );
}
