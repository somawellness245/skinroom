import { Link, useParams } from 'react-router-dom';
import { supabase, must } from '../../lib/supabase';
import { useLoad } from '../../lib/useLoad';
import type { Lesson } from '../../lib/types';
import { ErrorBox, Icon, Loading } from '../../components/ui';

export function ClientLesson() {
  const { id = '' } = useParams();
  const { data, error, loading } = useLoad(async () => must(await supabase.from('lessons').select('*').eq('id', id).single()) as Lesson, [id]);
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error ?? 'Lesson not found'} />;
  return (
    <>
      <Link to="/me" className="btn link" style={{ alignSelf: 'flex-start' }}><Icon name="back" size={18} /> Home</Link>
      <article className="card stack">
        <h1 style={{ fontSize: 24 }}>{data.title}</h1>
        {data.read_minutes && <span className="small muted">{data.read_minutes} min read</span>}
        {data.summary && <p className="muted" style={{ margin: 0 }}>{data.summary}</p>}
        <div className="pre" style={{ lineHeight: 1.65 }}>{data.body}</div>
      </article>
    </>
  );
}
