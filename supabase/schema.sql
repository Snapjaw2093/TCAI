-- TC Assistant database setup.
-- Paste this whole file into Supabase: SQL Editor > New query > Run.
-- It is safe to run more than once.
--
-- Every table has a user_id column and a lock (row level security) so each
-- login can only ever see and change its own rows.

create table if not exists public.people (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  email      text not null,
  phone      text not null default '',
  role       text not null check (role in ('client', 'agent')),
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type             text not null check (type in ('buyer', 'seller')),
  status           text not null default 'active'
                   check (status in ('active', 'pending', 'closed', 'cancelled')),
  property_address text not null,
  client_id        uuid not null references public.people (id),
  agent_id         uuid not null references public.people (id),
  contract_date    date,
  closing_date     date,
  price            numeric,
  notes            text not null default '',
  created_at       date not null default current_date,
  archived         boolean not null default false
);

create table if not exists public.tasks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  title          text not null,
  due_date       date,
  status         text not null default 'open' check (status in ('open', 'done', 'skipped')),
  key            text,
  category       text
);

create table if not exists public.documents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  name           text not null,
  required       boolean not null default true,
  status         text not null default 'needed' check (status in ('needed', 'requested', 'received')),
  due_date       date
);

create table if not exists public.email_drafts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  recipient_id   uuid references public.people (id),
  recipient_email text,
  kind           text not null check (kind in ('welcome', 'follow-up', 'ai')),
  subject        text not null,
  body           text not null,
  status         text not null default 'draft' check (status in ('draft', 'approved', 'sent')),
  created_at     timestamptz not null default now(),
  sent_at        timestamptz,
  ai_info        jsonb
);

create table if not exists public.settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name    text not null default '',
  title   text not null default 'Transaction Coordinator',
  company text not null default '',
  default_transaction_type text not null default 'buyer'
                           check (default_transaction_type in ('buyer', 'seller')),
  follow_up_days integer not null default 7,
  task_categories jsonb
);

-- Your edited checklists and email wording, one row per account.
create table if not exists public.templates (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  checklists jsonb not null,
  emails     jsonb not null
);

-- Columns added after the first release. On a database made earlier these
-- add what is missing; on a new one they do nothing.
alter table public.transactions add column if not exists archived boolean not null default false;
alter table public.tasks add column if not exists category text;
alter table public.email_drafts add column if not exists recipient_email text;
alter table public.settings add column if not exists default_transaction_type text not null default 'buyer'
  check (default_transaction_type in ('buyer', 'seller'));
alter table public.settings add column if not exists follow_up_days integer not null default 7;
alter table public.settings add column if not exists task_categories jsonb;

-- AI drafting: a new kind of draft, the information it was written from, and
-- drafts for people who aren't saved on the deal (a lender, a title officer).
alter table public.email_drafts add column if not exists ai_info jsonb;
alter table public.email_drafts alter column recipient_id drop not null;
alter table public.email_drafts drop constraint if exists email_drafts_kind_check;
alter table public.email_drafts add constraint email_drafts_kind_check
  check (kind in ('welcome', 'follow-up', 'ai'));

-- Indexes: make "all tasks for this deal" style lookups fast.
create index if not exists transactions_user_idx on public.transactions (user_id);
create index if not exists people_user_idx       on public.people (user_id);
create index if not exists tasks_transaction_idx on public.tasks (transaction_id);
create index if not exists documents_transaction_idx on public.documents (transaction_id);
create index if not exists drafts_transaction_idx on public.email_drafts (transaction_id);

-- The locks: signed-in users can only touch rows where user_id is their own.
do $$
declare t text;
begin
  foreach t in array array['people', 'transactions', 'tasks', 'documents', 'email_drafts', 'settings', 'templates']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Make Supabase notice the new tables and columns right away.
notify pgrst, 'reload schema';
