-- Run once in Supabase → SQL Editor (after 0002).
-- Lessons can be shared with specific clients, and the database (not just the app)
-- decides which client can read which lesson.

alter table public.lessons add column if not exists client_ids uuid[] not null default '{}';

drop policy if exists lessons_client_read on public.lessons;
create policy lessons_client_read on public.lessons for select
  using (
    published
    and exists (
      select 1 from public.clients c
      where c.user_id = auth.uid()
        and c.practice_id = lessons.practice_id
        and not c.archived
        and (
          lessons.all_phases
          or c.id = any (lessons.client_ids)
          or (c.current_phase_id is not null and c.current_phase_id = any (lessons.phase_ids))
        )
    )
  );
