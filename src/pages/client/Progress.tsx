import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useClientSelf } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { fmtDate } from '../../lib/dates';
import type { Photo } from '../../lib/types';
import { ErrorBox, Loading } from '../../components/ui';
import { PhotoTile } from '../../components/PhotoTile';
import { loadClientWorld } from './data';

export function ClientProgress() {
  const { client } = useClientSelf();
  const { data, error, loading } = useLoad(() => loadClientWorld(client), [client.id]);
  const [angle, setAngle] = useState<'front' | 'left' | 'right'>('front');

  const dates = useMemo(() => {
    const m = new Map<string, Photo[]>();
    for (const p of data?.photos ?? []) m.set(p.taken_on, [...(m.get(p.taken_on) ?? []), p]);
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [data]);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} />;
  const ofAngle = data.photos.filter((p) => p.angle === angle);
  const first = ofAngle.find((p) => p.kind === 'baseline') ?? ofAngle[0];
  const last = ofAngle[ofAngle.length - 1];

  return (
    <>
      <h1 style={{ fontSize: 26 }}>Your progress</h1>
      {data.photos.length === 0 ? (
        <section className="card stack">
          <p style={{ margin: 0 }}>Your photos will show up here after your first check-in.</p>
          <Link className="btn primary" to="/me/checkin">Start a check-in</Link>
        </section>
      ) : (
        <>
          <section className="card stack">
            <div className="row" role="group" aria-label="Photo angle">
              {(['front', 'left', 'right'] as const).map((a) => <button key={a} className="chip" aria-pressed={angle === a} onClick={() => setAngle(a)}>{a[0].toUpperCase() + a.slice(1)}</button>)}
            </div>
            <div className="photos-2">
              <figure style={{ margin: 0 }}><PhotoTile path={first?.storage_path} /><figcaption className="small muted">Start · {fmtDate(first?.taken_on)}</figcaption></figure>
              <figure style={{ margin: 0 }}><PhotoTile path={last && last !== first ? last.storage_path : null} /><figcaption className="small muted">{last && last !== first ? `Latest · ${fmtDate(last.taken_on)}` : 'Next check-in'}</figcaption></figure>
            </div>
          </section>
          {dates.map(([d, ps]) => (
            <section key={d} className="card stack">
              <strong>{fmtDate(d, { month: 'long', day: 'numeric', year: 'numeric' })}</strong>
              <div className="photos-3">{(['front', 'left', 'right'] as const).map((a) => <PhotoTile key={a} path={ps.find((p) => p.angle === a)?.storage_path} label={a[0].toUpperCase() + a.slice(1)} />)}</div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
