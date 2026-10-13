import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
const stub = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
grant usage on schema public, auth, storage to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
grant all on storage.objects to authenticated;
`;
await db.exec(stub);
import { readdirSync } from 'node:fs';
const migDir = new URL("../migrations/", import.meta.url);
for (const f of readdirSync(migDir).filter((n) => n.endsWith(".sql")).sort()) await db.exec(readFileSync(new URL(f, migDir), "utf8"));

const U = {
  ana: '11111111-1111-1111-1111-111111111111',  // esthetician A
  ben: '22222222-2222-2222-2222-222222222222',  // esthetician B
  cal: '33333333-3333-3333-3333-333333333333',  // client of A
  dee: '44444444-4444-4444-4444-444444444444',  // client of B
  eve: '55555555-5555-5555-5555-555555555555',  // random user
};
for (const id of Object.values(U)) await db.query('insert into auth.users values ($1)', [id]);

async function as(uid, sql, params = []) {
  await db.exec('reset role');
  await db.query(`select set_config('test.uid', $1, false)`, [uid ?? '']);
  await db.exec(uid ? 'set role authenticated' : 'set role anon');
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
}
let pass = 0, fail = 0;
async function expect(name, fn) {
  try { const ok = await fn(); if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name); } }
  catch (e) { fail++; console.log('FAIL', name, '-', e.message); }
}
async function blocked(name, fn) {
  try { const r = await fn(); if (r.rows.length === 0) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, r.rows); } }
  catch (e) { pass++; console.log('PASS', name, '-', e.message.slice(0, 60)); }
}
async function throws(name, fn) {
  try { await fn(); fail++; console.log('FAIL (no error)', name); }
  catch (e) { pass++; console.log('PASS', name, '-', e.message.slice(0, 70)); }
}

const pA = (await as(U.ana, `select create_practice('Practice A','Ana') as id`)).rows[0].id;
const pB = (await as(U.ben, `select create_practice('Practice B','Ben') as id`)).rows[0].id;
await throws('second practice for same user blocked', () => as(U.ana, `select create_practice('again')`));

const cA = (await as(U.ana, `insert into clients (practice_id, first_name) values ($1,'Cal') returning id, invite_code`, [pA])).rows[0];
const cB = (await as(U.ben, `insert into clients (practice_id, first_name) values ($1,'Dee') returning id, invite_code`, [pB])).rows[0];

await throws('esthetician cannot add client to another practice', () =>
  as(U.ana, `insert into clients (practice_id, first_name) values ($1,'Sneaky')`, [pB]));
await throws('esthetician cannot set user_id directly', () =>
  as(U.ana, `update clients set user_id = $1 where id = $2`, [U.eve, cA.id]));

await expect('A sees only own clients', async () => {
  const r = await as(U.ana, 'select first_name from clients'); return r.rows.length === 1 && r.rows[0].first_name === 'Cal';
});
await expect('B sees only own clients', async () => {
  const r = await as(U.ben, 'select first_name from clients'); return r.rows.length === 1 && r.rows[0].first_name === 'Dee';
});
await expect('anon sees invite preview', async () => {
  const r = await as(null, 'select * from invite_preview($1)', [cA.invite_code]); return r.rows[0].practice_name === 'Practice A';
});
await blocked('anon sees no clients', () => as(null, 'select * from clients'));
await blocked('anon cannot call helper functions', () => as(null, 'select 1 where client_in_practice(gen_random_uuid(), gen_random_uuid())'));

await as(U.cal, 'select claim_invite($1)', [cA.invite_code]);
await as(U.dee, 'select claim_invite($1)', [cB.invite_code]);
await throws('invite cannot be reused by someone else', () => as(U.eve, 'select claim_invite($1)', [cA.invite_code]));

await expect('client sees own record only', async () => {
  const r = await as(U.cal, 'select first_name from clients'); return r.rows.length === 1 && r.rows[0].first_name === 'Cal';
});
await expect('client sees own practice name', async () => {
  const r = await as(U.cal, 'select name from practices'); return r.rows.length === 1 && r.rows[0].name === 'Practice A';
});
await expect('client sees practice phases', async () => (await as(U.cal, 'select * from template_phases')).rows.length === 4);
await blocked('random user sees no practices', () => as(U.eve, 'select id, name from practices'));
await blocked('random user sees no clients', () => as(U.eve, 'select * from clients'));
await blocked('client cannot read Stripe ids', () => as(U.cal, 'select stripe_customer_id from practices'));

// notes
await as(U.ana, `insert into practitioner_notes (client_id, practice_id, body) values ($1,$2,'private')`, [cA.id, pA]);
await expect('client cannot read private notes', async () => (await as(U.cal, 'select * from practitioner_notes')).rows.length === 0);
await expect('other esthetician cannot read notes', async () => (await as(U.ben, 'select * from practitioner_notes')).rows.length === 0);
await throws('cannot attach note to other practice client', () =>
  as(U.ana, `insert into practitioner_notes (client_id, practice_id, body) values ($1,$2,'x')`, [cB.id, pA]));

// check-ins
const ck = (await as(U.cal, `insert into checkins (client_id, practice_id, concern_change) values ($1,$2,'better') returning id`, [cA.id, pA])).rows[0];
await throws('client cannot write own response', () =>
  as(U.cal, `insert into checkins (client_id, practice_id, response) values ($1,$2,'great job')`, [cA.id, pA]));
await throws('client cannot check in for someone else', () =>
  as(U.cal, `insert into checkins (client_id, practice_id) values ($1,$2)`, [cB.id, pB]));
await expect('next check-in scheduled', async () => {
  const r = await as(U.ana, 'select next_checkin_on from clients where id=$1', [cA.id]); return r.rows[0].next_checkin_on !== null;
});
await expect('client cannot edit check-in after submit', async () => {
  const r = await as(U.cal, `update checkins set response='x' where id=$1 returning id`, [ck.id]); return r.rows.length === 0;
});
await expect('esthetician can respond', async () => {
  const r = await as(U.ana, `update checkins set response='nice', reviewed_at=now() where id=$1 returning id`, [ck.id]); return r.rows.length === 1;
});
await expect('B cannot see A check-ins', async () => (await as(U.ben, 'select * from checkins')).rows.length === 0);

// photos
await as(U.cal, `insert into photos (client_id, practice_id, kind, angle, storage_path, uploaded_by) values ($1,$2,'checkin','front',$3,$4)`,
  [cA.id, pA, `${pA}/${cA.id}/a.jpg`, U.cal]);
await throws('client cannot upload baseline photos', () =>
  as(U.cal, `insert into photos (client_id, practice_id, kind, angle, storage_path, uploaded_by) values ($1,$2,'baseline','front',$3,$4)`,
    [cA.id, pA, `${pA}/${cA.id}/b.jpg`, U.cal]));
await expect('client cannot delete photos', async () => (await as(U.cal, 'delete from photos returning id')).rows.length === 0);
await expect('storage: client uploads into own folder', async () => {
  await as(U.cal, `insert into storage.objects (bucket_id, name) values ('photos', $1)`, [`${pA}/${cA.id}/x.jpg`]); return true;
});
await throws('storage: client cannot upload into another client folder', () =>
  as(U.cal, `insert into storage.objects (bucket_id, name) values ('photos', $1)`, [`${pB}/${cB.id}/x.jpg`]));
await expect('storage: other esthetician cannot read photo', async () =>
  (await as(U.ben, `select * from storage.objects where bucket_id='photos'`)).rows.length === 0);
await expect('storage: owner esthetician can read photo', async () =>
  (await as(U.ana, `select * from storage.objects where bucket_id='photos'`)).rows.length === 1);

// messages
await as(U.cal, `insert into messages (client_id, practice_id, sender_role, sender_user_id, body) values ($1,$2,'client',$3,'hi')`, [cA.id, pA, U.cal]);
await throws('client cannot pose as practitioner', () =>
  as(U.cal, `insert into messages (client_id, practice_id, sender_role, sender_user_id, body) values ($1,$2,'practitioner',$3,'hi')`, [cA.id, pA, U.cal]));
await expect('B cannot read A messages', async () => (await as(U.ben, 'select * from messages')).rows.length === 0);

// regimen / reorder
const st = (await as(U.ana, `insert into regimen_steps (client_id, practice_id, time_of_day, label) values ($1,$2,'pm','Cleanser') returning id`, [cA.id, pA])).rows[0];
await as(U.cal, 'select mark_reordered($1)', [st.id]);
await throws('client cannot mark another client reorder', () => as(U.dee, 'select mark_reordered($1)', [st.id]));
await expect('client cannot edit regimen directly', async () =>
  (await as(U.cal, `update regimen_steps set label='x' returning id`)).rows.length === 0);

// hardening cases from security review
const msgA = (await as(U.ana, `insert into messages (client_id, practice_id, sender_role, sender_user_id, body) values ($1,$2,'practitioner',$3,'from A') returning id`, [cA.id, pA, U.ana])).rows[0];
await blocked('esthetician cannot move a message to another practice client', () => as(U.ana, `update messages set client_id=$1 where id=$2 returning id`, [cB.id, msgA.id]));
await blocked('esthetician cannot rewrite a client message', () => as(U.ana, `update messages set body='forged' where sender_role='client' returning id`));
await expect('esthetician can mark client messages read', async () =>
  (await as(U.ana, `update messages set read_by_practice_at=now() where sender_role='client' returning id`)).rows.length === 1);
await blocked('esthetician cannot edit client check-in answers', () => as(U.ana, `update checkins set note='edited' where client_id=$1 returning id`, [cA.id]));
await throws('client cannot forward-date a check-in', () =>
  as(U.cal, `insert into checkins (client_id, practice_id, submitted_at) values ($1,$2,'2099-01-01')`, [cA.id, pA]));
const phaseB = (await as(U.ben, 'select id from template_phases limit 1')).rows[0];
await throws('cannot set a client phase from another practice', () => as(U.ana, `update clients set current_phase_id=$1 where id=$2`, [phaseB.id, cA.id]));
const prodB = (await as(U.ben, `insert into products (practice_id, name) values ($1,'B prod') returning id`, [pB])).rows[0];
await throws('cannot add another practice product to a routine', () => as(U.ana, `update regimen_steps set product_id=$1 where id=$2`, [prodB.id, st.id]));
const ckB = (await as(U.dee, `insert into checkins (client_id, practice_id) values ($1,$2) returning id`, [cB.id, pB])).rows[0];
await throws('client cannot attach a photo to another practice check-in', () =>
  as(U.cal, `insert into photos (client_id, practice_id, checkin_id, kind, angle, storage_path, uploaded_by) values ($1,$2,$3,'checkin','front',$4,$5)`,
    [cA.id, pA, ckB.id, `${pA}/${cA.id}/z.jpg`, U.cal]));
await as(U.ana, `update clients set archived=true where id=$1`, [cA.id]);
await blocked('archived client loses photo access', () => as(U.cal, 'select * from photos'));
await blocked('archived client loses practice access', () => as(U.cal, 'select id from practices'));
await as(U.ana, `update clients set archived=false where id=$1`, [cA.id]);

// billing columns
await throws('owner cannot change billing status', () =>
  as(U.ana, `update practices set subscription_status='active' where id=$1`, [pA]));
await expect('owner can change branding', async () =>
  (await as(U.ana, `update practices set brand_color='#3B3F7A' where id=$1 returning id`, [pA])).rows.length === 1);
await expect('client cannot change branding', async () =>
  (await as(U.cal, `update practices set name='x' returning id`)).rows.length === 0);

// lessons
await as(U.ana, `insert into lessons (practice_id, title, published) values ($1,'Pub',true),($1,'Draft',false)`, [pA]);
await expect('client sees only published lessons', async () => {
  const r = await as(U.cal, 'select title from lessons'); return r.rows.length === 1 && r.rows[0].title === 'Pub';
});
await expect('other practice client sees no lessons', async () => (await as(U.dee, 'select * from lessons')).rows.length === 0);

await expect('new practices get a 7-day trial', async () => {
  const r = await as(U.ana, `select extract(day from trial_ends_at - created_at) as d from practices where id=$1`, [pA]); return Number(r.rows[0].d) === 7;
});
await expect('owner can set background, card and text colors', async () =>
  (await as(U.ana, `update practices set bg_color='#FAF7F2', surface_color='#FFFFFF', text_color='#2B2321' where id=$1 returning id`, [pA])).rows.length === 1);
await throws('colors must be valid codes', () => as(U.ana, `update practices set bg_color='red' where id=$1`, [pA]));
await expect('invite page shows practice colors', async () => {
  const r = await as(null, 'select bg_color from invite_preview($1)', [cB.invite_code]); return r.rows[0].bg_color === '#F4F6F5';
});

// lessons for specific clients / phases
const cA2 = (await as(U.ana, `insert into clients (practice_id, first_name) values ($1,'Second') returning id, invite_code`, [pA])).rows[0];
const U2 = '66666666-6666-6666-6666-666666666666';
await db.query('insert into auth.users values ($1)', [U2]);
await as(U2, 'select claim_invite($1)', [cA2.invite_code]);
await as(U.ana, `insert into lessons (practice_id, title, published, all_phases, client_ids) values ($1,'Just for Cal',true,false,$2)`, [pA, [cA.id]]);
const resetPhase = (await as(U.ana, `select id from template_phases where practice_id=$1 and position=1`, [pA])).rows[0];
await as(U.ana, `update clients set current_phase_id=$1 where id=$2`, [resetPhase.id, cA2.id]);
await as(U.ana, `insert into lessons (practice_id, title, published, all_phases, phase_ids) values ($1,'Reset only',true,false,$2)`, [pA, [resetPhase.id]]);
await expect('client sees lesson shared with them', async () =>
  (await as(U.cal, `select title from lessons where title='Just for Cal'`)).rows.length === 1);
await blocked('other client cannot read a lesson shared with someone else', () => as(U2, `select title from lessons where title='Just for Cal'`));
await expect('client in the phase sees the phase lesson', async () =>
  (await as(U2, `select title from lessons where title='Reset only'`)).rows.length === 1);
await blocked('client not in that phase cannot read the phase lesson', () => as(U.cal, `select title from lessons where title='Reset only'`));
await as(U.ben, `insert into lessons (practice_id, title, published, all_phases, client_ids) values ($1,'B targets A client',true,false,$2)`, [pB, [cA.id]]);
await blocked('another practice cannot push a lesson to your client', () => as(U.cal, `select title from lessons where title='B targets A client'`));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
