-- 0002: security hardening. Safe to run more than once.
--
--  1. Only signed-in users can touch the tables at all (the anonymous role gets nothing).
--  2. A record can only point at records of the SAME account. Before this, a row
--     was locked to its owner, but a task could still be attached to somebody
--     else's deal if you knew its id.
--  3. The database itself refuses oversized or malformed input, whatever sent it.
--  4. A version marker so the app can tell when the database is behind.

-- 1. Privileges -------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['people', 'transactions', 'tasks', 'documents', 'email_drafts', 'settings', 'templates']
  loop
    execute format('revoke all on public.%I from anon, public', t);
    execute format('revoke all on public.%I from authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
alter default privileges in schema public revoke all on tables from anon;

-- 2. Same-account references --------------------------------------------------
-- A unique (id, user_id) pair lets other tables point at "this record, owned by
-- this same account" in one step.
create unique index if not exists people_id_user_key       on public.people (id, user_id);
create unique index if not exists transactions_id_user_key on public.transactions (id, user_id);

alter table public.transactions drop constraint if exists transactions_client_id_fkey;
alter table public.transactions drop constraint if exists transactions_agent_id_fkey;
alter table public.transactions drop constraint if exists transactions_client_same_account;
alter table public.transactions drop constraint if exists transactions_agent_same_account;
alter table public.transactions add constraint transactions_client_same_account
  foreign key (client_id, user_id) references public.people (id, user_id);
alter table public.transactions add constraint transactions_agent_same_account
  foreign key (agent_id, user_id) references public.people (id, user_id);

alter table public.tasks drop constraint if exists tasks_transaction_id_fkey;
alter table public.tasks drop constraint if exists tasks_transaction_same_account;
alter table public.tasks add constraint tasks_transaction_same_account
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete cascade;

alter table public.documents drop constraint if exists documents_transaction_id_fkey;
alter table public.documents drop constraint if exists documents_transaction_same_account;
alter table public.documents add constraint documents_transaction_same_account
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete cascade;

alter table public.email_drafts drop constraint if exists email_drafts_transaction_id_fkey;
alter table public.email_drafts drop constraint if exists email_drafts_recipient_id_fkey;
alter table public.email_drafts drop constraint if exists email_drafts_transaction_same_account;
alter table public.email_drafts drop constraint if exists email_drafts_recipient_same_account;
alter table public.email_drafts add constraint email_drafts_transaction_same_account
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete cascade;
-- recipient_id may be empty (an AI draft to a typed address); a filled one must be the same account's contact.
alter table public.email_drafts add constraint email_drafts_recipient_same_account
  foreign key (recipient_id, user_id) references public.people (id, user_id);

-- 3. Input limits -------------------------------------------------------------
-- "not valid" means: enforced for every new or changed row, without failing on
-- rows that already exist.
alter table public.people drop constraint if exists people_input_ck;
alter table public.people add constraint people_input_ck check (
  char_length(btrim(name)) between 1 and 200
  and char_length(phone) <= 50
  and (email = '' or (char_length(email) <= 320 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'))
) not valid;

alter table public.transactions drop constraint if exists transactions_input_ck;
alter table public.transactions add constraint transactions_input_ck check (
  char_length(btrim(property_address)) between 1 and 300
  and char_length(notes) <= 10000
  and (price is null or (price >= 0 and price < 1000000000000))
) not valid;

alter table public.tasks drop constraint if exists tasks_input_ck;
alter table public.tasks add constraint tasks_input_ck check (
  char_length(btrim(title)) between 1 and 300
  and (category is null or char_length(category) <= 100)
  and (key is null or char_length(key) <= 100)
) not valid;

alter table public.documents drop constraint if exists documents_input_ck;
alter table public.documents add constraint documents_input_ck check (
  char_length(btrim(name)) between 1 and 300
) not valid;

alter table public.email_drafts drop constraint if exists email_drafts_input_ck;
alter table public.email_drafts add constraint email_drafts_input_ck check (
  char_length(subject) <= 500
  and char_length(body) <= 40000
  and (recipient_email is null or recipient_email = ''
       or (char_length(recipient_email) <= 320 and recipient_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'))
  and (ai_info is null or octet_length(ai_info::text) <= 100000)
) not valid;

alter table public.settings drop constraint if exists settings_input_ck;
alter table public.settings add constraint settings_input_ck check (
  char_length(name) <= 200 and char_length(title) <= 200 and char_length(company) <= 200
  and follow_up_days between 1 and 365
  and (task_categories is null or octet_length(task_categories::text) <= 20000)
) not valid;

alter table public.templates drop constraint if exists templates_input_ck;
alter table public.templates add constraint templates_input_ck check (
  octet_length(checklists::text) <= 200000 and octet_length(emails::text) <= 200000
) not valid;

-- 4. Version marker -------------------------------------------------------------
create table if not exists public.app_schema_version (
  version    integer primary key,
  applied_at timestamptz not null default now()
);
insert into public.app_schema_version (version) values (1), (2) on conflict do nothing;
alter table public.app_schema_version enable row level security;
drop policy if exists "read version" on public.app_schema_version;
create policy "read version" on public.app_schema_version for select to authenticated using (true);
revoke all on public.app_schema_version from anon, public, authenticated;
grant select on public.app_schema_version to authenticated;

notify pgrst, 'reload schema';
