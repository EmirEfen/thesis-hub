-- Anonymous visitors do not need to call the helper functions (already applied to the live project).
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.my_student_id() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_student_id() to authenticated;
