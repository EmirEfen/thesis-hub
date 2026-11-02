-- Thesis Hub: schema + row-level security.
-- Run once in Supabase: SQL Editor > New query > paste > Run.

create table public.admins (
  email text primary key
);

create table public.intakes (
  id uuid primary key default gen_random_uuid(),
  label text not null,                                  -- e.g. "June 2027 defenses"
  defense text not null check (defense in ('June','January')),
  year int not null,
  created_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.intakes(id) on delete cascade,
  name text not null,
  email text not null,
  invited_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index students_email_key on public.students (lower(email));

create table public.thesis_info (
  student_id uuid primary key references public.students(id) on delete cascade,
  title text,
  design text,
  iv text,
  dv text,
  moderator text,
  mediator text,
  other_variables text,
  status text check (status in ('on_track','stuck','waiting_on_supervisor')),
  status_note text,
  updated_at timestamptz not null default now()
);

create table public.meeting_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  meeting_date date not null,
  done text,
  look_at text,
  questions text,
  next_steps text,
  created_at timestamptz not null default now()
);

create table public.note_comments (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.meeting_notes(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- Length limits (stops oversized pastes)
alter table public.thesis_info add constraint thesis_len check (
  coalesce(length(title),0) <= 300 and coalesce(length(design),0) <= 300 and
  coalesce(length(iv),0) <= 500 and coalesce(length(dv),0) <= 500 and
  coalesce(length(moderator),0) <= 500 and coalesce(length(mediator),0) <= 500 and
  coalesce(length(other_variables),0) <= 1000 and coalesce(length(status_note),0) <= 1000);
alter table public.meeting_notes add constraint notes_len check (
  coalesce(length(done),0) <= 3000 and coalesce(length(look_at),0) <= 1000 and
  coalesce(length(questions),0) <= 3000 and coalesce(length(next_steps),0) <= 3000);

-- Helpers
create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.admins a
                 where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email','')));
$$;

create function public.my_student_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select s.id from public.students s
  where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email',''))
  limit 1;
$$;

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end $$;
create trigger thesis_info_touch before update on public.thesis_info
  for each row execute function public.touch_updated_at();

-- Lock everything down, then open only what the policies allow
alter table public.admins        enable row level security;
alter table public.intakes       enable row level security;
alter table public.students      enable row level security;
alter table public.thesis_info   enable row level security;
alter table public.meeting_notes enable row level security;
alter table public.note_comments enable row level security;

revoke all on all tables in schema public from anon;
revoke all on public.admins from authenticated;
revoke execute on all functions in schema public from anon;

-- Admin (you): full access
create policy admin_intakes  on public.intakes       for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_students on public.students      for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_thesis   on public.thesis_info   for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_notes    on public.meeting_notes for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_comments on public.note_comments for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Students: only their own rows
create policy student_self   on public.students      for select to authenticated using (id = public.my_student_id());
create policy student_thesis_r on public.thesis_info for select to authenticated using (student_id = public.my_student_id());
create policy student_thesis_i on public.thesis_info for insert to authenticated with check (student_id = public.my_student_id());
create policy student_thesis_u on public.thesis_info for update to authenticated using (student_id = public.my_student_id()) with check (student_id = public.my_student_id());
create policy student_notes_r on public.meeting_notes for select to authenticated using (student_id = public.my_student_id());
create policy student_notes_i on public.meeting_notes for insert to authenticated with check (student_id = public.my_student_id());
create policy student_notes_u on public.meeting_notes for update to authenticated using (student_id = public.my_student_id()) with check (student_id = public.my_student_id());
create policy student_comments_r on public.note_comments for select to authenticated
  using (exists (select 1 from public.meeting_notes n where n.id = note_id and n.student_id = public.my_student_id()));

-- After running this, add yourself as the admin (use your own login email):
--   insert into public.admins (email) values ('you@university.nl');
