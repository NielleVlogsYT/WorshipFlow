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
- Add your Vercel URL to Redirect URLs if email confirmation is enabled.

For initial testing you may temporarily disable email confirmation, then turn it back on for production.

## 5. Test signup

Create a new account:

- Full name
- Email
- Password
- One or more dedicated positions

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
- Archive musicians
- Create schedules
- Delete schedules and their lineup assignments
- Assign musicians
- View musician availability for schedule dates

## 9. User capabilities

- Login
- Calendar
- View worship lineups
- View My Lineup
- View their dedicated positions
- Mark upcoming Sunday and Thursday services as available or not available on the interactive Availability calendar, then save the changes

The Availability tab is available to accounts linked to a musician. Admins can see who is available or unavailable for a selected date while creating or editing a schedule.

Musicians without a saved status for a service date are treated as available. A musician marked unavailable cannot be selected for that date, and admins must fill every position before saving a schedule.

If the availability table already exists but the calendar displays a missing `status` column error, run `supabase/migration_availability_status.sql` in Supabase SQL Editor, then reload the app. For a new setup, run `supabase/schema_v4.sql`.

## 10. Deployment

After applying the required SQL migration:

1. Update `js/config.js`.
2. Upload/redeploy the v4 files to Vercel.
3. Test a NEW signup.
4. Check Supabase Authentication → Users.
5. Check `profiles`, `musicians`, and `musician_positions` tables.

## 11. If signup still fails

Because v4 has no `auth.users` trigger, an Auth signup should no longer fail with the old database-trigger error.

If it fails, check the exact error shown by `supabaseClient.auth.signUp()` in the browser. Do not use Realtime logs to diagnose Auth signup.
