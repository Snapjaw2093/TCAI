// The statements an older database needs to catch up. This is the same as the
// "Columns added after the first release" part of supabase/schema.sql, plus the
// templates table. It is safe to run more than once. AuthGate shows this with
// a Copy button when the database is behind.
export const schemaUpdateSql = `alter table public.transactions add column if not exists archived boolean not null default false;
alter table public.tasks add column if not exists category text;
alter table public.email_drafts add column if not exists recipient_email text;
alter table public.settings add column if not exists default_transaction_type text not null default 'buyer'
  check (default_transaction_type in ('buyer', 'seller'));
alter table public.settings add column if not exists follow_up_days integer not null default 7;
alter table public.settings add column if not exists task_categories jsonb;

alter table public.email_drafts add column if not exists ai_info jsonb;
alter table public.email_drafts alter column recipient_id drop not null;
alter table public.email_drafts drop constraint if exists email_drafts_kind_check;
alter table public.email_drafts add constraint email_drafts_kind_check
  check (kind in ('welcome', 'follow-up', 'ai'));

create table if not exists public.templates (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  checklists jsonb not null,
  emails     jsonb not null
);
alter table public.templates enable row level security;
drop policy if exists "own rows" on public.templates;
create policy "own rows" on public.templates for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

notify pgrst, 'reload schema';`;
