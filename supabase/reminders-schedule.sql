-- One-time setup for daily reminder emails. Run it in the Supabase SQL Editor AFTER
-- the main setup (schema.sql), and after doing the three steps in supabase/README.md
-- ("Daily reminder emails"): enable the pg_cron and pg_net extensions, and create a
-- Resend account.
--
-- 1. Store the Resend API key in Supabase Vault. Replace re_XXXX with your key.
--    (Run this line once. Never put the key anywhere else.)
--      select vault.create_secret('re_XXXX', 'resend_api_key');
--
-- 2. Tell the job where the app lives and which address to send from.
--    "from" must be an address Resend allows for your account
--    (for testing: 'TC Assistant <onboarding@resend.dev>').
insert into public.reminder_config (id, app_url, from_address)
values (1, 'https://tcai-ten.vercel.app', 'TC Assistant <onboarding@resend.dev>')
on conflict (id) do update set app_url = excluded.app_url, from_address = excluded.from_address;

-- 3. Run the check every hour, at five past. It only sends to people whose chosen
--    hour it is, and never twice in one day.
select cron.unschedule('tc-assistant-reminders')
  where exists (select 1 from cron.job where jobname = 'tc-assistant-reminders');
select cron.schedule('tc-assistant-reminders', '5 * * * *', $$ select app_private.send_due_reminders(); $$);
