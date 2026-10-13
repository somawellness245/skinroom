/**
 * Skinroom server (Cloudflare Worker).
 * Serves the app, and handles the few things that need secret keys:
 *  - /api/checkout        start a Stripe subscription for the signed-in owner's practice
 *  - /api/portal          open Stripe's billing page for that practice
 *  - /api/stripe-webhook  Stripe tells us when a subscription starts, changes or ends
 *  - /api/shopify-products  read a Shopify store's public product list for the product shelf import
 *  - daily cron           emails clients whose check-in is coming up (if email is set up)
 */

export interface Env {
  ASSETS: Fetcher;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_PRICE_ID?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  APP_URL?: string;
}

type Practice = {
  id: string; name: string; brand_color: string; send_reminders: boolean; subscription_status?: string;
  stripe_customer_id: string | null; stripe_subscription_id: string | null;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (url.pathname === '/api/checkout' && req.method === 'POST') return await checkout(req, env, url);
      if (url.pathname === '/api/portal' && req.method === 'POST') return await portal(req, env, url);
      if (url.pathname === '/api/stripe-webhook' && req.method === 'POST') return await stripeWebhook(req, env);
      if (url.pathname === '/api/shopify-products' && req.method === 'POST') return await shopifyProducts(req, env);
      if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: 'Something went wrong. Please try again.' }, 500);
    }
    return env.ASSETS.fetch(req);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(sendReminders(env));
  },
};

// ---------------------------------------------------------------------------
// Supabase helpers (service key: server only, never sent to the browser)
// ---------------------------------------------------------------------------

async function db<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'content-type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Database error ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** Confirms the request comes from a signed-in practice owner and returns their practice. */
async function ownerPractice(req: Request, env: Env): Promise<{ practice: Practice; email: string }> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Please log in again.');
  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` } });
  if (!userRes.ok) throw new HttpError(401, 'Please log in again.');
  const user = (await userRes.json()) as { id: string; email: string };
  const rows = await db<{ practice: Practice }[]>(env,
    `practice_members?user_id=eq.${encodeURIComponent(user.id)}&role=eq.owner&select=practice:practices(id,name,brand_color,send_reminders,subscription_status,stripe_customer_id,stripe_subscription_id)&limit=1`);
  if (!rows[0]?.practice) throw new HttpError(403, 'Only the practice owner can manage billing.');
  return { practice: rows[0].practice, email: user.email };
}

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Confirms the request comes from any signed-in esthetician (owner or staff). */
async function requireMember(req: Request, env: Env): Promise<void> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Please log in again.');
  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` } });
  if (!userRes.ok) throw new HttpError(401, 'Please log in again.');
  const user = (await userRes.json()) as { id: string };
  const rows = await db<unknown[]>(env, `practice_members?user_id=eq.${encodeURIComponent(user.id)}&select=practice_id&limit=1`);
  if (!rows.length) throw new HttpError(403, 'Only estheticians can import products.');
}

// ---------------------------------------------------------------------------
// Shopify product import (public /products.json, no keys needed)
// ---------------------------------------------------------------------------

type ShopifyProduct = {
  title: string; handle: string; product_type?: string; vendor?: string;
  images?: { src: string }[]; variants?: { title?: string }[];
};

async function shopifyProducts(req: Request, env: Env): Promise<Response> {
  try {
    await requireMember(req, env);
    const body = (await req.json().catch(() => ({}))) as { store?: string };
    const host = cleanStoreHost(body.store ?? '');
    if (!host) throw new HttpError(400, 'Enter your store address, like yourstore.com or yourstore.myshopify.com.');
    const out: { name: string; category: string | null; size: string | null; image_url: string | null; shop_url: string; handle: string }[] = [];
    for (let page = 1; page <= 4; page++) {
      const res = await fetch(`https://${host}/products.json?limit=250&page=${page}`, {
        headers: { accept: 'application/json', 'user-agent': 'Skinroom product import' },
        redirect: 'follow',
      });
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) {
        if (page === 1) throw new HttpError(422, 'We couldn’t read products from that store. It may not be a Shopify store, or it keeps its product list private. Try the spreadsheet import instead.');
        break;
      }
      const data = (await res.json()) as { products?: ShopifyProduct[] };
      const list = data.products ?? [];
      for (const p of list) {
        const v = p.variants?.[0]?.title;
        out.push({
          name: p.title.slice(0, 200),
          category: p.product_type?.trim() || null,
          size: v && v !== 'Default Title' ? v.slice(0, 60) : null,
          image_url: p.images?.[0]?.src ?? null,
          shop_url: `https://${host}/products/${encodeURIComponent(p.handle)}`,
          handle: p.handle,
        });
      }
      if (list.length < 250) break;
    }
    return json({ store: host, products: out });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    throw e;
  }
}

/** Accepts "store.com", "https://store.com/collections/x" etc. Rejects anything that isn't a public hostname. */
function cleanStoreHost(input: string): string | null {
  let raw = input.trim().toLowerCase();
  if (!raw) return null;
  if (!/^https?:\/\//.test(raw)) raw = `https://${raw}`;
  let host: string;
  try { host = new URL(raw).hostname; } catch { return null; }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null; // no IPs, no localhost
  if (host.endsWith('.local') || host.endsWith('.internal')) return null;
  return host;
}

// ---------------------------------------------------------------------------
// Stripe
// ---------------------------------------------------------------------------

async function stripe<T>(env: Env, path: string, params: Record<string, string>): Promise<T> {
  if (!env.STRIPE_SECRET_KEY) throw new HttpError(503, 'Billing isn’t set up yet.');
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const body = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) throw new Error(body.error?.message ?? `Stripe error ${res.status}`);
  return body;
}

function appUrl(env: Env, url: URL) {
  return env.APP_URL?.replace(/\/$/, '') || url.origin;
}

async function checkout(req: Request, env: Env, url: URL): Promise<Response> {
  try {
    const { practice, email } = await ownerPractice(req, env);
    if (!env.STRIPE_PRICE_ID) throw new HttpError(503, 'Billing isn’t set up yet.');
    if (practice.stripe_subscription_id && practice.subscription_status !== 'canceled') {
      throw new HttpError(409, 'You already have a subscription. Use Manage billing instead.');
    }
    const base = appUrl(env, url);
    const params: Record<string, string> = {
      mode: 'subscription',
      'line_items[0][price]': env.STRIPE_PRICE_ID,
      'line_items[0][quantity]': '1',
      client_reference_id: practice.id,
      'subscription_data[metadata][practice_id]': practice.id,
      success_url: `${base}/app/settings?billing=success#plan`,
      cancel_url: `${base}/app/settings#plan`,
      allow_promotion_codes: 'true',
    };
    if (practice.stripe_customer_id) params.customer = practice.stripe_customer_id;
    else params.customer_email = email;
    const session = await stripe<{ url: string }>(env, 'checkout/sessions', params);
    return json({ url: session.url });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    throw e;
  }
}

async function portal(req: Request, env: Env, url: URL): Promise<Response> {
  try {
    const { practice } = await ownerPractice(req, env);
    if (!practice.stripe_customer_id) throw new HttpError(400, 'No billing account yet. Start a subscription first.');
    const session = await stripe<{ url: string }>(env, 'billing_portal/sessions', {
      customer: practice.stripe_customer_id,
      return_url: `${appUrl(env, url)}/app/settings#plan`,
    });
    return json({ url: session.url });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    throw e;
  }
}

async function verifyStripeSignature(payload: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = parts.t;
  const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // 5 min tolerance
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return sigs.some((s) => timingSafeEqual(s, expected));
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function mapStatus(s: string): 'active' | 'past_due' | 'canceled' {
  if (s === 'active' || s === 'trialing') return 'active';
  if (s === 'past_due' || s === 'unpaid' || s === 'incomplete') return 'past_due';
  return 'canceled';
}

async function stripeWebhook(req: Request, env: Env): Promise<Response> {
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: 'Not configured' }, 503);
  const payload = await req.text();
  if (!(await verifyStripeSignature(payload, req.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET))) {
    return json({ error: 'Bad signature' }, 400);
  }
  const event = JSON.parse(payload) as { type: string; data: { object: Record<string, unknown> } };
  const obj = event.data.object;

  if (event.type === 'checkout.session.completed') {
    const practiceId = obj.client_reference_id as string | null;
    const paid = obj.payment_status === 'paid' || obj.payment_status === 'no_payment_required';
    if (practiceId && paid) {
      await db(env, `practices?id=eq.${encodeURIComponent(practiceId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ stripe_customer_id: obj.customer, stripe_subscription_id: obj.subscription, subscription_status: 'active' }),
      });
    }
  } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const practiceId = (obj.metadata as Record<string, string> | undefined)?.practice_id;
    const status = event.type === 'customer.subscription.deleted' ? 'canceled' : mapStatus(String(obj.status));
    const filter = practiceId ? `id=eq.${encodeURIComponent(practiceId)}` : `stripe_subscription_id=eq.${encodeURIComponent(String(obj.id))}`;
    await db(env, `practices?${filter}`, { method: 'PATCH', body: JSON.stringify({ subscription_status: status, stripe_subscription_id: obj.id }) });
  }
  return json({ received: true });
}

// ---------------------------------------------------------------------------
// Check-in reminders (daily). Needs RESEND_API_KEY + EMAIL_FROM.
// ---------------------------------------------------------------------------

async function sendReminders(env: Env) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return;
  const base = env.APP_URL?.replace(/\/$/, '') ?? '';
  const now = new Date();
  const day = (offset: number) => new Date(now.getTime() + offset * 86400000).toISOString().slice(0, 10);
  // Remind 3 days before and on the day.
  const dates = [day(3), day(0)];
  const clients = await db<{ id: string; first_name: string; email: string | null; user_id: string | null; next_checkin_on: string; practice: Practice }[]>(env,
    `clients?archived=eq.false&user_id=not.is.null&next_checkin_on=in.(${dates.join(',')})&select=id,first_name,email,user_id,next_checkin_on,practice:practices(id,name,brand_color,send_reminders)`);

  for (const c of clients) {
    if (!c.practice?.send_reminders) continue;
    const email = c.email ?? (await loginEmail(env, c.user_id!));
    if (!email) continue;
    const today = c.next_checkin_on === dates[1];
    const subject = today ? `Your ${c.practice.name} check-in is due today` : `Your ${c.practice.name} check-in is coming up`;
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;color:#17201F">
        <h2 style="margin:0 0 12px">Hi ${escapeHtml(c.first_name)},</h2>
        <p>${today ? 'Your monthly check-in is due today.' : 'Your next check-in is in 3 days.'} It takes about 5 minutes: three photos and a few quick questions.</p>
        <p><a href="${base}/me/checkin" style="display:inline-block;background:${c.practice.brand_color};color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:600">Start my check-in</a></p>
        <p style="color:#4E5A58;font-size:13px">${escapeHtml(c.practice.name)} · sent through Skinroom</p>
      </div>`;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: email, subject, html }),
    }).catch((e) => console.error('reminder failed', c.id, e));
  }
}

async function loginEmail(env: Env, userId: string): Promise<string | null> {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
  });
  if (!res.ok) return null;
  return ((await res.json()) as { email?: string }).email ?? null;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}
