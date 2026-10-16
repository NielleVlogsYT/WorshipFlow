# WorshipFlow v4 — Corrected Supabase Signup Architecture

## What changed from v3

The v3 version used a database trigger on `auth.users` to create the musician and positions. That trigger caused the Supabase error:

> Database error saving new user

v4 removes that trigger completely.

New flow:

1. Supabase Auth creates the account.
2. The browser receives an authenticated session.
3. The browser calls the secure `bootstrap_my_account()` RPC.
4. The RPC creates the profile, musician and signup-selected positions.
5. Future logins call the same RPC, but it does nothing when the account is already linked to a musician.

This prevents a bad position ID or musician insert from aborting Auth signup.

## 1. Run the migration

Use the SAME Supabase project as your current app.

Open:

`supabase/schema_v4.sql`

Run the whole file in Supabase SQL Editor.

**Do not delete your existing schedules or musicians.**

The migration explicitly removes the old `on_auth_user_created` trigger.

## 2. Important: v3 trigger removal

The SQL contains:

```sql
drop trigger if exists on_auth_user_created on auth.users;
```

This is intentional. Do not recreate the old v3 trigger.

## 3. Configure the frontend

Edit:

`js/config.js`

```js
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY";
```

Use only the browser-safe anon/publishable key.

Never put a service_role/secret key in Vercel frontend code.

## 4. Supabase Auth settings

Supabase Dashboard → Authentication → URL Configuration:

- Site URL: your Vercel URL
- Add your app URL to Redirect URLs for email confirmation and password resets.

For initial testing you may temporarily disable email confirmation, then turn it back on for production.

For an existing v4 database, run `supabase/migration_profile_self_management.sql` to enable profile editing and allow users to manage only their own musician positions. New installations can use the updated `supabase/schema_v4.sql`.

For an existing database, also run `supabase/migration_signup_duplicate_guard.sql` to enable case-insensitive duplicate-name checks and uniqueness for profile names. The signup name check also checks existing Auth users. Supabase Auth prevents duplicate email accounts; the signup form detects Supabase's duplicate-email response and asks the user to log in or use another address.

Email changes follow the project's Supabase confirmation settings. When confirmation is required, users must verify the new address before it becomes active. Password changes require the current password.

## 5. Test signup

Create a new account:

- Full name
- Email
- Password
- One or more dedicated positions

Signup rejects an email that already has an account and a name that is already in use (ignoring capitalization and surrounding spaces).

Example:

`Juan Dela Cruz`

`Drummer + Bass`

After successful signup/login, the account will have:

- `auth.users` account
- `profiles` record
- `musicians` record
- `musician_positions` records

No Auth database trigger is involved.

## 6. First admin

After signing up, run:

```sql
update public.profiles
set role = 'admin'
where email = 'YOUR_EMAIL_HERE';
```

Then log out and log in again.

## 7. Existing users/musicians

Existing v1/v2 musicians and schedules are preserved.

Existing musicians are not automatically converted into Auth users. Admin can continue managing them from the Musicians screen.

A newly registered user receives a new musician record automatically through `bootstrap_my_account()`.

## 8. Admin capabilities

- User Management
- Change user name
- Change role
- Activate/deactivate user
- Change dedicated positions
- Edit musicians
- Permanently delete musicians and their linked login accounts
- Create schedules
- Delete schedules and their lineup assignments
- Assign musicians
- View musician availability for schedule dates
- See schedule-conflict alerts when an assigned musician has marked a service date unavailable

## 9. User capabilities

- Login
- Calendar
- View worship lineups
- View My Lineup
- View their dedicated positions
- Mark upcoming Sunday and Thursday services as available or not available on the interactive Availability calendar, then save the changes

The Availability tab is available to accounts linked to a musician. Admins can see who is available or unavailable for a selected date while creating or editing a schedule.

Musicians without a saved status for a service date are treated as available. A musician marked unavailable cannot be selected for that date, and admins must fill every position before saving a schedule.

If an assigned musician later marks a service date as unavailable, administrators are alerted on the dashboard, and the affected service is marked with a circled exclamation point on the dashboard and calendar.

If the availability table already exists but the calendar displays a missing `status` column error, run `supabase/migration_availability_status.sql` in Supabase SQL Editor, then reload the app. For a new setup, run `supabase/schema_v4.sql`.

## 10. Schedule assignment emails

The app sends an assignment email to each musician when they are newly added to a schedule. If an existing schedule's service date changes, the current lineup is notified of the new date. A daily reminder is sent one day before the service.

Emails are sent through a Supabase Edge Function and a free Google Apps Script web app that sends from your Gmail account. No custom domain or paid email provider is required. Only active accounts linked to an assigned musician and containing an email address can receive messages; musicians without a linked account are reported as email failures. Google's Gmail and Apps Script sending quotas and usage policies apply and can change.

1. Sign in to [Google Apps Script](https://script.google.com/) with the Gmail account you want to send from. Create a project and replace the contents of `Code.gs` with `google-apps-script/Code.gs` from this repository.
2. In the Apps Script project, open **Project Settings → Script Properties** and add `SCHEDULE_EMAIL_SECRET` with a new, long random value. Keep this value private.
3. Select **Deploy → New deployment → Web app**. Set **Execute as** to your account and **Who has access** to **Anyone**, then deploy and authorize Gmail sending. Copy the Web app URL ending in `/exec`. Requests require the secret from step 2, so keep it private and only configure the endpoint in Supabase.
4. Link the Supabase project with the Supabase CLI and set the Edge Function secrets. Use a different new random value for the cron secret:

   ```sh
   npx supabase link --project-ref qbfngnpdifalpncnbfcb
   npx supabase secrets set GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycbzGdeYHXlDjUH0SXtK7gnxY1-vhWCWGO7RK73dC-uB81laleX593IiAZT35qmWkIaWDmQ/exec GOOGLE_APPS_SCRIPT_SECRET=Crestia09 SCHEDULE_EMAIL_CRON_SECRET=Crestia09 SCHEDULE_TIME_ZONE=SGT
   npx supabase functions deploy schedule-email --no-verify-jwt
   npx supabase functions deploy delete-musician
   ```

   Replace the placeholder values with the `/exec` URL and secret from steps 2–3. The email function validates administrator sessions itself. The `delete-musician` function also checks for an active administrator and uses the project's server-side service role key to delete linked accounts; never put that key in frontend files.
5. In Supabase Dashboard, enable the Vault extension. In SQL Editor, store the project URL and the same random cron secret using Vault:

   ```sql
   select vault.create_secret('https://qbfngnpdifalpncnbfcb.supabase.co', 'worshipflow_supabase_url');
   select vault.create_secret('Crestia09', 'worshipflow_schedule_email_cron_secret');
   ```

6. Run `supabase/migration_schedule_email_notifications.sql` in SQL Editor. It creates a private reminder log and a daily Supabase Cron job. The job runs at 09:00 UTC by default; change its cron expression if your team prefers another reminder time. Set `SCHEDULE_TIME_ZONE` to your team's IANA time zone so the reminder targets the correct day.
7. Create or update a schedule and confirm that assigned musicians receive email. Check the Supabase Edge Function logs and Apps Script execution logs if delivery fails.

## 11. Deployment

After applying the required SQL migration:

1. Update `js/config.js`.
2. Upload/redeploy the v4 files to Vercel.
3. Test a NEW signup.
4. Check Supabase Authentication → Users.
5. Check `profiles`, `musicians`, and `musician_positions` tables.

## 12. If signup still fails

Because v4 has no `auth.users` trigger, an Auth signup should no longer fail with the old database-trigger error.

If it fails, check the exact error shown by `supabaseClient.auth.signUp()` in the browser. Do not use Realtime logs to diagnose Auth signup.
