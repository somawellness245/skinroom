-- Skinroom schema
-- One database shared by every practice. Row-level security keeps each
-- practice's data visible only to its own members and to each client's own login.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.practices (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  logo_url text,
  brand_color text not null default '#1E5C57' check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  checkin_every_days int not null default 30 check (checkin_every_days between 7 and 120),
  quiet_after_days int not null default 45 check (quiet_after_days between 14 and 180),
  send_reminders boolean not null default true,
  booking_url text,
  shop_url text,
  -- billing (written only by the server with the service key)
  subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing','active','past_due','canceled')),
  trial_ends_at timestamptz not null default (now() + interval '60 days'),
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);

create table public.practice_members (
  practice_id uuid not null references public.practices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','staff')),
  display_name text,
  created_at timestamptz not null default now(),
  primary key (practice_id, user_id)
);

create table public.plan_templates (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table public.template_phases (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.plan_templates(id) on delete cascade,
  practice_id uuid not null references public.practices(id) on delete cascade,
  position int not null,
  name text not null,
  focus text,
  description text,
  duration_label text,
  checkin_every_days int check (checkin_every_days between 7 and 120)
);
create index on public.template_phases (template_id, position);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  first_name text not null,
  last_name text,
  email text,
  location text,
  main_concern text,
  goal text,
  sensitivities text,
  fitzpatrick text,
  is_virtual boolean not null default true,
  started_on date not null default current_date,
  plan_template_id uuid references public.plan_templates(id) on delete set null,
  current_phase_id uuid references public.template_phases(id) on delete set null,
  phase_started_on date,
  next_checkin_on date,
  invite_code text not null unique default replace(gen_random_uuid()::text, '-', ''),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.clients (practice_id);
create unique index clients_one_login_per_practice on public.clients (practice_id, user_id) where user_id is not null;

create table public.practitioner_notes (
  client_id uuid primary key references public.clients(id) on delete cascade,
  practice_id uuid not null references public.practices(id) on delete cascade,
  body text not null default '',
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  name text not null,
  category text,
  size text,
  lasts_days int check (lasts_days between 1 and 730),
  shop_url text,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.regimen_steps (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  practice_id uuid not null references public.practices(id) on delete cascade,
  time_of_day text not null check (time_of_day in ('am','pm')),
  position int not null default 0,
  product_id uuid references public.products(id) on delete set null,
  label text not null,
  instructions text,
  frequency text,
  supply_started_on date,
  created_at timestamptz not null default now()
);
create index on public.regimen_steps (client_id);

create table public.routine_checks (
  client_id uuid not null references public.clients(id) on delete cascade,
  step_id uuid not null references public.regimen_steps(id) on delete cascade,
  on_date date not null,
  primary key (step_id, on_date)
);

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  practice_id uuid not null references public.practices(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  nights_followed text check (nights_followed in ('0-2','3-4','5-6','7')),
  concern_change text check (concern_change in ('worse','same','better')),
  reactions text[] not null default '{}',
  note text,
  reviewed_at timestamptz,
  response text
);
create index on public.checkins (practice_id, submitted_at desc);
create index on public.checkins (client_id, submitted_at desc);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  practice_id uuid not null references public.practices(id) on delete cascade,
  checkin_id uuid references public.checkins(id) on delete set null,
  kind text not null check (kind in ('baseline','checkin','session')),
  angle text not null check (angle in ('front','left','right','other')),
  storage_path text not null,
  taken_on date not null default current_date,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.photos (client_id, taken_on);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  practice_id uuid not null references public.practices(id) on delete cascade,
  sender_role text not null check (sender_role in ('practitioner','client','system')),
  sender_user_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  read_by_practice_at timestamptz,
  read_by_client_at timestamptz
);
create index on public.messages (client_id, created_at);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  title text not null,
  summary text,
  body text not null default '',
  read_minutes int,
  all_phases boolean not null default true,
  phase_ids uuid[] not null default '{}',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so policies don't recurse)
-- ---------------------------------------------------------------------------

create or replace function public.is_member(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from practice_members where practice_id = p and user_id = auth.uid());
$$;

create or replace function public.is_owner(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from practice_members where practice_id = p and user_id = auth.uid() and role = 'owner');
$$;

create or replace function public.is_my_client(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from clients where id = c and user_id = auth.uid() and not archived);
$$;

create or replace function public.is_client_of(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from clients where practice_id = p and user_id = auth.uid() and not archived);
$$;

-- client row belongs to this practice (guards against mixing ids across practices)
create or replace function public.client_in_practice(c uuid, p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from clients where id = c and practice_id = p);
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.practices enable row level security;
alter table public.practice_members enable row level security;
alter table public.plan_templates enable row level security;
alter table public.template_phases enable row level security;
alter table public.clients enable row level security;
alter table public.practitioner_notes enable row level security;
alter table public.products enable row level security;
alter table public.regimen_steps enable row level security;
alter table public.routine_checks enable row level security;
alter table public.checkins enable row level security;
alter table public.photos enable row level security;
alter table public.messages enable row level security;
alter table public.lessons enable row level security;

-- practices: members and that practice's clients can read; owners edit branding/settings.
create policy practices_read on public.practices for select
  using (is_member(id) or is_client_of(id));
create policy practices_owner_update on public.practices for update
  using (is_owner(id)) with check (is_owner(id));
-- billing columns can't be changed from the browser
revoke update on public.practices from authenticated;
grant update (name, logo_url, brand_color, checkin_every_days, quiet_after_days,
              send_reminders, booking_url, shop_url) on public.practices to authenticated;

-- practice_members: you can see the team of practices you belong to. Created via create_practice().
create policy members_read on public.practice_members for select
  using (is_member(practice_id));

-- plan templates and phases: members manage; clients can read their practice's (to show phase names).
create policy templates_member_all on public.plan_templates for all
  using (is_member(practice_id)) with check (is_member(practice_id));
create policy templates_client_read on public.plan_templates for select
  using (is_client_of(practice_id));
create policy phases_member_all on public.template_phases for all
  using (is_member(practice_id))
  with check (is_member(practice_id)
    and exists (select 1 from plan_templates t where t.id = template_id and t.practice_id = template_phases.practice_id));
create policy phases_client_read on public.template_phases for select
  using (is_client_of(practice_id));

-- clients: members manage their practice's clients; a client can read only their own row.
create policy clients_member_all on public.clients for all
  using (is_member(practice_id)) with check (is_member(practice_id));
create policy clients_self_read on public.clients for select
  using (user_id = auth.uid() and not archived);
-- Only claim_invite() may link a login to a client record.
revoke insert, update on public.clients from authenticated;
grant insert (practice_id, first_name, last_name, email, location, main_concern, goal, sensitivities,
              fitzpatrick, is_virtual, started_on, plan_template_id, current_phase_id,
              phase_started_on, next_checkin_on, archived) on public.clients to authenticated;
grant update (first_name, last_name, email, location, main_concern, goal, sensitivities,
              fitzpatrick, is_virtual, started_on, plan_template_id, current_phase_id,
              phase_started_on, next_checkin_on, archived) on public.clients to authenticated;

-- private notes: members only. Clients never see these.
create policy notes_member_all on public.practitioner_notes for all
  using (is_member(practice_id))
  with check (is_member(practice_id) and client_in_practice(client_id, practice_id));

-- products: members manage; clients read their practice's shelf.
create policy products_member_all on public.products for all
  using (is_member(practice_id)) with check (is_member(practice_id));
create policy products_client_read on public.products for select
  using (is_client_of(practice_id));

-- regimen: members manage; client reads own (reorder changes go through mark_reordered()).
create policy regimen_member_all on public.regimen_steps for all
  using (is_member(practice_id))
  with check (is_member(practice_id) and client_in_practice(client_id, practice_id));
create policy regimen_client_read on public.regimen_steps for select
  using (is_my_client(client_id));

-- routine checks: client manages own; members read.
create policy checks_client_all on public.routine_checks for all
  using (is_my_client(client_id))
  with check (is_my_client(client_id)
    and exists (select 1 from regimen_steps s where s.id = step_id and s.client_id = routine_checks.client_id));
create policy checks_member_read on public.routine_checks for select
  using (exists (select 1 from clients c where c.id = client_id and is_member(c.practice_id)));

-- check-ins: members read/review; client reads own and submits new ones (can't write the response).
create policy checkins_member_all on public.checkins for all
  using (is_member(practice_id))
  with check (is_member(practice_id) and client_in_practice(client_id, practice_id));
create policy checkins_client_read on public.checkins for select
  using (is_my_client(client_id));
create policy checkins_client_insert on public.checkins for insert
  with check (is_my_client(client_id) and client_in_practice(client_id, practice_id)
    and reviewed_at is null and response is null);

-- photos: members manage; client reads own and adds check-in photos (no deleting).
create policy photos_member_all on public.photos for all
  using (is_member(practice_id))
  with check (is_member(practice_id) and client_in_practice(client_id, practice_id));
create policy photos_client_read on public.photos for select
  using (is_my_client(client_id));
create policy photos_client_insert on public.photos for insert
  with check (is_my_client(client_id) and client_in_practice(client_id, practice_id)
    and kind = 'checkin' and uploaded_by = auth.uid()
    and storage_path like practice_id::text || '/' || client_id::text || '/%');

-- messages: members read/send in their practice; client reads own thread and sends as client.
create policy messages_member_read on public.messages for select
  using (is_member(practice_id));
create policy messages_member_insert on public.messages for insert
  with check (is_member(practice_id) and client_in_practice(client_id, practice_id)
    and sender_role in ('practitioner','system') and sender_user_id = auth.uid());
create policy messages_member_update on public.messages for update
  using (is_member(practice_id)) with check (is_member(practice_id));
create policy messages_client_read on public.messages for select
  using (is_my_client(client_id));
create policy messages_client_insert on public.messages for insert
  with check (is_my_client(client_id) and client_in_practice(client_id, practice_id)
    and sender_role = 'client' and sender_user_id = auth.uid());

-- lessons: members manage; clients read published lessons from their practice.
create policy lessons_member_all on public.lessons for all
  using (is_member(practice_id)) with check (is_member(practice_id));
create policy lessons_client_read on public.lessons for select
  using (published and is_client_of(practice_id));

-- ---------------------------------------------------------------------------
-- Actions (functions the app calls)
-- ---------------------------------------------------------------------------

-- New esthetician: create their practice, make them owner, add a starter plan template.
create or replace function public.create_practice(practice_name text, owner_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  p uuid;
  t uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from practice_members where user_id = auth.uid()) then
    raise exception 'You already have a practice';
  end if;
  insert into practices (name) values (practice_name) returning id into p;
  insert into practice_members (practice_id, user_id, role, display_name) values (p, auth.uid(), 'owner', owner_name);

  insert into plan_templates (practice_id, name, description)
    values (p, '4-phase corrective', 'Reset → Prep → Correct → Maintain') returning id into t;
  insert into template_phases (template_id, practice_id, position, name, focus, description, duration_label, checkin_every_days) values
    (t, p, 1, 'Reset', 'Barrier support', 'Calm inflammation, pause strong actives, rebuild tolerance before correcting anything.', '4–8 weeks', 14),
    (t, p, 2, 'Prep', 'Skin conditioning', 'Introduce gentle exfoliation and low-strength actives; confirm the skin can handle more.', '~4 weeks', 30),
    (t, p, 3, 'Correct', 'Goal-focused', 'Target the main concern: pigmentation, acne, texture, fine lines, or scarring.', '3–6+ months', 30),
    (t, p, 4, 'Maintain', 'Ongoing', 'Hold results, simplify the routine, and catch changes early.', 'Ongoing', 42);
  return p;
end;
$$;

-- Invite page: show the practice name/branding for an invite code without signing in.
create or replace function public.invite_preview(code text)
returns table (practice_name text, logo_url text, brand_color text, client_first_name text, claimed boolean)
language sql stable security definer set search_path = public as $$
  select p.name, p.logo_url, p.brand_color, c.first_name, c.user_id is not null
  from clients c join practices p on p.id = c.practice_id
  where c.invite_code = code and not c.archived;
$$;

-- Client accepts an invite after signing up: links their login to the client record.
create or replace function public.claim_invite(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c clients%rowtype;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into c from clients where invite_code = code and not archived for update;
  if not found then raise exception 'This invite link is not valid'; end if;
  if c.user_id is not null and c.user_id <> auth.uid() then
    raise exception 'This invite has already been used';
  end if;
  update clients set user_id = auth.uid() where id = c.id;
  return c.id;
end;
$$;

-- Client says they reordered a product: restarts that product's supply clock.
create or replace function public.mark_reordered(step uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update regimen_steps set supply_started_on = current_date
  where id = step and is_my_client(client_id);
  if not found then raise exception 'Not allowed'; end if;
end;
$$;

-- Client marks messages from their esthetician as read.
create or replace function public.client_mark_read(c uuid)
returns void language sql security definer set search_path = public as $$
  update messages set read_by_client_at = now()
  where client_id = c and is_my_client(c) and sender_role <> 'client' and read_by_client_at is null;
$$;

revoke execute on function public.create_practice(text, text) from anon;
revoke execute on function public.claim_invite(text) from anon;
revoke execute on function public.mark_reordered(uuid) from anon;
revoke execute on function public.client_mark_read(uuid) from anon;
grant execute on function public.invite_preview(text) to anon, authenticated;

-- After a check-in, schedule the next one based on the phase (or the practice default).
create or replace function public.after_checkin()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  days int;
begin
  select coalesce(tp.checkin_every_days, p.checkin_every_days) into days
  from clients c
  join practices p on p.id = c.practice_id
  left join template_phases tp on tp.id = c.current_phase_id
  where c.id = new.client_id;
  update clients set next_checkin_on = (new.submitted_at::date + coalesce(days, 30))
  where id = new.client_id;
  return new;
end;
$$;
create trigger checkins_schedule_next after insert on public.checkins
  for each row execute function public.after_checkin();

-- ---------------------------------------------------------------------------
-- Storage: private photos, public logos/product images
-- Paths: photos/{practice_id}/{client_id}/{file}   branding/{practice_id}/{file}
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('branding', 'branding', true)
  on conflict (id) do nothing;

create policy photos_member_rw on storage.objects for all
  using (bucket_id = 'photos' and is_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'photos' and is_member(((storage.foldername(name))[1])::uuid)
    and client_in_practice(((storage.foldername(name))[2])::uuid, ((storage.foldername(name))[1])::uuid));

create policy photos_client_read on storage.objects for select
  using (bucket_id = 'photos' and is_my_client(((storage.foldername(name))[2])::uuid)
    and client_in_practice(((storage.foldername(name))[2])::uuid, ((storage.foldername(name))[1])::uuid));

create policy photos_client_upload on storage.objects for insert
  with check (bucket_id = 'photos' and is_my_client(((storage.foldername(name))[2])::uuid)
    and client_in_practice(((storage.foldername(name))[2])::uuid, ((storage.foldername(name))[1])::uuid));

create policy branding_member_write on storage.objects for insert
  with check (bucket_id = 'branding' and is_member(((storage.foldername(name))[1])::uuid));
create policy branding_member_update on storage.objects for update
  using (bucket_id = 'branding' and is_member(((storage.foldername(name))[1])::uuid));
create policy branding_member_delete on storage.objects for delete
  using (bucket_id = 'branding' and is_member(((storage.foldername(name))[1])::uuid));

-- Live updates for messages (Supabase Realtime still applies the policies above).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Hardening (from security review)
-- ---------------------------------------------------------------------------

-- Cross-references must stay inside the same practice.
alter table public.plan_templates  add constraint plan_templates_id_practice  unique (id, practice_id);
alter table public.template_phases add constraint template_phases_id_practice unique (id, practice_id);
alter table public.products        add constraint products_id_practice        unique (id, practice_id);
alter table public.checkins        add constraint checkins_id_practice        unique (id, practice_id);

alter table public.template_phases add constraint template_phases_same_practice
  foreign key (template_id, practice_id) references public.plan_templates (id, practice_id) on delete cascade;
alter table public.clients add constraint clients_template_same_practice
  foreign key (plan_template_id, practice_id) references public.plan_templates (id, practice_id) on delete set null (plan_template_id);
alter table public.clients add constraint clients_phase_same_practice
  foreign key (current_phase_id, practice_id) references public.template_phases (id, practice_id) on delete set null (current_phase_id);
alter table public.regimen_steps add constraint regimen_product_same_practice
  foreign key (product_id, practice_id) references public.products (id, practice_id) on delete set null (product_id);
alter table public.photos add constraint photos_checkin_same_practice
  foreign key (checkin_id, practice_id) references public.checkins (id, practice_id) on delete set null (checkin_id);

-- Practices: hide Stripe ids from the browser.
revoke select on public.practices from authenticated, anon;
grant select (id, name, logo_url, brand_color, checkin_every_days, quiet_after_days, send_reminders,
              booking_url, shop_url, subscription_status, trial_ends_at, created_at)
  on public.practices to authenticated;

-- Messages: nobody edits a message after it's sent; estheticians can only mark client messages read.
revoke insert, update on public.messages from authenticated;
grant insert (client_id, practice_id, sender_role, sender_user_id, body) on public.messages to authenticated;
grant update (read_by_practice_at) on public.messages to authenticated;
drop policy messages_member_update on public.messages;
create policy messages_member_update on public.messages for update
  using (is_member(practice_id))
  with check (is_member(practice_id) and client_in_practice(client_id, practice_id));

-- Check-ins: clients can't backdate or forward-date; estheticians only write the review.
revoke insert, update on public.checkins from authenticated;
grant insert (client_id, practice_id, nights_followed, concern_change, reactions, note) on public.checkins to authenticated;
grant update (reviewed_at, response) on public.checkins to authenticated;

-- Helper functions are for the rules above, not for direct calls by signed-out visitors.
revoke execute on function public.is_member(uuid), public.is_owner(uuid), public.is_my_client(uuid),
  public.is_client_of(uuid), public.client_in_practice(uuid, uuid) from public, anon;
grant execute on function public.is_member(uuid), public.is_owner(uuid), public.is_my_client(uuid),
  public.is_client_of(uuid), public.client_in_practice(uuid, uuid) to authenticated;
revoke execute on function public.create_practice(text, text), public.claim_invite(text),
  public.mark_reordered(uuid), public.client_mark_read(uuid) from public;
grant execute on function public.create_practice(text, text), public.claim_invite(text),
  public.mark_reordered(uuid), public.client_mark_read(uuid) to authenticated;

-- Branding uploads (logo replace) need to see their own files.
create policy branding_member_read on storage.objects for select
  using (bucket_id = 'branding' and is_member(((storage.foldername(name))[1])::uuid));
