import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, must } from '../../lib/supabase';
import { usePractitioner } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import type { Product } from '../../lib/types';
import { ErrorBox, Loading, Modal } from '../../components/ui';
import { ProductImport } from '../../components/ProductImport';

export function Products() {
  const { practice } = usePractitioner();
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [importing, setImporting] = useState(false);
  const [timing, setTiming] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const { data, error, loading, reload } = useLoad(async () => {
    const [p, s] = await Promise.all([
      supabase.from('products').select('*').eq('practice_id', practice.id).eq('active', true).order('name'),
      supabase.from('regimen_steps').select('product_id').eq('practice_id', practice.id),
    ]);
    const uses = new Map<string, number>();
    for (const r of must(s) as { product_id: string | null }[]) if (r.product_id) uses.set(r.product_id, (uses.get(r.product_id) ?? 0) + 1);
    return { products: must(p) as Product[], uses };
  }, [practice.id]);

  return (
    <>
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div><h1>Product shelf</h1><div className="muted">The products you recommend. Add them to client routines in one tap.</div></div>
        <div className="row">
          <button className="btn" onClick={() => setImporting(true)} disabled={!data}>Import products</button>
          <button className="btn primary" onClick={() => setEditing({})}>+ Add product</button>
        </div>
      </div>
      {flash && <div className="notice" role="status">{flash}</div>}
      {data && data.products.some((p) => !p.lasts_days) && (
        <div className="card tight warn between">
          <span>{data.products.filter((p) => !p.lasts_days).length} products don’t have a “lasts about” time yet, so they won’t trigger reorder reminders.</span>
          <button className="btn warn" onClick={() => setTiming(true)}>Set times</button>
        </div>
      )}
      <div className="notice between">
        <span><strong>Reorder reminders run on their own.</strong> Set how long each product lasts, and clients get a “running low” prompt with your shop link before they run out.</span>
        {!practice.shop_url && <Link to="/app/settings" className="btn soft">Add your shop link</Link>}
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
          {data.products.map((p) => (
            <button key={p.id} type="button" className="card tight stack" style={{ textAlign: 'left', cursor: 'pointer', gap: 8 }} onClick={() => setEditing(p)}>
              <div className="photo" style={{ aspectRatio: '1 / 1' }}>{p.image_url ? <img src={p.image_url} alt="" /> : 'No photo'}</div>
              <div style={{ fontWeight: 600 }}>{p.name}</div>
              <div className="small muted">{[p.category, p.size].filter(Boolean).join(' · ') || '—'}</div>
              <div className="small muted">{p.lasts_days ? `Lasts ~${Math.round(p.lasts_days / 7)} weeks` : 'Set how long it lasts'} · in {data.uses.get(p.id) ?? 0} routines</div>
            </button>
          ))}
          <button type="button" className="card tight" style={{ minHeight: 220, border: '1px dashed #B9C4C1', fontWeight: 600, cursor: 'pointer' }} onClick={() => setEditing({})}>+ Add product</button>
        </div>
      )}
      {importing && data && (
        <ProductImport practice={practice} existing={data.products} onClose={() => setImporting(false)}
          onImported={async (n) => { setImporting(false); setFlash(`Added ${n} product${n === 1 ? '' : 's'} to your shelf.`); await reload(); }} />
      )}
      {timing && data && (
        <LastsEditor products={data.products.filter((p) => !p.lasts_days)} onClose={() => setTiming(false)}
          onSaved={async () => { setTiming(false); await reload(); }} />
      )}
      {editing && <ProductForm product={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(); }} />}
    </>
  );
}

function ProductForm({ product, onClose, onSaved }: { product: Partial<Product>; onClose: () => void; onSaved: () => Promise<void> }) {
  const { practice } = usePractitioner();
  const [f, setF] = useState({
    name: product.name ?? '', category: product.category ?? '', size: product.size ?? '',
    weeks: product.lasts_days ? String(Math.round(product.lasts_days / 7)) : '', shop_url: product.shop_url ?? '', image_url: product.image_url ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function uploadImage(file: File) {
    const path = `${practice.id}/products/${crypto.randomUUID()}.${(file.name.split('.').pop() || 'jpg').toLowerCase()}`;
    const { error } = await supabase.storage.from('branding').upload(path, file, { contentType: file.type });
    if (error) return setError(error.message);
    setF({ ...f, image_url: supabase.storage.from('branding').getPublicUrl(path).data.publicUrl });
  }

  async function save() {
    if (!f.name.trim()) return setError('Product name is required.');
    setBusy(true);
    const weeks = Number(f.weeks);
    const body = {
      name: f.name.trim(), category: f.category.trim() || null, size: f.size.trim() || null,
      lasts_days: weeks > 0 ? Math.round(weeks * 7) : null,
      shop_url: f.shop_url.trim() ? (/^https?:\/\//.test(f.shop_url.trim()) ? f.shop_url.trim() : `https://${f.shop_url.trim()}`) : null,
      image_url: f.image_url || null,
    };
    const res = product.id
      ? await supabase.from('products').update(body).eq('id', product.id)
      : await supabase.from('products').insert({ ...body, practice_id: practice.id });
    setBusy(false);
    if (res.error) return setError(res.error.message);
    await onSaved();
  }

  async function remove() {
    if (!product.id || !confirm('Remove this product from your shelf? Client routines keep the step name.')) return;
    const { error } = await supabase.from('products').update({ active: false }).eq('id', product.id);
    if (error) return setError(error.message);
    await onSaved();
  }

  return (
    <Modal title={product.id ? 'Edit product' : 'Add product'} onClose={onClose}>
      <ErrorBox error={error} />
      <label className="field"><span>Product name</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <div className="form-grid">
        <label className="field"><span>Category</span>
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="">—</option>{['Cleanse', 'Tone', 'Treat', 'Moisturize', 'Protect', 'Exfoliate', 'Mask', 'Supplement'].map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="field"><span>Size</span><input value={f.size} onChange={(e) => setF({ ...f, size: e.target.value })} placeholder="e.g. 30 ml" /></label>
        <label className="field"><span>Lasts about (weeks)</span><input type="number" min={1} max={104} value={f.weeks} onChange={(e) => setF({ ...f, weeks: e.target.value })} /></label>
      </div>
      <label className="field"><span>Reorder link (optional, otherwise your shop link is used)</span><input value={f.shop_url} onChange={(e) => setF({ ...f, shop_url: e.target.value })} placeholder="https://…" /></label>
      <div className="row">
        {f.image_url && <img src={f.image_url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10 }} />}
        <label className="btn">Product photo<input className="sr" type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} /></label>
      </div>
      <div className="between">
        <button className="btn primary lg" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button>
        {product.id && <button className="btn danger" onClick={remove}>Remove</button>}
      </div>
    </Modal>
  );
}

/** Fill in "lasts about" for many products at once. */
function LastsEditor({ products, onClose, onSaved }: { products: Product[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [weeks, setWeeks] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const updates = Object.entries(weeks).map(([id, w]) => [id, Number(w)] as const).filter(([, w]) => w > 0 && w <= 104);
    if (!updates.length) return onClose();
    setBusy(true);
    for (const [id, w] of updates) {
      const { error } = await supabase.from('products').update({ lasts_days: Math.round(w * 7) }).eq('id', id);
      if (error) { setBusy(false); return setError(error.message); }
    }
    setBusy(false);
    await onSaved();
  }

  return (
    <Modal title="How long does each product last?" onClose={onClose}>
      <p className="small muted" style={{ margin: 0 }}>Weeks of daily use from one bottle or jar. Leave blank to skip.</p>
      <ErrorBox error={error} />
      <div style={{ maxHeight: 420, overflowY: 'auto' }} className="list">
        {products.map((p) => (
          <label key={p.id} className="between">
            <span className="grow">{p.name}{p.size && <span className="muted small"> · {p.size}</span>}</span>
            <span className="row" style={{ flexWrap: 'nowrap' }}>
              <input className="input" type="number" min={1} max={104} style={{ width: 80 }} aria-label={`Weeks for ${p.name}`}
                value={weeks[p.id] ?? ''} onChange={(e) => setWeeks({ ...weeks, [p.id]: e.target.value })} />
              <span className="small muted">wks</span>
            </span>
          </label>
        ))}
      </div>
      <button className="btn primary lg" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save times'}</button>
    </Modal>
  );
}
