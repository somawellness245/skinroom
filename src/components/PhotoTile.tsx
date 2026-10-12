import { useEffect, useState } from 'react';
import { photoUrl } from '../lib/supabase';

/** Shows a private photo through a short-lived signed link. */
export function PhotoTile({ path, url, label, alt }: { path?: string | null; url?: string | null; label?: string; alt?: string }) {
  const [src, setSrc] = useState<string | null>(url ?? null);
  useEffect(() => {
    let live = true;
    if (url) setSrc(url);
    else if (path) photoUrl(path).then((u) => live && setSrc(u));
    else setSrc(null);
    return () => { live = false; };
  }, [path, url]);
  return (
    <div className="photo">
      {src ? <img src={src} alt={alt ?? label ?? 'Skin photo'} loading="lazy" /> : <span>{path ? 'Loading…' : 'No photo'}</span>}
      {label && <span className="label">{label}</span>}
    </div>
  );
}
