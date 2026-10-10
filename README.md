# TC Assistant

An assistant for real estate transaction coordinators: onboarding new deals, tracking checklists and documents, and drafting follow-up emails. **Emails are never sent automatically.** You copy a draft into your own email app, send it there, then mark it as sent.

## Run it

```
npm install
npm run dev
```

Open http://localhost:3000. The app starts with two sample deals. You can reset to them any time from Settings.

## What it does

- **Dashboard:** open deals, overdue items, drafts to review, upcoming closings.
- **Transactions:** create buyer or seller deals; each gets a checklist and required-document list from a template.
- **Follow-ups:** everything overdue or due soon across all deals, with one-click drafts for the client or agent.
- **Emails:** edit, approve, copy, and mark drafts as sent.
- **Settings:** your name and signature for the bottom of each email.

## Project layout

- `app/` – pages (each folder is a URL)
- `components/` – reusable pieces of the interface
- `lib/types.ts` – the shape of every record (transaction, task, document, draft…)
- `lib/templates/` – checklist and email wording; edit these to change what gets generated
- `lib/followups.ts` – works out what needs attention
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
