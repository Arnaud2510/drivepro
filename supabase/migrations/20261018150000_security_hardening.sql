-- Security hardening suggested by the Supabase advisor.

-- Pin search_path on the remaining plpgsql helpers.
alter function public.set_updated_at() set search_path = public;
alter function public.guard_member_update() set search_path = public;
alter function public.check_earning_owner() set search_path = public;

-- Trigger functions are not part of the API: triggers still fire, but nobody can call them via /rpc.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.audit_reference_change() from public, anon, authenticated;
