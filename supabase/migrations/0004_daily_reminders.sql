-- 0004: daily reminder emails. Safe to run more than once.
--
-- A scheduled job INSIDE Supabase (see supabase/reminders-schedule.sql) emails each
-- person who switched reminders on a plain-text list of what is overdue or coming up.
--
--  * Only ever sent to the account's own login email, never to an address typed in.
--  * The email service key lives in Supabase Vault, not in the app.
--  * The sending functions are not callable by logged-in users or visitors, except
--    send_test_reminder(), which can only email YOU and is rate limited.

-- 1. Your choices (these are yours to change) ---------------------------------------
alter table public.settings add column if not exists reminders_enabled boolean not null default false;
alter table public.settings add column if not exists reminder_hour smallint not null default 8;
alter table public.settings add column if not exists reminder_timezone text not null default 'America/New_York';

alter table public.settings drop constraint if exists settings_reminder_ck;
alter table public.settings add constraint settings_reminder_ck check (
  reminder_hour between 0 and 23 and char_length(reminder_timezone) between 1 and 64
);

-- 2. Bookkeeping and setup nobody but the server can touch ----------------------------
create table if not exists public.reminder_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  last_sent  date,
  test_at    timestamptz,
  test_day   date,
  test_count integer not null default 0
);
create table if not exists public.reminder_config (
  id           integer primary key check (id = 1),
  app_url      text,
  from_address text
);
-- Row level security on with no policies = nobody (except the server) can read or write.
alter table public.reminder_state enable row level security;
alter table public.reminder_config enable row level security;
revoke all on public.reminder_state from anon, public, authenticated;
revoke all on public.reminder_config from anon, public, authenticated;

-- 3. The work, in a schema the API does not expose -------------------------------------
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

-- What is overdue or coming up for one person. Mirrors the follow-ups page:
-- open tasks, documents not yet received, and closing dates, on deals that are
-- not archived and are active or pending. Returns null when there is nothing.
create or replace function app_private.reminder_digest(p_user uuid, p_today date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  win int; cutoff date; r record; days int; label text;
  over_lines text[] := '{}'; soon_lines text[] := '{}'; n_over int := 0; n_soon int := 0;
  cfg_url text; body text;
begin
  select coalesce(follow_up_days, 7) into win from settings where user_id = p_user;
  win := coalesce(win, 7);
  cutoff := p_today + win;

  for r in
    select x.deal, x.title, x.due from (
      select t.property_address as deal, k.title, k.due
      from transactions t
      cross join lateral (
        select title, due_date as due from tasks
          where transaction_id = t.id and user_id = p_user and status = 'open' and due_date is not null and due_date <= cutoff
        union all
        select name, due_date from documents
          where transaction_id = t.id and user_id = p_user and status <> 'received' and due_date is not null and due_date <= cutoff
        union all
        select 'Closing date', t.closing_date where t.closing_date is not null and t.closing_date <= cutoff
      ) k
      where t.user_id = p_user and not t.archived and t.status in ('active', 'pending')
    ) x order by x.due, x.deal, x.title
  loop
    days := r.due - p_today;
    label := case when days < 0 then (-days) || case when days = -1 then ' day overdue' else ' days overdue' end
                  when days = 0 then 'due today'
                  else 'due in ' || days || case when days = 1 then ' day' else ' days' end end;
    if days < 0 then
      n_over := n_over + 1;
      if n_over <= 25 then over_lines := over_lines || format('  - %s: %s (%s)', left(regexp_replace(r.deal, '\s+', ' ', 'g'), 80), left(regexp_replace(r.title, '\s+', ' ', 'g'), 120), label); end if;
    else
      n_soon := n_soon + 1;
      if n_soon <= 25 then soon_lines := soon_lines || format('  - %s: %s (%s)', left(regexp_replace(r.deal, '\s+', ' ', 'g'), 80), left(regexp_replace(r.title, '\s+', ' ', 'g'), 120), label); end if;
    end if;
  end loop;

  if n_over + n_soon = 0 then return null; end if;

  select app_url into cfg_url from reminder_config where id = 1;
  body := format('You have %s overdue and %s coming up in the next %s days.', n_over, n_soon, win) || E'\n';
  if n_over > 0 then
    body := body || E'\nOVERDUE (' || n_over || E')\n' || array_to_string(over_lines, E'\n') || E'\n';
    if n_over > 25 then body := body || format('  ...and %s more', n_over - 25) || E'\n'; end if;
  end if;
  if n_soon > 0 then
    body := body || E'\nCOMING UP (' || n_soon || E')\n' || array_to_string(soon_lines, E'\n') || E'\n';
    if n_soon > 25 then body := body || format('  ...and %s more', n_soon - 25) || E'\n'; end if;
  end if;
  if coalesce(cfg_url, '') <> '' then
    body := body || E'\nOpen TC Assistant: ' || cfg_url || E'/follow-ups\nTurn these emails off in Settings: ' || cfg_url || E'/settings\n';
  end if;
  return jsonb_build_object('overdue', n_over, 'soon', n_soon, 'text', body);
end $$;

-- Sends one email to the account's own login address. Returns 'sent', 'empty' or 'unconfigured'.
create or replace function app_private.deliver_reminder(p_user uuid, p_today date, p_send_empty boolean)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare digest jsonb; to_email text; api_key text; sender text; subject text; body text;
begin
  digest := app_private.reminder_digest(p_user, p_today);
  if digest is null and not p_send_empty then return 'empty'; end if;

  select email into to_email from auth.users where id = p_user;
  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  select from_address into sender from reminder_config where id = 1;
  if coalesce(to_email, '') = '' or coalesce(api_key, '') = '' or coalesce(sender, '') = '' then
    raise warning 'reminders: not set up yet (need the Resend key in Vault and a from address in reminder_config)';
    return 'unconfigured';
  end if;

  if digest is null then
    subject := 'TC Assistant: nothing is due';
    body := 'Test email from TC Assistant. Nothing is overdue or coming up right now, so a real reminder would be skipped today.';
  else
    subject := format('TC Assistant: %s overdue, %s coming up', digest->>'overdue', digest->>'soon');
    body := digest->>'text';
  end if;

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || api_key, 'Content-Type', 'application/json'),
    body := jsonb_build_object('from', sender, 'to', jsonb_build_array(to_email), 'subject', subject, 'text', body)
  );
  return 'sent';
end $$;

-- Called by the hourly schedule. Sends to everyone whose chosen hour it is right now
-- (in their own time zone) who has not already had today's email.
create or replace function app_private.send_due_reminders(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; local_ts timestamp; local_day date; outcome text; sent int := 0;
begin
  for r in select user_id, reminder_hour, reminder_timezone from settings where reminders_enabled loop
    begin
      local_ts := p_now at time zone r.reminder_timezone;
      continue when extract(hour from local_ts)::int <> r.reminder_hour;
      local_day := local_ts::date;
      continue when exists (select 1 from reminder_state where user_id = r.user_id and last_sent = local_day);

      outcome := app_private.deliver_reminder(r.user_id, local_day, false);
      if outcome in ('sent', 'empty') then
        insert into reminder_state (user_id, last_sent) values (r.user_id, local_day)
          on conflict (user_id) do update set last_sent = excluded.last_sent;
      end if;
      if outcome = 'sent' then sent := sent + 1; end if;
    exception when others then
      raise warning 'reminders: skipped one account (%)', sqlerrm;
    end;
  end loop;
  return sent;
end $$;

revoke all on function app_private.reminder_digest(uuid, date) from public, anon, authenticated;
revoke all on function app_private.deliver_reminder(uuid, date, boolean) from public, anon, authenticated;
revoke all on function app_private.send_due_reminders(timestamptz) from public, anon, authenticated;

-- 4. The "Send me a test email" button ---------------------------------------------------
-- Takes no arguments: it can only ever email the person who is logged in.
create or replace function public.send_test_reminder()
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); st record; tz text; today date;
begin
  if uid is null then raise exception 'Please log in first.' using errcode = '28000'; end if;
  insert into reminder_state (user_id) values (uid) on conflict (user_id) do nothing;
  select * into st from reminder_state where user_id = uid for update;
  if st.test_at is not null and st.test_at > now() - interval '2 minutes' then
    raise exception 'Please wait a couple of minutes before sending another test.';
  end if;
  if st.test_day = current_date and st.test_count >= 5 then
    raise exception 'That is enough test emails for today. Try again tomorrow.';
  end if;
  update reminder_state
     set test_at = now(), test_day = current_date,
         test_count = case when test_day = current_date then test_count + 1 else 1 end
   where user_id = uid;
  select reminder_timezone into tz from settings where user_id = uid;
  begin
    today := (now() at time zone coalesce(tz, 'America/New_York'))::date;
  exception when others then
    today := current_date;
  end;
  return app_private.deliver_reminder(uid, today, true);
end $$;

revoke all on function public.send_test_reminder() from public, anon;
grant execute on function public.send_test_reminder() to authenticated;

-- 5. Version marker -----------------------------------------------------------------------
insert into public.app_schema_version (version) values (4) on conflict do nothing;

notify pgrst, 'reload schema';
