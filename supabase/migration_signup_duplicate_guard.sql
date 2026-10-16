create unique index if not exists profiles_name_unique_ci
on public.profiles (lower(btrim(name)))
where btrim(name) <> '';

create or replace function public.signup_name_exists(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select case
    when nullif(btrim(p_name), '') is null then false
    else
      exists (
        select 1
        from public.profiles
        where lower(btrim(name)) = lower(btrim(p_name))
      )
      or exists (
        select 1
        from auth.users
        where lower(btrim(raw_user_meta_data->>'full_name')) = lower(btrim(p_name))
      )
  end;
$$;

revoke all on function public.signup_name_exists(text) from public;
grant execute on function public.signup_name_exists(text) to anon, authenticated;
