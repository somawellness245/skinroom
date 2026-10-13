/** Product rows coming from an import, before they're saved to the shelf. */
export type ImportedProduct = {
  key: string;
  name: string;
  category: string | null;
  size: string | null;
  image_url: string | null;
  shop_url: string | null;
  lasts_days: number | null;
};

/** Small CSV reader that handles quoted fields, commas and line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Finds the column whose header matches one of the names (in order of preference). */
function col(headers: string[], ...names: string[]): number {
  const hs = headers.map(norm);
  for (const n of names) {
    const i = hs.indexOf(norm(n));
    if (i >= 0) return i;
  }
  return -1;
}

/**
 * Turns an exported product spreadsheet into shelf products.
 * Understands Shopify's export (one row per variant/image, grouped by Handle) and
 * generic exports from Square, WooCommerce, Wix, Etsy, or a hand-made sheet.
 */
export function productsFromCsv(text: string, storeUrl?: string | null): { products: ImportedProduct[]; source: string } {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('That file looks empty. Export your products as a CSV and try again.');
  const [headers, ...body] = rows;

  const iHandle = col(headers, 'Handle');
  const iName = col(headers, 'Title', 'Name', 'Product Name', 'Item Name', 'Product', 'Item');
  if (iName < 0) throw new Error('We couldn’t find a product name column. Make sure the first row has headers like “Name” or “Title”.');
  const iCat = col(headers, 'Type', 'Product Type', 'Category', 'Categories', 'Product Category', 'Reporting Category');
  const iImg = col(headers, 'Image Src', 'Image', 'Images', 'Image URL', 'Image Link', 'Photo', 'Product Image URL', 'Image 1', 'IMAGE1');
  const iUrl = col(headers, 'URL', 'Link', 'Product URL', 'Product Link', 'Permalink', 'Online Store URL');
  const iSize = col(headers, 'Size', 'Option1 Value', 'Variant Title', 'Variation', 'Variant');
  const iWeeks = col(headers, 'Lasts Weeks', 'Weeks', 'Lasts (weeks)', 'Lasts');
  const isShopify = iHandle >= 0 && col(headers, 'Variant SKU', 'Variant Price', 'Body (HTML)') >= 0;
  const base = storeUrl ? storeUrl.replace(/\/+$/, '').replace(/^(?!https?:\/\/)/, 'https://') : null;

  const byKey = new Map<string, ImportedProduct>();
  for (const r of body) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
    const key = isShopify ? get(iHandle) : get(iName).toLowerCase();
    if (!key) continue;
    const existing = byKey.get(key);
    const name = get(iName);
    if (existing) {
      // Shopify puts extra images/variants on follow-up rows with a blank Title.
      if (!existing.image_url && get(iImg)) existing.image_url = firstUrl(get(iImg));
      continue;
    }
    if (!name) continue;
    const size = get(iSize);
    const weeks = Number(get(iWeeks));
    byKey.set(key, {
      key,
      name: name.slice(0, 200),
      category: get(iCat).split(/[>,|]/)[0].trim() || null,
      size: size && size !== 'Default Title' ? size.slice(0, 60) : null,
      image_url: firstUrl(get(iImg)),
      shop_url: firstUrl(get(iUrl)) ?? (isShopify && base ? `${base}/products/${encodeURIComponent(get(iHandle))}` : null),
      lasts_days: weeks > 0 && weeks < 105 ? Math.round(weeks * 7) : null,
    });
  }
  const products = [...byKey.values()];
  if (!products.length) throw new Error('No products found in that file.');
  return { products, source: isShopify ? 'Shopify export' : 'spreadsheet' };
}

function firstUrl(s: string): string | null {
  const m = s.match(/https?:\/\/[^\s,|;"]+/);
  return m ? m[0] : null;
}
