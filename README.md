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

For now, everything is saved in your browser (local storage), so it stays on the computer and browser you used and there is no login. All pages go through `lib/data/index.ts`, so moving to Supabase later means changing that one file.
