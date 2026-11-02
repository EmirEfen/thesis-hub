-- Run after 001_init.sql. Adds section progress, reminder log, and a keep-alive ping.

create table public.section_progress (
  student_id uuid not null references public.students(id) on delete cascade,
  section text not null check (section in
    ('introduction','literature_review','methods','data_collection','results','general_discussion')),
  state text not null check (state in ('not_started','in_progress','with_supervisor','done')),
  updated_at timestamptz not null default now(),
  primary key (student_id, section)
);
create trigger section_progress_touch before update on public.section_progress
  for each row execute function public.touch_updated_at();

create table public.reminders_log (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  kind text not null check (kind in ('note','snapshot','checkin')),
  sent_at timestamptz not null default now()
);

alter table public.section_progress enable row level security;
alter table public.reminders_log   enable row level security;

create policy admin_progress on public.section_progress for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy student_progress_r on public.section_progress for select to authenticated
  using (student_id = public.my_student_id());
create policy student_progress_i on public.section_progress for insert to authenticated
  with check (student_id = public.my_student_id());
create policy student_progress_u on public.section_progress for update to authenticated
  using (student_id = public.my_student_id()) with check (student_id = public.my_student_id());

-- Only you can read the log. The remind function writes to it with the service key.
create policy admin_reminders_r on public.reminders_log for select to authenticated using (public.is_admin());

revoke all on public.section_progress, public.reminders_log from anon;

-- Harmless function a scheduled job calls every few days so the free project does not pause.
create function public.ping() returns int language sql stable security definer set search_path = ''
as $$ select 1 $$;
grant execute on function public.ping() to anon, authenticated;
