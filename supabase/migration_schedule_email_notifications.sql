create table if not exists public.schedule_email_reminders (
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  musician_id uuid not null references public.musicians(id) on delete cascade,
  recipient_email text not null,
  service_date date not null,
  sent_at timestamptz not null default now(),
  primary key (schedule_id, musician_id, recipient_email, service_date)
);

alter table public.schedule_email_reminders enable row level security;
grant all on public.schedule_email_reminders to service_role;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname = 'worshipflow-schedule-reminders';

select cron.schedule(
  'worshipflow-schedule-reminders',
  '0 9 * * *',
  $job$
    select net.http_post(
      url := rtrim(
        (select decrypted_secret from vault.decrypted_secrets where name = 'worshipflow_supabase_url'),
        '/'
      ) || '/functions/v1/schedule-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'worshipflow_schedule_email_cron_secret'
        )
      ),
      body := '{"type":"daily_reminders"}'::jsonb
    );
  $job$
);
