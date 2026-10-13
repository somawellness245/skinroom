import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session';
import { productsFromCsv, type ImportedProduct } from '../lib/importers';
import { BRAND_CATALOGS } from '../lib/brandCatalogs';
import type { Practice, Product } from '../lib/types';
import { ErrorBox, Modal } from './ui';

type Tab = 'shopify' | 'csv' | 'brands';

export function ProductImport({ practice, existing, onClose, onImported }: {
  practice: Practice; existing: Product[]; onClose: () => void; onImported: (count: number) => Promise<void>;
}) {
  const { session } = useSession();
  const [tab, setTab] = useState<Tab>('shopify');
  const [store, setStore] = useState(practice.shop_url ?? '');
  const [found, setFound] = useState<ImportedProduct[] | null>(null);
  const [source, setSource] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [weeks, setWeeks] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const have = useMemo(() => new Set(existing.map((p) => p.name.trim().toLowerCase())), [existing]);
  const isDup = (p: ImportedProduct) => have.has(p.name.trim().toLowerCase());

  function show(list: ImportedProduct[], from: string) {
    setFound(list);
    setSource(from);
    setPicked(new Set(list.filter((p) => !isDup(p)).map((p) => p.key)));
    setError(null);
  }

  async function fromStore(storeAddress: string, lastsWeeks?: Record<string, number>, defaultWeeks?: number) {
    setBusy('Reading the store…');
    setError(null);
    try {
      const res = await fetch('/api/shopify-products', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ store: storeAddress }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Couldn’t read that store.');
      const list: ImportedProduct[] = (body.products as (Omit<ImportedProduct, 'key' | 'lasts_days'> & { handle: string })[]).map((p) => {
        const w = lastsWeeks?.[p.handle] ?? defaultWeeks;
        return { ...p, key: p.handle, lasts_days: w ? Math.round(w * 7) : null };
      });
      if (!list.length) throw new Error('That store doesn’t have any products listed.');
      show(list, body.store);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function fromFile(file: File) {
    try {
      const text = await file.text();
      const { products, source } = productsFromCsv(text, practice.shop_url);
      show(products, `${file.name} (${source})`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function save() {
    const rows = (found ?? []).filter((p) => picked.has(p.key));
    if (!rows.length) return setError('Pick at least one product.');
    const w = Number(weeks);
    setBusy(`Adding ${rows.length} products…`);
    const { error } = await supabase.from('products').insert(rows.map((p) => ({
      practice_id: practice.id,
      name: p.name,
      category: p.category,
      size: p.size,
      image_url: p.image_url,
      shop_url: p.shop_url,
      lasts_days: p.lasts_days ?? (w > 0 ? Math.round(w * 7) : null),
    })));
    setBusy(null);
    if (error) return setError(error.message);
    await onImported(rows.length);
  }

  const visible = (found ?? []).filter((p) => !q.trim() || `${p.name} ${p.category ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (k: string) => setPicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const allVisiblePicked = visible.length > 0 && visible.every((p) => picked.has(p.key));
  const missingTime = (found ?? []).filter((p) => picked.has(p.key) && !p.lasts_days).length;

  return (
    <Modal title="Import products" onClose={onClose}>
      {!found ? (
        <>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'shopify'} onClick={() => { setTab('shopify'); setError(null); }}>Shopify store</button>
            <button role="tab" aria-selected={tab === 'csv'} onClick={() => { setTab('csv'); setError(null); }}>Spreadsheet</button>
            <button role="tab" aria-selected={tab === 'brands'} onClick={() => { setTab('brands'); setError(null); }}>Featured brands</button>
          </div>
          <ErrorBox error={error} />
          {tab === 'shopify' && (
            <form className="stack" onSubmit={(e) => { e.preventDefault(); fromStore(store); }}>
              <label className="field"><span>Your store address</span>
                <input value={store} onChange={(e) => setStore(e.target.value)} placeholder="yourstore.com or yourstore.myshopify.com" required />
              </label>
              <p className="small muted" style={{ margin: 0 }}>We’ll pull in each product’s name, photo, size, and its page link so clients can reorder straight from your store. No login needed.</p>
              <button className="btn primary" disabled={!!busy}>{busy ?? 'Find my products'}</button>
            </form>
          )}
          {tab === 'csv' && (
            <div className="stack">
              <p style={{ margin: 0 }}>Export your products as a <strong>CSV file</strong> from your shop, then upload it here.</p>
              <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
                <li><strong>Shopify:</strong> Products → Export → CSV for Excel</li>
                <li><strong>Square:</strong> Items → Actions → Export library</li>
                <li><strong>WooCommerce:</strong> Products → Export</li>
                <li><strong>Wix, Etsy, others:</strong> look for “Export products” or “Download CSV”</li>
                <li><strong>Your own sheet:</strong> columns for Name, Category, Size, Image URL, Link, and Weeks (how long it lasts) all work</li>
              </ul>
              <label className="btn primary" style={{ alignSelf: 'flex-start', cursor: 'pointer' }}>
                Choose CSV file
                <input className="sr" type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && fromFile(e.target.files[0])} />
              </label>
            </div>
          )}
          {tab === 'brands' && (
            <div className="stack">
              <p className="small muted" style={{ margin: 0 }}>Carry one of these professional lines? Add the full range in one tap.</p>
              {BRAND_CATALOGS.map((b) => (
                <div key={b.id} className="card tight between">
                  <div><div style={{ fontWeight: 700 }}>{b.name}</div><div className="small muted">{b.tagline}</div></div>
                  <button className="btn primary" disabled={!!busy} onClick={() => fromStore(b.store, b.lastsWeeks, b.defaultWeeks)}>{busy ?? 'See products'}</button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="between">
            <span className="small muted">{found.length} products from {source}</span>
            <button className="btn link small" onClick={() => { setFound(null); setError(null); }}>← Start over</button>
          </div>
          <ErrorBox error={error} />
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input className="input grow" type="search" placeholder="Filter" aria-label="Filter products" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn" onClick={() => setPicked((s) => {
              const n = new Set(s);
              for (const p of visible) { if (allVisiblePicked) n.delete(p.key); else n.add(p.key); }
              return n;
            })}>{allVisiblePicked ? 'Select none' : 'Select all'}</button>
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10 }}>
            {visible.map((p) => (
              <label key={p.key} className="check" style={{ padding: '8px 12px', borderBottom: '1px solid var(--line-soft)' }}>
                <input type="checkbox" checked={picked.has(p.key)} onChange={() => toggle(p.key)} />
                {p.image_url ? <img src={p.image_url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8, flex: 'none' }} /> : <span style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--line-soft)', flex: 'none' }} />}
                <span className="grow">
                  <span style={{ display: 'block', fontWeight: 600 }}>{p.name}</span>
                  <span className="small muted">{[p.category, p.size, p.lasts_days && `lasts ~${Math.round(p.lasts_days / 7)} wks`].filter(Boolean).join(' · ') || '—'}</span>
                </span>
                {isDup(p) && <span className="tag plain">Already on shelf</span>}
              </label>
            ))}
          </div>
          {missingTime > 0 && (
            <label className="field"><span>How long do these usually last? (weeks, optional)</span>
              <input type="number" min={1} max={104} value={weeks} onChange={(e) => setWeeks(e.target.value)} placeholder={`Applies to the ${missingTime} without a time. You can fine-tune each later.`} />
            </label>
          )}
          <button className="btn primary lg" onClick={save} disabled={!!busy || picked.size === 0}>{busy ?? `Add ${picked.size} to my shelf`}</button>
        </>
      )}
    </Modal>
  );
}
