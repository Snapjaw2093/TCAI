-- 0003: file uploads for deals. Safe to run more than once.
--
--  * A private storage bucket, "deal-documents" (nothing is public).
--  * A table that records each uploaded file and which deal / checklist document it belongs to.
--  * Locks: you can only see, add or delete files whose first folder is YOUR user id, and
--    only into a deal you own. Files are never edited in place.
--
-- File paths look like  <user id>/<deal id>/<random>-<file name>

-- 1. The record of each file ---------------------------------------------------
create unique index if not exists documents_id_user_key on public.documents (id, user_id);

create table if not exists public.document_files (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  transaction_id uuid not null,
  document_id    uuid,
  file_name      text not null,
  mime_type      text not null,
  size_bytes     bigint not null,
  storage_path   text not null unique,
  created_at     timestamptz not null default now()
);

alter table public.document_files drop constraint if exists document_files_transaction_same_account;
alter table public.document_files add constraint document_files_transaction_same_account
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete cascade;
-- If the checklist item is deleted the file stays on the deal.
alter table public.document_files drop constraint if exists document_files_document_same_account;
alter table public.document_files add constraint document_files_document_same_account
  foreign key (document_id, user_id) references public.documents (id, user_id) on delete set null (document_id);

alter table public.document_files drop constraint if exists document_files_input_ck;
alter table public.document_files add constraint document_files_input_ck check (
  char_length(btrim(file_name)) between 1 and 200
  and file_name !~ '[/\\[:cntrl:]]'
  and size_bytes between 1 and 10485760
  and mime_type in (
    'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv'
  )
  and char_length(storage_path) <= 400
  and storage_path not like '%..%'
  and storage_path like user_id::text || '/' || transaction_id::text || '/%'
);

create index if not exists document_files_transaction_idx on public.document_files (transaction_id);

alter table public.document_files enable row level security;
drop policy if exists "own rows" on public.document_files;
create policy "own rows" on public.document_files for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.document_files from anon, public, authenticated;
grant select, insert, update, delete on public.document_files to authenticated;

-- 2. The private bucket ---------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'deal-documents', 'deal-documents', false, 10485760,
  array[
    'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3. The locks on the files themselves ------------------------------------------
-- No UPDATE policy on purpose: a stored file is never changed, only added or removed.
drop policy if exists "deal files: read own" on storage.objects;
create policy "deal files: read own" on storage.objects for select to authenticated
  using (bucket_id = 'deal-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "deal files: add to own deals" on storage.objects;
create policy "deal files: add to own deals" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'deal-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.transactions t
      where t.id::text = (storage.foldername(name))[2] and t.user_id = (select auth.uid())
    )
  );

drop policy if exists "deal files: delete own" on storage.objects;
create policy "deal files: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'deal-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 4. Version marker ----------------------------------------------------------------
insert into public.app_schema_version (version) values (3) on conflict do nothing;

notify pgrst, 'reload schema';
