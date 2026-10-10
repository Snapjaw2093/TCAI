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

**Honest about what it doesn't do:** TC Assistant never sends email. "Generate" fills in your templates with the deal's details; that button is not AI. The separate **Draft with AI** button writes a first draft with a language model (see [AI drafting](#ai-drafting)). A draft is only ever "marked as sent" because you sent it from your own email app and told the app. Nothing talks to Gmail or any other service.

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
2. In the project, open **SQL Editor > New query**, paste the contents of `supabase/schema.sql`, and run it. This creates the tables, the locks that keep each account's data private, and the checks that refuse bad input. It is safe to run again.
3. Copy `.env.example` to `.env.local` and fill in the **Project URL** and **publishable key** (Project Settings > API Keys). On Vercel, add the same two variables under **Settings > Environment Variables** and redeploy.
4. In Supabase **Authentication > Sign In / Providers**, decide whether new accounts must confirm their email. Under **Authentication > URL Configuration**, set the Site URL to your deployed address.

Never put the `service_role` / secret key or the database password in this app or in Git. The app never uses them.

**Use two Supabase projects: one for testing (made-up data only) and one for real clients,** with their keys in separate Vercel environments. The full guide, covering the schema, the access model, Auth settings, migrations and the access-control tests, is in [`supabase/README.md`](supabase/README.md).

Deals made before you had an account can be copied in from **Settings > Import into my account**. Don't import real client records while developing. **Settings > Download my data** gives you a file of everything in your account.

When `supabase/schema.sql` changes (it is generated from `supabase/migrations/`, see `npm run build:sql`), run the new version in the SQL Editor again. It is safe to repeat. If your database is behind, the app shows a "Your database needs a quick update" screen with the exact SQL and a Copy button, instead of failing in confusing ways.

"Reset to sample data" on a real account deletes all of its deals, so it asks you to type DELETE first. Use it only on a test account.

### Email template blanks

Email templates use `{{placeholders}}` such as `{{client_first_name}}` or `{{property_address}}`. Lists like `{{documents_needed}}` expand to a heading plus bullets and disappear when empty; write `{{documents_needed|Your own heading}}` to change the heading. The full list is on the Templates page.

## AI drafting

On **Email & Follow-ups** (or the dashboard's "Draft with AI" shortcut) you pick a deal, the kind of email, who it is to, and a tone, optionally add instructions, and the AI writes a subject and message into your Drafts tab. **The AI only drafts.** It cannot send anything, contact anyone, or change a deal; you edit, approve and send it yourself.

Think of it like a junior assistant who is handed a sticky note, not the whole file. The note holds only the facts you can see in "What will be sent to the AI", and the assistant is told to leave a blank for anything that isn't on the note.

### Setup

1. Pick one AI service and get a key:
   - **Google Gemini** (has a free tier): create a key in [Google AI Studio](https://aistudio.google.com). **Check Google's current terms before using real client data on the free tier:** free-tier prompts may be used to improve Google's products, while paid use is treated differently.
   - **Anthropic Claude:** a key from [console.anthropic.com](https://console.anthropic.com); set a monthly spend limit there.
2. Add it as an environment variable. Locally, in `.env.local`; on Vercel, under **Settings > Environment Variables**, then redeploy:

| Variable | Required | What it does |
| --- | --- | --- |
| `GEMINI_API_KEY` | one of the two | Your Gemini key. **Server-only.** Never give it a `NEXT_PUBLIC_` name; that would publish it to every visitor. |
| `ANTHROPIC_API_KEY` | one of the two | Your Claude key. Same rule. |
| `AI_PROVIDER` | no | `gemini` or `anthropic`. If unset, whichever key exists is used (Claude if both). |
| `GEMINI_MODEL` | no | Gemini model (default `gemini-2.5-flash`). Google renames models over time: if drafting says the model isn't available, set this to a current one from AI Studio. |
| `ANTHROPIC_MODEL` | no | Model to use (default `claude-opus-5-5`). `claude-sonnet-5-5` or `claude-haiku-5-5` are cheaper and faster. |
| `ANTHROPIC_EFFORT` | no | `low`, `medium` (default), `high`, or `off`. |
| `AI_TIMEOUT_MS` | no | Give up on the AI after this long (default 45000). |
| `AI_RATE_LIMIT_PER_MINUTE` | no | Drafts per person per minute (default 6). |
| `AI_RATE_LIMIT_PER_DAY` | no | Drafts per person per day (default 60). |
| `AI_GLOBAL_DAILY_LIMIT` | no | Drafts for the whole site per day (default 500). |
| `AI_ALLOW_ANONYMOUS` | no | `true` lets visitors without a login use AI on a live site that has no Supabase. Leave unset. |

3. Run the latest `supabase/schema.sql` in the Supabase SQL Editor (it adds a column and allows an "ai" draft kind). The app shows the SQL with a Copy button if it is missing.

**Check your setup:** open `/api/ai/draft` on your site. It shows `{"configured":true,"provider":"gemini",...}` (never the key). Then make a draft with a made-up deal.

Without a key the page simply says AI drafting isn't set up, and the rest of the app works as before.

### How it works

- **Server only.** The browser calls `/api/ai/draft`; that route holds the key and talks to the model. With Supabase on, callers must be logged in. Without it, the route is open only during local development.
- **Minimal facts.** Only the property address, side, today's date, the client and agent names, the recipient's name and role, and the dates, documents and tasks you left ticked are sent. Phone numbers, email addresses, price and private notes are never sent, and neither is an email address you type for the recipient.
- **No inventing.** The AI must use only those facts and leave `[ADD: …]` gaps for anything else. If something required is missing (for example no document picked for a document reminder), the app asks you before spending anything.
- **Unverified until you confirm.** Contract and closing dates, deadlines and which documents are required are marked Unverified, and the draft words them as "our records show… please confirm" until you tick "I've checked… against the signed contract".
- **Double check.** After the AI answers, the app flags any date, amount, email, phone or URL that is not in the source facts. Approve stays disabled while `[ADD: …]` gaps remain or flagged details haven't been reviewed.
- **Source panel.** Every AI draft shows its source table (what each fact is and where it came from), the facts the AI used, what is still needed from you, and warnings.
- **Protection against overuse.** Per-minute, per-day and site-wide limits, request-size limit, a timeout, a short wait on the button, and friendly messages for every failure. Limits are kept in server memory, so on serverless hosting they are a speed bump per server instance, not a hard cap; the spend limit in your Anthropic account is the real backstop.

### Tests

`npm test` runs the AI tests (fact-building, validation, the guard that checks the AI's answer, rate limits, and the API route against a pretend model). They make no real API calls and use fictional deals only.
