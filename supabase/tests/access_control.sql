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

-- ---- 7. deleting things cleans up only what belongs to them ----
do $$
declare
  alice constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  bob   constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  tx uuid;
begin
  select id into tx from transactions where user_id = bob limit 1;
  perform tests.check('Bob deletes one of his own deals', tests.touched(bob, format('delete from transactions where id = %L', tx)) = 1);
  perform tests.check('its tasks, documents and drafts went with it',
    tests.rows_for(bob, 'select * from tasks') = 0 and tests.rows_for(bob, 'select * from documents') = 0 and tests.rows_for(bob, 'select * from email_drafts') = 0);
  perform tests.check('Alice''s records are untouched',
    tests.rows_for(alice, 'select * from transactions') = 1 and tests.rows_for(alice, 'select * from tasks') = 1);
  delete from auth.users where id = bob;
  perform tests.check('closing Bob''s account removes all of Bob''s data',
    (select count(*) from people where user_id = bob) = 0 and (select count(*) from settings where user_id = bob) = 0);
  perform tests.check('and none of Alice''s', (select count(*) from people where user_id = alice) = 2);
end $$;

-- ---- 8. structural guards: new tables can't be added without locks ----
do $$
declare r record; bad text := '';
begin
  for r in
    select c.relname, c.relrowsecurity,
           (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    if not r.relrowsecurity or r.policies = 0 then bad := bad || ' ' || r.relname; end if;
  end loop;
  perform tests.check('every public table has row level security on and at least one policy', bad = '', 'unprotected:' || bad);
  perform tests.check('no policy applies to the anonymous or public role',
    not exists (select 1 from pg_policies where schemaname = 'public' and (roles && array['anon', 'public']::name[])));
  perform tests.check('the anonymous role has no table privileges at all',
    not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'PUBLIC')));
end $$;

drop schema tests cascade;
