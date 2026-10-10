# TC Assistant

An assistant for real estate transaction coordinators: onboarding new deals, tracking checklists and documents, and drafting follow-up emails. **Emails are never sent automatically.** You copy a draft into your own email app, send it there, then mark it as sent.

## Run it

```
npm install
npm run dev
```

Open http://localhost:3000. The app starts with two sample deals. You can reset to them any time from Settings.

## What it does

Five pages, sharing one set of deals, tasks, documents and drafts:

- **Dashboard:** active transactions, deals that still need onboarding, outstanding follow-ups, upcoming deadlines, a prioritized "needs attention" list, and quick actions (new transaction, draft an email).
- **Transactions:** a searchable, filterable table (client, property, agent, type, status, next action). Create, view, edit and archive. Each deal has its own page with onboarding progress, outstanding tasks, checklist, documents and emails.
- **Onboarding:** a card for every deal still being set up, with its missing information flagged, a checklist you can tick off, and the welcome emails ready to review. The new-transaction form (step one) generates the checklist and two welcome drafts automatically.
- **Email & Follow-ups:** what's overdue or coming up, a composer (pick a deal, a recipient, and what the email is about), and separate Drafts and Sent tabs. Every draft has an editable recipient, subject and message, plus copy, regenerate, save, approve, and mark-as-sent.
- **Settings:** your signature, defaults (transaction side, follow-up window), task categories, and a Templates tab for the checklists and the five email templates.

**Honest about what it doesn't do:** TC Assistant never sends email. "Generate" fills in your templates with the deal's details; it is not AI writing. A draft is only ever "marked as sent" because you sent it from your own email app and told the app. Nothing talks to Gmail or any other service.

## Project layout

- `app/` – pages (each folder is a URL)
- `components/` – reusable pieces of the interface
- `lib/types.ts` – the shape of every record (transaction, task, document, draft…)
- `lib/templates/` – the built-in checklists and email wording (your edits on the Templates page are saved and used instead)
- `lib/followups.ts`, `lib/onboarding.ts`, `lib/nextAction.ts` – work out what needs attention, how far onboarding is, and what to do next (calculated fresh each time, never stored)
- `lib/data/` – the "front desk" for saving and loading records

## Where your data lives

The app saves data one of two ways, chosen automatically by `lib/data/index.ts`:

- **Supabase (cloud, with login):** used when the two settings below are present. Each person logs in and only ever sees their own deals.
- **Browser storage:** used when they are missing. No login, and data stays in that one browser.

### Setting up Supabase

1. Create a project at supabase.com.
2. In the project, open **SQL Editor > New query**, paste the contents of `supabase/schema.sql`, and run it. This creates the tables and the locks that keep each account's data private. It is safe to run again.
3. Copy `.env.example` to `.env.local` and fill in the **Project URL** and **publishable key** (Project Settings > API Keys). On Vercel, add the same two variables under **Settings > Environment Variables** and redeploy.
4. In Supabase **Authentication > Sign In / Providers**, decide whether new accounts must confirm their email. Under **Authentication > URL Configuration**, set the Site URL to your deployed address.

Never put the `service_role` / secret key or the database password in this app or in Git.

Deals made before you had an account can be copied in from **Settings > Import into my account**.

When `supabase/schema.sql` changes, run the new version in the SQL Editor again. It is safe to repeat. If your database is behind, the app shows a "Your database needs a quick update" screen with the exact SQL and a Copy button, instead of failing in confusing ways.

"Reset to sample data" on a real account deletes all of its deals, so it asks you to type DELETE first. Use it only on a test account.

### Email template blanks

Email templates use `{{placeholders}}` such as `{{client_first_name}}` or `{{property_address}}`. Lists like `{{documents_needed}}` expand to a heading plus bullets and disappear when empty; write `{{documents_needed|Your own heading}}` to change the heading. The full list is on the Templates page.
