-- Run this once in Supabase → SQL Editor (after 0001).
-- 1. Separate brand colors for buttons, background, cards and text.
-- 2. Free trial is 7 days.

alter table public.practices
  add column if not exists bg_color text not null default '#F4F6F5' check (bg_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists surface_color text not null default '#FFFFFF' check (surface_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists text_color text not null default '#17201F' check (text_color ~ '^#[0-9A-Fa-f]{6}$');

grant select (bg_color, surface_color, text_color) on public.practices to authenticated;
grant update (bg_color, surface_color, text_color) on public.practices to authenticated;

alter table public.practices alter column trial_ends_at set default (now() + interval '7 days');

-- Practices still on the old 60-day trial move to 7 days from when they signed up.
update public.practices
  set trial_ends_at = created_at + interval '7 days'
  where subscription_status = 'trialing' and trial_ends_at > created_at + interval '7 days';

-- Invite page shows the practice's full color set.
drop function if exists public.invite_preview(text);
create function public.invite_preview(code text)
returns table (practice_name text, logo_url text, brand_color text, bg_color text, surface_color text, text_color text,
               client_first_name text, claimed boolean)
language sql stable security definer set search_path = public as $$
  select p.name, p.logo_url, p.brand_color, p.bg_color, p.surface_color, p.text_color, c.first_name, c.user_id is not null
  from clients c join practices p on p.id = c.practice_id
  where c.invite_code = code and not c.archived;
$$;
grant execute on function public.invite_preview(text) to anon, authenticated;
