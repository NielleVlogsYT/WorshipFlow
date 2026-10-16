create or replace function public.update_my_profile(p_name text)
returns public.profiles
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  updated_profile public.profiles%rowtype;
  current_email text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Name is required';
  end if;

  select email into current_email
  from auth.users
  where id = auth.uid();

  update public.profiles
  set name = trim(p_name),
      email = coalesce(current_email, email),
      updated_at = now()
  where id = auth.uid()
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'Profile not found';
  end if;

  if updated_profile.musician_id is not null then
    update public.musicians
    set name = trim(p_name)
    where id = updated_profile.musician_id;
  end if;

  return updated_profile;
end;
$$;

revoke all on function public.update_my_profile(text) from public;
grant execute on function public.update_my_profile(text) to authenticated;

drop policy if exists "musician_positions owner insert" on public.musician_positions;
drop policy if exists "musician_positions owner update" on public.musician_positions;
drop policy if exists "musician_positions owner delete" on public.musician_positions;

create policy "musician_positions owner insert" on public.musician_positions
for insert to authenticated with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.musician_id = musician_positions.musician_id
  )
);

create policy "musician_positions owner update" on public.musician_positions
for update to authenticated using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.musician_id = musician_positions.musician_id
  )
) with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.musician_id = musician_positions.musician_id
  )
);

create policy "musician_positions owner delete" on public.musician_positions
for delete to authenticated using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.musician_id = musician_positions.musician_id
  )
);
