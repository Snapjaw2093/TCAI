# Database, security and setup guide

Everything about the Supabase side of TC Assistant: what the tables look like, who can see what, how to set it up safely, and how to test it.

## The one-paragraph version

Think of the database as an apartment building. Each account gets its own apartment (every row has a `user_id`), the front door of every table is locked by **row level security** (RLS) so your key only opens your own apartment, and the building rules (database constraints) refuse nonsense such as a task that points at a deal in someone else's apartment. The browser is only ever given a **publishable** key, which is safe to publish because it opens nothing by itself; the locks do the protecting, not the hidden-ness of the key.

## Schema

| Table | What it holds | Points at |
| --- | --- | --- |
| `people` | Contacts: clients and agents | none |
| `transactions` | A deal: address, side, status, dates, price, private notes, archived flag | `people` (client, agent) |
| `tasks` | Follow-up tasks and onboarding checklist items (with an optional `key` for built-in steps and a `category`) | `transactions` |
| `documents` | Documents a deal needs: required, status, due date | `transactions` |
| `email_drafts` | Drafts, approved and sent emails, including AI-assisted drafts (`kind = 'ai'`, with their source info in `ai_info`) | `transactions`, `people` (optional) |
| `settings` | One row per account: signature, defaults | none |
| `templates` | One row per account: edited checklists and email wording | none |
| `document_files` | One row per uploaded file: name, type, size, where it is stored, and optionally which checklist document it satisfies | `transactions`, `documents` (optional) |
| `reminder_state`, `reminder_config` | Server-only bookkeeping and setup for reminder emails (no one but the server can read or write them) | none |
| `app_schema_version` | Read-only marker the app uses to notice when the database is behind | none |

Every table except `app_schema_version` has `user_id uuid not null default auth.uid() references auth.users on delete cascade`. Closing an account deletes all of its data.

### Relationships

```
auth.users 1 ── * people
           1 ── * transactions ── * tasks
                       │      └── * documents
                       │      └── * email_drafts ── (optional) people
                       └── client, agent → people
```

Relationships are **same-account** relationships. A link is `(id, user_id)`, not just `id`, so the database refuses a task, document or draft that points at another account's deal, and a deal that points at another account's contact, even if someone knew the id. (This was a real gap in the first version: rows were locked to their owner, but a stranger's id could still be referenced. The access tests below prove it is closed.)

## Access model

| Who | Can do |
| --- | --- |
| Signed-out visitor (`anon`) | Nothing. No table privileges at all. |
| Signed-in user (`authenticated`) | Read, add, change and delete **their own** rows. Nothing else, including nothing that points at another account's rows. |
| The app's server routes | Act **as the caller**: they take the caller's own login token, verify it with Supabase, and query with that token, so RLS still applies. |
| The Supabase `service_role` / secret key | **Not used anywhere in this app.** There is no feature that needs it. A test fails if any code mentions it. |

There are no organizations or shared teams: one account is one private workspace. If you later want teams, the change is an `organizations` + `memberships` table and swapping the `user_id = auth.uid()` rule for "is a member of this row's organization"; it is deliberately not half-built here.

### Where authorization is enforced

1. **In the database (the real wall).** RLS policies on every table, privileges revoked from `anon`, same-account foreign keys, and input limits (`CHECK` constraints). These apply to every request, whatever sent it: the app, a modified browser, `curl`, or a bug in this app.
2. **In server routes** (`/api/ai/draft`, `/api/account/export`): they verify the login token on the server, never trust anything the browser claims about who it is, and refuse before doing any work. Hiding a button is never relied on; the buttons are convenience only.
3. **In the app's forms** (`lib/data/validate.ts`): friendly messages for bad input. This is a courtesy; the database repeats the checks.

## File uploads

Files are kept in a **private** Supabase Storage bucket, `deal-documents`. Nothing is public and nothing is served by a permanent link.

- **Paths:** `<your user id>/<deal id>/<random>-<file name>`. The storage locks check the first folder against your login, and for uploads also that the second folder is a deal you own, so you can't add a file to someone else's deal or folder.
- **No editing:** there is no update lock on purpose. A stored file is only ever added or removed.
- **Limits (enforced three times: in the app, the bucket, and the database):** 10 MB per file; PDF, PNG, JPG, WebP, HEIC, Word (.docx), Excel (.xlsx), plain text and CSV. Programs, web pages and SVG are refused.
- **Downloads:** the app asks storage for a link that expires after 60 seconds and forces a download, so a file can never open and run as a web page.
- **Clean-up:** removing a file deletes the stored file first and then its record. Deleting a checklist item keeps its files on the deal. **Reset to sample data** removes every stored file. Deleting an *account* in Supabase's dashboard removes its records but **not** its stored files: empty `deal-documents/<user id>/` in Storage → Files first.
- **Not covered:** there is no virus scan. Treat downloaded files from clients like any email attachment. The AI never sees file contents. The "Download my data" export lists files (name, type, size) but does not include their contents.
- **Demo mode:** uploads need an account; the browser-only demo has nowhere safe to keep files and says so.

Check that the bucket exists (Storage → Buckets: `deal-documents`, marked **Private**) after running the setup SQL.

## Daily reminder emails

Everyone can switch on a daily email (**Settings → Daily reminders**) listing what's overdue and coming up in their follow-up window, with the same rules as the Follow-ups page. Nothing is sent on days when nothing is due.

**How it works, and why it is built this way.** A scheduled job *inside Supabase* (`pg_cron`) runs every hour and asks the database function `app_private.send_due_reminders()` to email everyone whose chosen hour it is, in their own time zone, once per day. The email goes out through [Resend](https://resend.com) via `pg_net`. Because it all runs inside the database, **no master (service-role) key is needed anywhere in the app**, and the Resend key is kept in Supabase Vault.

**Safety rules (tested in `supabase/tests/access_control.sql`):**
- Emails only ever go to the account's own login address, never to an address typed into a form, so the feature can't be used to email strangers.
- A digest contains only that account's own items.
- The sending functions live in a schema the API doesn't expose, and logged-in users and visitors have no permission to run them. The one exception is `send_test_reminder()` (the **Send me a test email** button), which takes no arguments, can only email the person logged in, and is limited to one per 2 minutes and 5 per day.
- Settings that control "already sent today" and the test limits live in a table users can't read or write.
- Whether email is sent never depends on the browser: turning it off in Settings is checked by the database each hour.

**One-time setup (about 10 minutes):**
1. **Resend:** create a free account at resend.com and an API key (Sending access). For first tests you can send from `onboarding@resend.dev`, which, as far as I know, Resend only lets you use to email **your own Resend sign-up address** (check their current rules), so use the same email for your TC Assistant login while testing. To email other addresses later, add and verify your own domain in Resend and use an address on it.
2. **Supabase extensions:** Database → Extensions → enable **pg_cron** and **pg_net**. (Vault is on by default; if not, enable `supabase_vault`.)
3. Run `schema.sql` (it includes migration 0004), then open [`reminders-schedule.sql`](reminders-schedule.sql), follow its comments (store the key in Vault, set the app URL and sender, schedule the hourly job), and run it.
4. In the app: **Settings → Daily reminders**, switch on, pick the hour and time zone, **Save**, then **Send me a test email**. It should arrive within a minute (check spam the first time).

**Limits and caveats:** Resend's free plan has daily and monthly caps; the sender is skipped if a send fails and won't retry the same day. `pg_net` sends asynchronously, so a failed send shows up in Supabase under `net._http_response` rather than in the app. Emails are plain text.

## Setup

### 1. Create two projects: one for testing, one for real use

Create **two separate Supabase projects** (for example `tcai-dev` and `tcai-prod`) and never share keys between them.

| | Test / development | Production |
| --- | --- | --- |
| Supabase project | `tcai-dev` | `tcai-prod` |
| Where its two public values go | `.env.local` on your computer, and Vercel **Preview** (and Development) environment | Vercel **Production** environment only |
| Data | Made-up data only (the app's sample deals) | Real clients |
| Auth | Email confirmation optional | Email confirmation **on** |

In Vercel, **Settings > Environment Variables**: tick only the environments each value belongs to, so a preview deployment can never read production data. Do not import real client records while developing; use the built-in sample data (**Settings > Reset to sample data**, on a test account).

### 2. Run the database setup

In each project: **SQL Editor > New query**, paste the contents of [`schema.sql`](schema.sql), and click **Run**. It is safe to run on a new or an existing project, and safe to run again.

If you ever forget, the app shows a "Your database needs a quick update" screen with the exact SQL and a Copy button.

### 3. Configure Auth (Supabase dashboard)

- **Authentication > Sign In / Providers > Email**: enable; for production turn **Confirm email** on; set a minimum password length of 8 or more (and consider requiring a mix of characters). The app's form also requires 8.
- **Authentication > URL Configuration**: set **Site URL** to your deployed address and add only the redirect URLs you actually use.
- If this is a private tool, turn **off** "Allow new users to sign up" after you have created the accounts you need. Until you do, anyone who finds the site can create an account (they would only ever see their own, empty workspace).
- **Authentication > Rate Limits**: keep Supabase's defaults or tighten them.

### 4. Environment variables

| Variable | Where | Secret? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local`, Vercel | No (public by design) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `.env.local`, Vercel | No (public by design; protected by RLS) |
| `ANTHROPIC_API_KEY` (optional, AI drafting) | Vercel / `.env.local`, **server only** | **Yes** |

Never create a variable with a secret in a `NEXT_PUBLIC_` name: those are copied into the browser for every visitor. **Never put the `service_role` / secret key or the database password in this app, in `.env.local` files that get committed, or in Git.** `.env.local` is git-ignored. If a secret leaks, rotate it in the Supabase / Anthropic dashboard immediately.

## Migrations

Migrations are numbered, idempotent SQL files in [`migrations/`](migrations/):

| File | What it does |
| --- | --- |
| `0001_initial.sql` | Tables, per-account RLS policies, and the later additive columns (archive, categories, AI drafts) |
| `0002_security_hardening.sql` | Removes all anonymous access, same-account foreign keys, input limits, version marker |
| `0003_document_files.sql` | File uploads: the private `deal-documents` storage bucket, the `document_files` table, and the locks on stored files |
| `0004_daily_reminders.sql` | Daily reminder emails: settings columns, server-only tables, the scheduled sender, and the "send a test email" button |

To add one: create `migrations/0003_what_it_does.sql` (write it so running it twice is harmless), bump the version marker at its end (`insert into app_schema_version ... on conflict do nothing`), then run:

```
npm run build:sql
```

That regenerates `schema.sql` (what you paste) and `lib/schemaUpdateSql.ts` (what the app shows when behind). A unit test fails if you forget. To apply a migration to a real project, paste the new file (or the regenerated `schema.sql`) into the SQL Editor of the **test** project first, run the checks, then the production project.

Input limits are added `NOT VALID`: they apply to every new or changed row without failing on old rows. To check old data too, run `alter table ... validate constraint ...` after fixing any offending rows.

## Testing access control

Needs a throwaway local PostgreSQL (tested on 16; not Supabase):

```
createdb tcai_test
TEST_DATABASE_URL=postgresql://localhost/tcai_test npm run test:db
```

The script **wipes** the database it connects to, so it refuses any URL that looks hosted or whose name doesn't contain `test`. It imitates Supabase's `auth` pieces, applies every migration (twice, to prove they can be repeated), then runs [`tests/access_control.sql`](tests/access_control.sql): two fictional users each get a full set of records and the tests check, as each user, that they cannot read, change, delete, create or **reference** the other's records, that signed-out callers get nothing, that bad input is refused, that deleting an account removes only its own data, and that no future table can be added without RLS and a policy.

`npm test` (no database needed) also checks that the setup files are in sync with the migrations, that no code uses a service-role key or a secret under a `NEXT_PUBLIC_` name, validation, and the protected server routes against a pretend Supabase.

### Checking a real Supabase project

`npm run verify:supabase` (also available as a button: GitHub → Actions → "Verify Supabase access rules") signs in as **two throwaway test accounts** on a real project and tries, through the live API, to read, change, delete, plant and reference each other's records and files, to read as a signed-out visitor, to upload forbidden or oversize files, and to reach the server-only reminder pieces. It cleans up what it creates and exits with an error if any check fails. It only needs the public (publishable) key. The step-by-step is in [`docs/GO_LIVE.md`](../docs/GO_LIVE.md), Part 6. It was verified to catch deliberately broken rules (an over-wide read policy, a removed same-account link, anonymous access, over-wide file records).

### What has and has not been tested

Tested: the SQL access tests above (including the storage locks on stored files, with a stand-in for Supabase Storage's database tables, and the reminder logic with a stand-in that records the emails instead of sending them); the same attacks sent over HTTP through a real PostgREST (the layer Supabase uses) with real signed tokens; the app's flows against that hardened database; the upgrade path from the original schema. **Not** tested: Resend, `pg_cron` and `pg_net` for real (the email was captured, not delivered), Supabase's real Storage service (uploads and signed links were tested against a stand-in; only the database-side locks are exercised for real), a real Supabase project, Supabase's hosted Auth (email confirmation, password policy, rate limits), or load. Before storing real client records, repeat the access checks against your own `tcai-prod` project with two real test accounts, and review the settings in step 3.
