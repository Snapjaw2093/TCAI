-- Access-control tests. They use only made-up people and addresses.
--
-- Two fictional users (Alice and Bob) each get a full set of records. Then each
-- test acts as one of them, the same way the app does (the "authenticated"
-- database role plus that user's id), and checks what they can and cannot do.
-- Anything unexpected raises an error, which fails the run.

drop schema if exists tests cascade;
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.become(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

create function tests.become_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
end $$;

create function tests.back() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

-- How many rows does this query return for that user?
create function tests.rows_for(uid uuid, q text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform tests.become(uid);
  execute 'select count(*) from (' || q || ') s' into n;
  perform tests.back();
  return n;
end $$;

-- Run a write as that user; how many rows did it touch?
create function tests.touched(uid uuid, q text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform tests.become(uid);
  execute q;
  get diagnostics n = row_count;
  perform tests.back();
  return n;
end $$;

-- A write that must be refused. Returns the refusal message.
create function tests.refused(uid uuid, q text) returns text language plpgsql as $$
declare msg text;
begin
  perform tests.become(uid);
  begin
    execute q;
    perform tests.back();
    return null; -- it was allowed: the caller treats this as a failure
  exception when others then
    msg := sqlerrm;
  end;
  perform tests.back();
  return msg;
end $$;

create function tests.check(name text, ok boolean, detail text default '') returns void language plpgsql as $$
begin
  if ok then
    raise notice 'PASS  %', name;
  else
    raise exception 'FAIL  % %', name, detail;
  end if;
end $$;

-- ---- two fictional accounts, each with a complete set of records ----
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alice@example.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bob@example.test');

do $$
declare
  alice constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  bob   constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  u uuid; label text;
  pc uuid; pa uuid; tx uuid;
begin
  foreach u in array array[alice, bob] loop
    label := case when u = alice then 'Alice' else 'Bob' end;
    perform tests.become(u);
    insert into people (name, email, phone, role) values (label || ' Client', lower(label) || '.client@example.test', '555-0100', 'client') returning id into pc;
    insert into people (name, email, phone, role) values (label || ' Agent',  lower(label) || '.agent@example.test',  '555-0101', 'agent')  returning id into pa;
    insert into transactions (type, property_address, client_id, agent_id) values ('buyer', '1 ' || label || ' Street', pc, pa) returning id into tx;
    insert into tasks (transaction_id, title) values (tx, label || ' task');
    insert into documents (transaction_id, name) values (tx, label || ' document');
    insert into email_drafts (transaction_id, recipient_id, kind, subject, body) values (tx, pc, 'welcome', label || ' subject', 'Hello');
    insert into settings (name) values (label);
    insert into templates (checklists, emails) values ('{}', '{}');
    perform tests.back();
  end loop;
end $$;

-- ---- 1. everyone sees only their own rows ----
do $$
declare
  alice constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  bob   constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  t text; n bigint;
begin
  foreach t in array array['people', 'transactions', 'tasks', 'documents', 'email_drafts', 'settings', 'templates'] loop
    n := tests.rows_for(alice, 'select * from ' || t);
    perform tests.check('Alice reads only her own rows in ' || t, n = (case when t = 'people' then 2 else 1 end), 'saw ' || n);
    n := tests.rows_for(bob, 'select * from ' || t);
    perform tests.check('Bob reads only his own rows in ' || t, n = (case when t = 'people' then 2 else 1 end), 'saw ' || n);
  end loop;
  perform tests.check('Bob cannot look up Alice''s deal by address',
    tests.rows_for(bob, $q$select * from transactions where property_address = '1 Alice Street'$q$) = 0);
end $$;

-- ---- 2. nobody can edit or delete someone else's rows ----
do $$
declare
  alice constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  bob   constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  t text;
begin
  foreach t in array array['people', 'transactions', 'tasks', 'documents', 'email_drafts', 'settings', 'templates'] loop
    perform tests.check('Bob cannot update Alice''s ' || t,
      tests.touched(bob, format('update %I set user_id = user_id where user_id = %L', t, alice)) = 0);
    perform tests.check('Bob cannot delete Alice''s ' || t,
      tests.touched(bob, format('delete from %I where user_id = %L', t, alice)) = 0);
  end loop;
  perform tests.check('Alice''s data survived Bob''s delete attempts',
    tests.rows_for(alice, 'select * from transactions') = 1 and tests.rows_for(alice, 'select * from tasks') = 1);
end $$;

-- ---- 3. nobody can write rows into someone else's account, or hand over their own ----
do $$
declare
  alice constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  bob   constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  msg text;
begin
  msg := tests.refused(bob, format('insert into people (user_id, name, email, role) values (%L, ''Planted'', ''x@example.test'', ''client'')', alice));
  perform tests.check('Bob cannot insert a contact into Alice''s account', msg is not null and msg ~* 'row-level security', coalesce(msg, 'it was allowed'));
  msg := tests.refused(bob, format('update transactions set user_id = %L where user_id = %L', alice, bob));
  perform tests.check('Bob cannot give his deal to Alice', msg is not null and msg ~* 'row-level security', coalesce(msg, 'it was allowed'));
  msg := tests.refused(bob, format('update settings set user_id = %L where user_id = %L', alice, bob));
  perform tests.check('Bob cannot overwrite Alice''s settings row by re-pointing his', msg is not null, coalesce(msg, 'it was allowed'));
end $$;

-- ---- 4. records cannot point at another account's records ----
do $$
declare
  alice constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  bob   constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  a_tx uuid; a_person uuid; b_tx uuid; b_person uuid; msg text;
begin
  select id into a_tx from transactions where user_id = alice;
  select id into a_person from people where user_id = alice and role = 'client';
  select id into b_tx from transactions where user_id = bob;
  select id into b_person from people where user_id = bob and role = 'client';

  msg := tests.refused(bob, format('insert into tasks (transaction_id, title) values (%L, ''sneaky'')', a_tx));
  perform tests.check('Bob cannot attach a task to Alice''s deal', msg is not null, coalesce(msg, 'it was allowed'));
  msg := tests.refused(bob, format('insert into documents (transaction_id, name) values (%L, ''sneaky'')', a_tx));
  perform tests.check('Bob cannot attach a document to Alice''s deal', msg is not null, coalesce(msg, 'it was allowed'));
  msg := tests.refused(bob, format('insert into email_drafts (transaction_id, recipient_id, kind, subject, body) values (%L, %L, ''welcome'', ''s'', ''b'')', a_tx, b_person));
  perform tests.check('Bob cannot attach a draft to Alice''s deal', msg is not null, coalesce(msg, 'it was allowed'));
  msg := tests.refused(bob, format('insert into email_drafts (transaction_id, recipient_id, kind, subject, body) values (%L, %L, ''welcome'', ''s'', ''b'')', b_tx, a_person));
  perform tests.check('Bob cannot address a draft to Alice''s contact', msg is not null, coalesce(msg, 'it was allowed'));
  msg := tests.refused(bob, format('insert into transactions (type, property_address, client_id, agent_id) values (''buyer'', ''2 Bob Street'', %L, %L)', a_person, b_person));
  perform tests.check('Bob cannot use Alice''s contact as his client', msg is not null, coalesce(msg, 'it was allowed'));
  msg := tests.refused(bob, format('update tasks set transaction_id = %L where user_id = %L', a_tx, bob));
  perform tests.check('Bob cannot move his task onto Alice''s deal', msg is not null, coalesce(msg, 'it was allowed'));
  perform tests.check('Alice''s deal gained no extra tasks, documents or drafts',
    tests.rows_for(alice, 'select * from tasks') = 1 and tests.rows_for(alice, 'select * from documents') = 1 and tests.rows_for(alice, 'select * from email_drafts') = 1);
  -- the normal case still works
  perform tests.check('Bob can still add a task to his own deal',
    tests.touched(bob, format('insert into tasks (transaction_id, title) values (%L, ''fine'')', b_tx)) = 1);
  perform tests.check('A draft with no saved recipient (an AI draft to a typed address) is allowed',
    tests.touched(bob, format('insert into email_drafts (transaction_id, recipient_id, kind, subject, body, recipient_email) values (%L, null, ''ai'', ''s'', ''b'', ''p@example.test'')', b_tx)) = 1);
end $$;

-- ---- 5. logged-out and anonymous callers get nothing ----
do $$
declare t text; msg text; n bigint;
begin
  foreach t in array array['people', 'transactions', 'tasks', 'documents', 'email_drafts', 'settings', 'templates'] loop
    perform tests.become_anon();
    begin
      execute 'select count(*) from ' || t into n;
      perform tests.back();
      raise exception 'FAIL  the anonymous role could read % (% rows)', t, n;
    exception when insufficient_privilege then
      perform tests.back();
      raise notice 'PASS  the anonymous role is refused on %', t;
    end;
  end loop;
  perform tests.check('a signed-in role with no user id sees nothing',
    tests.rows_for('00000000-0000-0000-0000-000000000000', 'select * from transactions') = 0);
  msg := tests.refused('00000000-0000-0000-0000-000000000000', 'insert into people (name, email, role) values (''x'', ''x@example.test'', ''client'')');
  perform tests.check('a user id that does not exist cannot create contacts', msg is not null, coalesce(msg, 'it was allowed'));
end $$;

-- ---- 6. bad input is refused by the database itself ----
do $$
declare
  alice constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  tx uuid; p uuid; msg text;
begin
  select id into tx from transactions where user_id = alice;
  select id into p from people where user_id = alice and role = 'client';
  msg := tests.refused(alice, format('update transactions set notes = repeat(''x'', 20000) where id = %L', tx));
  perform tests.check('over-long notes are refused', msg is not null, coalesce(msg, 'it was allowed'));
  msg := tests.refused(alice, format('update transactions set property_address = '''' where id = %L', tx));
  perform tests.check('an empty property address is refused', msg is not null, coalesce(msg, 'it was allowed'));
  msg := tests.refused(alice, format('update transactions set price = -5 where id = %L', tx));
  perform tests.check('a negative price is refused', msg is not null, coalesce(msg, 'it was allowed'));
  msg := tests.refused(alice, format('update transactions set status = ''hacked'' where id = %L', tx));
  perform tests.check('an unknown status is refused', msg is not null, coalesce(msg, 'it was allowed'));
  msg := tests.refused(alice, format('update people set email = ''not an email'' where id = %L', p));
  perform tests.check('a malformed email address is refused', msg is not null, coalesce(msg, 'it was allowed'));
  msg := tests.refused(alice, format('update people set name = '''' where id = %L', p));
  perform tests.check('an empty contact name is refused', msg is not null, coalesce(msg, 'it was allowed'));
  msg := tests.refused(alice, format('update email_drafts set body = repeat(''x'', 50000) where transaction_id = %L', tx));
  perform tests.check('an over-long email body is refused', msg is not null, coalesce(msg, 'it was allowed'));
  msg := tests.refused(alice, format('update email_drafts set kind = ''mass-mailing'' where transaction_id = %L', tx));
  perform tests.check('an unknown draft kind is refused', msg is not null, coalesce(msg, 'it was allowed'));
  msg := tests.refused(alice, 'update settings set follow_up_days = 100000');
  perform tests.check('an absurd follow-up window is refused', msg is not null, coalesce(msg, 'it was allowed'));
  msg := tests.refused(alice, 'update templates set emails = (select jsonb_object_agg(g::text, repeat(''x'', 1000)) from generate_series(1, 400) g)');
  perform tests.check('an oversized templates blob is refused', msg is not null, coalesce(msg, 'it was allowed'));
end $$;

-- ---- 6b. uploaded files: private to their owner, tied to their own deals ----
do $$
declare
  alice constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  bob   constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  a_tx uuid; b_tx uuid; a_doc uuid; b_pa uuid; b_pc uuid; tmp_tx uuid; file_id uuid; msg text; n bigint;
  a_path text; b_path text;
  ins constant text := 'insert into storage.objects (bucket_id, name) values (''deal-documents'', %L)';
  rec constant text := 'insert into document_files (transaction_id, file_name, mime_type, size_bytes, storage_path) values (%L, %L, %L, %s, %L)';
begin
  select id into a_tx from transactions where user_id = alice;
  select id into b_tx from transactions where user_id = bob;
  select id into a_doc from documents where user_id = alice limit 1;
  a_path := alice || '/' || a_tx || '/abc-contract.pdf';
  b_path := bob || '/' || b_tx || '/def-receipt.pdf';

  perform tests.check('the deal-documents bucket exists, is private, and has a size limit',
    exists (select 1 from storage.buckets where id = 'deal-documents' and public = false and file_size_limit = 10485760));

  -- storing a file
  perform tests.check('Alice can store a file under her own folder, for her own deal', tests.touched(alice, format(ins, a_path)) = 1);
  perform tests.check('Bob can store a file under his own folder, for his own deal', tests.touched(bob, format(ins, b_path)) = 1);
  msg := tests.refused(bob, format(ins, alice || '/' || a_tx || '/planted.pdf'));
  perform tests.check('Bob cannot store a file in Alice''s folder', msg is not null, coalesce(msg, 'it was allowed'));
  msg := tests.refused(bob, format(ins, bob || '/' || a_tx || '/planted.pdf'));
  perform tests.check('Bob cannot store a file against a deal that is not his, even in his own folder', msg is not null, coalesce(msg, 'it was allowed'));
  msg := tests.refused(bob, format(ins, bob || '/' || gen_random_uuid() || '/ghost.pdf'));
  perform tests.check('nor against a deal that does not exist', msg is not null, coalesce(msg, 'it was allowed'));
  msg := tests.refused(bob, format(ins, 'loose-file.pdf'));
  perform tests.check('nor loose in the bucket with no folder', msg is not null, coalesce(msg, 'it was allowed'));

  -- reading and removing
  perform tests.check('Alice sees her file and none of Bob''s',
    tests.rows_for(alice, 'select * from storage.objects where bucket_id = ''deal-documents''') = 1);
  perform tests.check('Bob sees his file and none of Alice''s',
    tests.rows_for(bob, 'select * from storage.objects where bucket_id = ''deal-documents''') = 1);
  perform tests.check('Bob cannot look up Alice''s file by name',
    tests.rows_for(bob, format('select * from storage.objects where name = %L', a_path)) = 0);
  perform tests.check('Bob cannot delete Alice''s file', tests.touched(bob, format('delete from storage.objects where name = %L', a_path)) = 0);
  perform tests.check('nobody can rename or replace a stored file',
    tests.touched(alice, format('update storage.objects set name = %L where name = %L', alice || '/' || a_tx || '/renamed.pdf', a_path)) = 0);
  perform tests.become_anon();
  select count(*) into n from storage.objects;
  perform tests.back();
  perform tests.check('the anonymous role sees no files', n = 0);
  perform tests.check('a signed-in role with no user id sees no files',
    tests.rows_for('00000000-0000-0000-0000-000000000000', 'select * from storage.objects') = 0);

  -- the record table
  perform tests.check('Alice records her file', tests.touched(alice, format(
    'insert into document_files (transaction_id, document_id, file_name, mime_type, size_bytes, storage_path) values (%L, %L, ''contract.pdf'', ''application/pdf'', 2048, %L)', a_tx, a_doc, a_path)) = 1);
  select id into file_id from document_files where user_id = alice;
  perform tests.check('Bob cannot see Alice''s file records', tests.rows_for(bob, 'select * from document_files') = 0);
  perform tests.check('Bob cannot delete or edit them',
    tests.touched(bob, 'delete from document_files') = 0 and tests.touched(bob, 'update document_files set file_name = ''x.pdf''') = 0);
  msg := tests.refused(bob, format(rec, a_tx, 'x.pdf', 'application/pdf', 10, alice || '/' || a_tx || '/x.pdf'));
  perform tests.check('Bob cannot record a file against Alice''s deal', msg is not null, coalesce(msg, 'it was allowed'));
  msg := tests.refused(bob, format('insert into document_files (transaction_id, document_id, file_name, mime_type, size_bytes, storage_path) values (%L, %L, ''x.pdf'', ''application/pdf'', 10, %L)', b_tx, a_doc, bob || '/' || b_tx || '/x.pdf'));
  perform tests.check('Bob cannot link his file to Alice''s checklist item', msg is not null, coalesce(msg, 'it was allowed'));
  msg := tests.refused(bob, format(rec, b_tx, 'x.pdf', 'application/pdf', 10, alice || '/' || b_tx || '/x.pdf'));
  perform tests.check('a record cannot claim a path in someone else''s folder', msg is not null, coalesce(msg, 'it was allowed'));

  -- bad input
  msg := tests.refused(bob, format(rec, b_tx, 'x.exe', 'application/x-msdownload', 10, bob || '/' || b_tx || '/x.exe'));
  perform tests.check('a program file type is refused', msg is not null, coalesce(msg, 'it was allowed'));
  msg := tests.refused(bob, format(rec, b_tx, 'x.html', 'text/html', 10, bob || '/' || b_tx || '/x.html'));
  perform tests.check('a web page file type is refused', msg is not null, coalesce(msg, 'it was allowed'));
  msg := tests.refused(bob, format(rec, b_tx, 'big.pdf', 'application/pdf', 10485761, bob || '/' || b_tx || '/big.pdf'));
  perform tests.check('a file over 10 MB is refused', msg is not null, coalesce(msg, 'it was allowed'));
  msg := tests.refused(bob, format(rec, b_tx, 'empty.pdf', 'application/pdf', 0, bob || '/' || b_tx || '/empty.pdf'));
  perform tests.check('an empty file is refused', msg is not null, coalesce(msg, 'it was allowed'));
  msg := tests.refused(bob, format(rec, b_tx, '../evil.pdf', 'application/pdf', 10, bob || '/' || b_tx || '/evil.pdf'));
  perform tests.check('a file name with a slash is refused', msg is not null, coalesce(msg, 'it was allowed'));
  msg := tests.refused(bob, format(rec, b_tx, 'ok.pdf', 'application/pdf', 10, bob || '/' || b_tx || '/../' || alice || '/sneaky.pdf'));
  perform tests.check('a path that climbs out of the folder is refused', msg is not null, coalesce(msg, 'it was allowed'));

  -- clean-up behaviour
  delete from documents where id = a_doc;
  perform tests.check('deleting a checklist item keeps the file on the deal',
    (select count(*) from document_files where id = file_id) = 1 and (select document_id from document_files where id = file_id) is null);
  select id into b_pa from people where user_id = bob and role = 'agent';
  select id into b_pc from people where user_id = bob and role = 'client';
  perform tests.become(bob);
  insert into transactions (type, property_address, client_id, agent_id) values ('buyer', '9 Temp Street', b_pc, b_pa) returning id into tmp_tx;
  insert into document_files (transaction_id, file_name, mime_type, size_bytes, storage_path)
    values (tmp_tx, 'temp.pdf', 'application/pdf', 10, bob || '/' || tmp_tx || '/temp.pdf');
  delete from transactions where id = tmp_tx;
  perform tests.back();
  perform tests.check('deleting a deal removes its file records',
    (select count(*) from document_files where transaction_id = tmp_tx) = 0);
end $$;

-- ---- 6c. daily reminder emails ----
do $$
declare
  alice constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  bob   constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  a_tx uuid; b_tx uuid; n int; sent int; msg text; call jsonb; res text;
  noon constant timestamptz := '2026-10-10 12:00:00+00';
begin
  select id into a_tx from transactions where user_id = alice limit 1;
  select id into b_tx from transactions where user_id = bob limit 1;
  delete from net.calls;
  insert into reminder_config (id, app_url, from_address) values (1, 'https://app.example.test', 'TC Assistant <onboarding@resend.dev>') on conflict (id) do nothing;

  -- some made-up work, due on different days (today in these tests is 2026-10-10)
  perform tests.become(alice);
  insert into tasks (transaction_id, title, due_date) values (a_tx, 'Alice overdue task', '2026-10-01');
  insert into tasks (transaction_id, title, due_date) values (a_tx, E'Alice soon\ntask  with   spaces', '2026-10-12');
  insert into tasks (transaction_id, title, due_date, status) values (a_tx, 'Alice finished task', '2026-10-02', 'done');
  insert into documents (transaction_id, name, status, due_date) values (a_tx, 'Alice missing doc', 'needed', '2026-10-09');
  insert into documents (transaction_id, name, status, due_date) values (a_tx, 'Alice received doc', 'received', '2026-10-09');
  insert into documents (transaction_id, name, status, due_date) values (a_tx, 'Alice far-off doc', 'needed', '2026-10-30');
  update transactions set closing_date = '2026-10-11' where id = a_tx;
  perform tests.back();
  perform tests.become(bob);
  insert into tasks (transaction_id, title, due_date) values (b_tx, 'Bob overdue task', '2026-10-03');
  perform tests.back();

  -- turning it on is the person's own choice, and only for themselves
  perform tests.check('Alice switches her reminders on, for noon UTC',
    tests.touched(alice, 'update settings set reminders_enabled = true, reminder_hour = 12, reminder_timezone = ''UTC''') = 1);
  perform tests.check('Bob does the same',
    tests.touched(bob, 'update settings set reminders_enabled = true, reminder_hour = 12, reminder_timezone = ''UTC''') = 1);
  msg := tests.refused(alice, 'update settings set reminder_hour = 25');
  perform tests.check('an hour that does not exist is refused', msg is not null, coalesce(msg, 'it was allowed'));

  -- when
  sent := app_private.send_due_reminders('2026-10-10 11:00:00+00');
  perform tests.check('nothing is sent before anyone''s chosen hour', sent = 0 and (select count(*) from net.calls) = 0);
  sent := app_private.send_due_reminders(noon);
  perform tests.check('at noon both people get exactly one email', sent = 2 and (select count(*) from net.calls) = 2);
  sent := app_private.send_due_reminders(noon + interval '20 minutes');
  perform tests.check('running again the same day sends nothing more', sent = 0 and (select count(*) from net.calls) = 2);

  -- who and what
  select body into call from net.calls where body->'to' ? 'alice@example.test';
  perform tests.check('Alice''s email goes to her own login address and nobody else',
    call is not null and jsonb_array_length(call->'to') = 1 and (select count(*) from net.calls where body->'to' ? 'alice@example.test') = 1);
  perform tests.check('it is sent from the configured sender through the email service',
    call->>'from' like '%onboarding@resend.dev%' and (select url from net.calls limit 1) = 'https://api.resend.com/emails'
    and (select headers->>'Authorization' from net.calls limit 1) = 'Bearer re_test_fake_key');
  perform tests.check('the subject says how many are overdue and coming up',
    call->>'subject' = 'TC Assistant: 2 overdue, 2 coming up', call->>'subject');
  perform tests.check('overdue and upcoming items are listed with plain-English timing',
    (call->>'text') like '%Alice overdue task (9 days overdue)%' and (call->>'text') like '%Alice missing doc (1 day overdue)%'
    and (call->>'text') like '%Alice soon task with spaces (due in 2 days)%' and (call->>'text') like '%Closing date (due in 1 day)%');
  perform tests.check('finished tasks, received documents and far-off items are left out',
    (call->>'text') not like '%finished%' and (call->>'text') not like '%received doc%' and (call->>'text') not like '%far-off%');
  perform tests.check('Alice''s email contains none of Bob''s information',
    (call->>'text') not like '%Bob%' and (call->>'text') not like '%bob@%');
  select body into call from net.calls where body->'to' ? 'bob@example.test';
  perform tests.check('Bob''s email contains only Bob''s items, to Bob',
    (call->>'text') like '%Bob overdue task%' and (call->>'text') not like '%Alice%' and call->>'subject' = 'TC Assistant: 1 overdue, 0 coming up');

  -- exclusions, time zones, choices
  update transactions set archived = true where id = a_tx;
  perform tests.check('archived deals add nothing to the digest', app_private.reminder_digest(alice, '2026-10-10') is null);
  update transactions set archived = false, status = 'closed' where id = a_tx;
  perform tests.check('closed deals add nothing either', app_private.reminder_digest(alice, '2026-10-10') is null);
  update transactions set status = 'active' where id = a_tx;

  delete from net.calls;
  update reminder_state set last_sent = null;
  perform tests.touched(bob, 'update settings set reminders_enabled = false');
  sent := app_private.send_due_reminders(noon);
  perform tests.check('someone who switched reminders off gets nothing', sent = 1 and not exists (select 1 from net.calls where body->'to' ? 'bob@example.test'));
  perform tests.touched(alice, 'update settings set reminder_timezone = ''America/Los_Angeles'', reminder_hour = 5');
  delete from net.calls;
  update reminder_state set last_sent = null;
  sent := app_private.send_due_reminders(noon);   -- noon UTC is 5am in Los Angeles in October
  perform tests.check('the chosen hour is the person''s own local hour (5am Los Angeles = noon UTC)', sent = 1);
  update reminder_state set last_sent = null; delete from net.calls;
  perform tests.touched(alice, 'update settings set reminder_timezone = ''Not/AZone''');
  sent := app_private.send_due_reminders(noon);
  perform tests.check('a bad time zone is skipped without breaking anyone else''s email', sent = 0);
  perform tests.touched(alice, 'update settings set reminder_timezone = ''UTC'', reminder_hour = 12');

  -- a person with nothing due is skipped entirely
  update reminder_state set last_sent = null; delete from net.calls;
  update tasks set status = 'done' where user_id = bob;
  perform tests.touched(bob, 'update settings set reminders_enabled = true');
  perform tests.touched(alice, 'update settings set reminders_enabled = false');
  sent := app_private.send_due_reminders(noon);
  perform tests.check('a person with nothing due gets no email that day', sent = 0 and (select count(*) from net.calls) = 0);
  update tasks set status = 'open' where user_id = bob;
  perform tests.touched(alice, 'update settings set reminders_enabled = true');
  update reminder_state set last_sent = null;

  -- setup not finished: no key, no crash, nothing marked as sent
  delete from net.calls; update reminder_state set last_sent = null;
  delete from vault.decrypted_secrets where name = 'resend_api_key';
  sent := app_private.send_due_reminders(noon);
  perform tests.check('with no email key stored nothing is sent and nothing is marked as sent',
    sent = 0 and (select count(*) from net.calls) = 0 and not exists (select 1 from reminder_state where last_sent is not null));
  insert into vault.decrypted_secrets values ('resend_api_key', 're_test_fake_key');

  -- who may run what
  perform tests.become(alice);
  begin
    perform app_private.send_due_reminders(noon);
    perform tests.back(); raise exception 'FAIL  a logged-in user could run the scheduled sender';
  exception when insufficient_privilege then perform tests.back(); raise notice 'PASS  a logged-in user cannot run the scheduled sender'; end;
  perform tests.become(alice);
  begin
    perform app_private.deliver_reminder(bob, current_date, true);
    perform tests.back(); raise exception 'FAIL  a logged-in user could send an email for someone else';
  exception when insufficient_privilege then perform tests.back(); raise notice 'PASS  a logged-in user cannot send an email for someone else'; end;
  perform tests.become(alice);
  begin
    perform count(*) from reminder_config;
    perform tests.back(); raise exception 'FAIL  a logged-in user could read the reminder setup';
  exception when insufficient_privilege then perform tests.back(); raise notice 'PASS  a logged-in user cannot read the reminder setup'; end;
  perform tests.become(alice);
  begin
    perform count(*) from reminder_state;
    perform tests.back(); raise exception 'FAIL  a logged-in user could read the reminder bookkeeping';
  exception when insufficient_privilege then perform tests.back(); raise notice 'PASS  nor the bookkeeping (so nobody can reset "already sent today")'; end;
  perform tests.become(alice);
  begin
    update reminder_state set last_sent = null;
    perform tests.back(); raise exception 'FAIL  a logged-in user could edit the reminder bookkeeping';
  exception when insufficient_privilege then perform tests.back(); raise notice 'PASS  nor edit it'; end;
  perform tests.become_anon();
  begin
    perform public.send_test_reminder();
    perform tests.back(); raise exception 'FAIL  a visitor could use the test button';
  exception when insufficient_privilege then perform tests.back(); raise notice 'PASS  a signed-out visitor cannot use the test button'; end;
  perform tests.become('00000000-0000-0000-0000-000000000000');
  perform tests.back();

  -- the test button
  delete from net.calls; delete from reminder_state;
  perform tests.become(alice);
  res := public.send_test_reminder();
  perform tests.back();
  perform tests.check('the test button emails Alice, and only Alice',
    res = 'sent' and (select count(*) from net.calls) = 1 and exists (select 1 from net.calls where body->'to' ? 'alice@example.test'));
  perform tests.become(alice);
  begin
    perform public.send_test_reminder();
    perform tests.back(); raise exception 'FAIL  two tests in a row were allowed';
  exception when others then perform tests.back();
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS  a second test straight away is refused (%)', sqlerrm;
  end;
  update reminder_state set test_at = now() - interval '10 minutes' where user_id = alice;
  perform tests.become(alice); perform public.send_test_reminder(); perform tests.back();
  update reminder_state set test_at = now() - interval '10 minutes' where user_id = alice;
  perform tests.become(alice); perform public.send_test_reminder(); perform tests.back();
  update reminder_state set test_at = now() - interval '10 minutes' where user_id = alice;
  perform tests.become(alice); perform public.send_test_reminder(); perform tests.back();
  update reminder_state set test_at = now() - interval '10 minutes' where user_id = alice;
  perform tests.become(alice); perform public.send_test_reminder(); perform tests.back();   -- the 5th today
  update reminder_state set test_at = now() - interval '10 minutes' where user_id = alice;
  perform tests.become(alice);
  begin
    perform public.send_test_reminder();
    perform tests.back(); raise exception 'FAIL  a sixth test in one day was allowed';
  exception when others then perform tests.back();
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS  a sixth test in one day is refused (%)', sqlerrm;
  end;

  -- a test sends even when nothing is due, so the setup can always be checked
  delete from net.calls; update reminder_state set test_at = null, test_count = 0 where user_id = alice;
  update tasks set status = 'done' where user_id = alice;
  update documents set status = 'received' where user_id = alice;
  update transactions set closing_date = null where user_id = alice;
  perform tests.become(alice); res := public.send_test_reminder(); perform tests.back();
  perform tests.check('with nothing due, the test still sends a short "nothing is due" email',
    res = 'sent' and (select body->>'subject' from net.calls limit 1) = 'TC Assistant: nothing is due');
end $$;

-- ---- 7. deleting things cleans up only what belongs to them ----
do $$
declare
  alice constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  bob   constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  tx uuid; a_deals bigint; a_tasks bigint;
begin
  select id into tx from transactions where user_id = bob limit 1;
  select count(*) into a_deals from transactions where user_id = alice;
  select count(*) into a_tasks from tasks where user_id = alice;
  perform tests.check('Bob deletes one of his own deals', tests.touched(bob, format('delete from transactions where id = %L', tx)) = 1);
  perform tests.check('its tasks, documents and drafts went with it',
    tests.rows_for(bob, 'select * from tasks') = 0 and tests.rows_for(bob, 'select * from documents') = 0 and tests.rows_for(bob, 'select * from email_drafts') = 0);
  perform tests.check('Alice''s records are untouched',
    tests.rows_for(alice, 'select * from transactions') = a_deals and tests.rows_for(alice, 'select * from tasks') = a_tasks);
  delete from auth.users where id = bob;
  perform tests.check('closing Bob''s account removes all of Bob''s data',
    (select count(*) from people where user_id = bob) = 0 and (select count(*) from settings where user_id = bob) = 0);
  perform tests.check('and none of Alice''s', (select count(*) from people where user_id = alice) = 2);
end $$;

-- ---- 8. structural guards: new tables can't be added without locks ----
do $$
declare
  r record; bad text := '';
  -- Server-only tables: row level security on, deliberately NO policies, and no
  -- privileges for anyone but the server. Anything else needs a real policy.
  server_only constant text[] := array['reminder_state', 'reminder_config'];
begin
  for r in
    select c.relname, c.relrowsecurity,
           (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    if not r.relrowsecurity then bad := bad || ' ' || r.relname;
    elsif r.policies = 0 and not (r.relname = any (server_only)) then bad := bad || ' ' || r.relname;
    end if;
  end loop;
  perform tests.check('every public table has row level security on, and a policy unless it is server-only', bad = '', 'unprotected:' || bad);
  perform tests.check('server-only tables have no policies at all',
    not exists (select 1 from pg_policies where schemaname = 'public' and tablename = any (server_only)));
  perform tests.check('no policy applies to the anonymous or public role',
    not exists (select 1 from pg_policies where schemaname = 'public' and (roles && array['anon', 'public']::name[])));
  perform tests.check('the anonymous role has no table privileges at all',
    not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'PUBLIC')));
  perform tests.check('logged-in users have no privileges on the server-only tables',
    not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = any (server_only) and grantee = 'authenticated'));
  perform tests.check('the only function logged-in users can run is send_test_reminder (plus the helper the policies use)',
    not exists (
      select 1 from information_schema.routine_privileges
      where routine_schema in ('public', 'app_private') and grantee in ('anon', 'PUBLIC', 'authenticated')
        and routine_name not in ('send_test_reminder')
    ));
end $$;

drop schema tests cascade;
