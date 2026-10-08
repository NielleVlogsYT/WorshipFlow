
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  role text not null default 'user' check (role in ('admin','user')),
  musician_id uuid references public.musicians(id) on delete set null,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists name text not null default '';
alter table public.profiles add column if not exists email text not null default '';
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists musician_id uuid references public.musicians(id) on delete set null;
alter table public.profiles add column if not exists status text not null default 'active';
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();


drop trigger if exists on_auth_user_created on auth.users;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  return new;
end;
$$;

create or replace function public.bootstrap_my_account()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  u auth.users%rowtype;
  p public.profiles%rowtype;
  m_id uuid;
  requested_name text;
  requested_positions jsonb;
  position_value text;
  p_id uuid;
begin
  select * into u from auth.users where id = auth.uid();

  if u.id is null then
    raise exception 'Not authenticated';
  end if;

  requested_name := trim(coalesce(u.raw_user_meta_data->>'full_name', ''));
  if requested_name = '' then
    requested_name := split_part(coalesce(u.email, 'User'), '@', 1);
  end if;

  select * into p from public.profiles where id = u.id;

  if p.id is not null and p.musician_id is not null then
    return p;
  end if;

  insert into public.musicians(name, active)
  values(requested_name, true)
  returning id into m_id;

  insert into public.profiles(id, name, email, role, musician_id, status)
  values(u.id, requested_name, coalesce(u.email,''), 'user', m_id, 'active')
  on conflict (id) do update set
    name = excluded.name,
    email = excluded.email,
    musician_id = excluded.musician_id,
    updated_at = now();

  requested_positions := case
    when jsonb_typeof(u.raw_user_meta_data->'position_ids') = 'array'
      then u.raw_user_meta_data->'position_ids'
    else '[]'::jsonb
  end;

  for position_value in
    select value from jsonb_array_elements_text(requested_positions)
  loop
    begin
      p_id := position_value::uuid;
      if exists(select 1 from public.positions where id = p_id) then
        insert into public.musician_positions(musician_id, position_id)
        values(m_id, p_id)
        on conflict do nothing;
      end if;
    exception when invalid_text_representation then
      null;
    end;
  end loop;

  select * into p from public.profiles where id = u.id;
  return p;
end;
$$;

grant execute on function public.bootstrap_my_account() to authenticated;

-- Admin helper. SECURITY DEFINER avoids RLS recursion when checking profiles.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and status = 'active'
  );
$$;

grant execute on function public.is_admin() to authenticated;

create table if not exists public.musician_availability (
  musician_id uuid not null references public.musicians(id) on delete cascade,
  service_date date not null,
  status text not null default 'available' check (status in ('available','not_available')),
  created_at timestamptz not null default now(),
  primary key (musician_id, service_date),
  check (extract(dow from service_date) in (0, 4))
);
alter table public.musician_availability
  add column if not exists status text not null default 'available'
  check (status in ('available','not_available'));

do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('positions','profiles','musicians','musician_positions','schedules','schedule_assignments','musician_availability')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

alter table public.positions enable row level security;
drop policy if exists "positions authenticated read" on public.positions;
create policy "positions authenticated read" on public.positions
for select to anon, authenticated using (true);

-- Profiles
alter table public.profiles enable row level security;
drop policy if exists "profiles own read" on public.profiles;
drop policy if exists "profiles admin read" on public.profiles;
drop policy if exists "profiles admin update" on public.profiles;
drop policy if exists "profiles own update" on public.profiles;
create policy "profiles own read" on public.profiles
for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles admin update" on public.profiles
for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- No client INSERT policy: bootstrap_my_account() is the only profile creation path.

-- Musicians
alter table public.musicians enable row level security;
drop policy if exists "musicians authenticated read" on public.musicians;
drop policy if exists "musicians admin write" on public.musicians;
create policy "musicians authenticated read" on public.musicians
for select to authenticated using (true);
create policy "musicians admin write" on public.musicians
for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Musician positions
alter table public.musician_positions enable row level security;
drop policy if exists "musician_positions authenticated read" on public.musician_positions;
drop policy if exists "musician_positions admin write" on public.musician_positions;
create policy "musician_positions authenticated read" on public.musician_positions
for select to authenticated using (true);
create policy "musician_positions admin write" on public.musician_positions
for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Schedules
alter table public.schedules enable row level security;
drop policy if exists "schedules authenticated read" on public.schedules;
drop policy if exists "schedules admin write" on public.schedules;
create policy "schedules authenticated read" on public.schedules
for select to authenticated using (true);
create policy "schedules admin write" on public.schedules
for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Assignments
alter table public.schedule_assignments enable row level security;
drop policy if exists "assignments authenticated read" on public.schedule_assignments;
drop policy if exists "assignments admin write" on public.schedule_assignments;
create policy "assignments authenticated read" on public.schedule_assignments
for select to authenticated using (true);
create policy "assignments admin write" on public.schedule_assignments
for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Musicians can manage only their own future Sunday/Thursday availability.
alter table public.musician_availability enable row level security;
drop policy if exists "availability owner or admin read" on public.musician_availability;
drop policy if exists "availability owner insert" on public.musician_availability;
drop policy if exists "availability owner update" on public.musician_availability;
drop policy if exists "availability owner delete" on public.musician_availability;
create policy "availability owner or admin read" on public.musician_availability
for select to authenticated using (
  public.is_admin()
  or exists(
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.musician_id = musician_availability.musician_id
  )
);
create policy "availability owner insert" on public.musician_availability
for insert to authenticated with check (
  exists(
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.musician_id = musician_availability.musician_id
  )
  and musician_availability.service_date >= current_date
);
create policy "availability owner update" on public.musician_availability
for update to authenticated using (
  exists(
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.musician_id = musician_availability.musician_id
  )
  and musician_availability.service_date >= current_date
) with check (
  exists(
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.musician_id = musician_availability.musician_id
  )
  and musician_availability.service_date >= current_date
);
create policy "availability owner delete" on public.musician_availability
for delete to authenticated using (
  exists(
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.musician_id = musician_availability.musician_id
  )
);

--index for lineup queries.
create index if not exists idx_profiles_musician_id on public.profiles(musician_id);
create index if not exists idx_assignments_musician_id on public.schedule_assignments(musician_id);
create index if not exists idx_assignments_schedule_id on public.schedule_assignments(schedule_id);
create index if not exists idx_musician_availability_service_date on public.musician_availability(service_date);
