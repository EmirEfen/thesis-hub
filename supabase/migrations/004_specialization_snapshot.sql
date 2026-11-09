-- Specialization choice and a short thesis snapshot (replaces the working title in the app).
alter table public.thesis_info
  add column specialization text check (specialization in ('Strategic marketing','HDS','Supply-Chain','HFIM')),
  add column snapshot text;

update public.thesis_info set snapshot = title where snapshot is null and title is not null;

alter table public.thesis_info drop constraint thesis_len;
alter table public.thesis_info add constraint thesis_len check (
  coalesce(length(title),0) <= 300 and coalesce(length(snapshot),0) <= 1000 and coalesce(length(design),0) <= 300 and
  coalesce(length(iv),0) <= 500 and coalesce(length(dv),0) <= 500 and
  coalesce(length(moderator),0) <= 500 and coalesce(length(mediator),0) <= 500 and
  coalesce(length(other_variables),0) <= 1000 and coalesce(length(status_note),0) <= 1000);
