-- Run once in Supabase SQL Editor when musician_availability already exists
-- without the status column.
alter table public.musician_availability
  add column if not exists status text not null default 'available';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'musician_availability_status_check'
      and conrelid = 'public.musician_availability'::regclass
  ) then
    alter table public.musician_availability
      add constraint musician_availability_status_check
      check (status in ('available', 'not_available'));
  end if;
end $$;

alter table public.musician_availability enable row level security;

drop policy if exists "availability owner or admin read" on public.musician_availability;
drop policy if exists "availability owner insert" on public.musician_availability;
drop policy if exists "availability owner update" on public.musician_availability;
drop policy if exists "availability owner delete" on public.musician_availability;

create policy "availability owner or admin read" on public.musician_availability
for select to authenticated using (
  public.is_admin()
  or exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.musician_id = musician_availability.musician_id
  )
);

create policy "availability owner insert" on public.musician_availability
for insert to authenticated with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.musician_id = musician_availability.musician_id
  )
  and musician_availability.service_date >= current_date
);

create policy "availability owner update" on public.musician_availability
for update to authenticated using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.musician_id = musician_availability.musician_id
  )
  and musician_availability.service_date >= current_date
) with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.musician_id = musician_availability.musician_id
  )
  and musician_availability.service_date >= current_date
);

create policy "availability owner delete" on public.musician_availability
for delete to authenticated using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.musician_id = musician_availability.musician_id
  )
);
