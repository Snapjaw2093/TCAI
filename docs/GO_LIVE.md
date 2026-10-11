# Going live with real clients

Work through this top to bottom. Do not enter real client details until **every** box is ticked. Think of it as opening a restaurant: the kitchen works (the app), but the health inspection (this list) comes before the first customer.

The app is **not** production-ready until Part 6 passes on your production project. Passing tests on a stand-in is not the same as passing on the real thing.

## Part 0: decide how people get accounts (recommended: invite only)

- **Invite only (recommended).** You create each account by hand. Nobody else can sign up. No confirmation emails are needed, so you don't need a custom email setup.
- **Open signup.** Anyone can create an account. They only ever see their own empty workspace, but you then need confirmation emails working (custom SMTP, see Part 3) and should expect junk accounts.

## Part 1: a separate production project

Keep a **test** project (made-up data only) and a **production** project (real clients). They share nothing.

- [ ] Create a new Supabase project, for example `tcai-prod`. Choose a region near you.
- [ ] Generate a strong database password and keep it in a password manager. The app never needs it. Never paste it anywhere.
- [ ] Decide on the plan. Free projects can be paused after a period of inactivity and have limited backups. For real client data, a paid plan with daily backups is worth considering. Check Supabase's current pricing and limits, as they change.

## Part 2: set up the database

- [ ] SQL Editor → New query → paste all of [`supabase/schema.sql`](../supabase/schema.sql) → Run.
- [ ] Storage → confirm a bucket named **deal-documents** exists and is marked **Private**.
- [ ] (Optional, for daily reminders) follow "Daily reminder emails" in [`supabase/README.md`](../supabase/README.md). Use a **separate** Resend API key for production, and put it in this project's Vault.

## Part 3: sign-in settings (Supabase → Authentication)

- [ ] **Sign In / Providers → Email:** enabled.
- [ ] **Minimum password length:** 10 or more (the app asks for 8 as a floor). Turn on character requirements and leaked-password protection if your plan offers them.
- [ ] **Allow new users to sign up:** turn **off** for invite-only (do this *after* creating the accounts in Part 4).
- [ ] **Confirm email:** on, if you allow open signup. For that you must also set up **custom SMTP** (Authentication → SMTP Settings, for example Resend with a domain you've verified). Supabase's built-in email sender is heavily rate-limited and is not meant for real users.
- [ ] **URL Configuration:** Site URL = your real site address. Remove any other redirect URLs you don't use.
- [ ] Review **Rate Limits** and leave Supabase's defaults or tighten them.

## Part 4: create the accounts

- [ ] Authentication → Users → **Add user → Create new user**, tick **Auto Confirm User**, and use a strong unique password. Share it through a safe channel and ask the person to keep it private.
- [ ] Keep the list of who has access. Remove people who leave (Users → ⋯ → Delete user). Their data is deleted with them, but **stored files are not**: also empty `deal-documents/<their user id>/` under Storage.
- Known gap: the app has no "forgot password" page yet. If someone is locked out, you reset their password from the Supabase dashboard. Building a reset flow is on the to-do list and needs custom SMTP.

## Part 5: the website (Vercel)

Use **different values** for the real site and for everything else. In Vercel → Settings → Environment Variables, tick the environments carefully:

| Variable | Production | Preview and Development |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | production project | **test** project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | production project | **test** project |
| `ANTHROPIC_API_KEY` (or `GEMINI_API_KEY`) | your key (Sensitive) | a separate key, or none |
| `NEXT_PUBLIC_APP_ENV` | *(leave unset)* | `test` (shows a yellow "TEST SITE" banner) |

- [ ] Redeploy Production after changing variables.
- [ ] Settings → Deployment Protection: require Vercel login for **Preview** deployments, so test copies aren't public.
- [ ] Open the production site: no yellow banner. Open a preview: yellow banner.
- [ ] Never put the `service_role` / secret key or the database password in Vercel. The app doesn't use them.

## Part 6: prove the access rules on the real project

This signs in as two throwaway accounts and tries to read, change and plant each other's records and files, then cleans up after itself. It uses only the public key, like a normal browser.

1. In the Supabase project you're checking, create **two throwaway users** (Authentication → Users → Add user, Auto Confirm) such as `verify-a@example.com` and `verify-b@example.com`, with strong passwords. Do this **before any real client data exists** on production, or run it on the test project.
2. In GitHub → the repository → Settings → Secrets and variables → Actions, add these **secrets**: `VERIFY_SUPABASE_URL`, `VERIFY_SUPABASE_PUBLISHABLE_KEY`, `VERIFY_USER_A_EMAIL`, `VERIFY_USER_A_PASSWORD`, `VERIFY_USER_B_EMAIL`, `VERIFY_USER_B_PASSWORD`. Optionally add a **variable** `VERIFY_APP_URL` (your site address) to also check the site's own server routes.
3. Actions tab → **Verify Supabase access rules** → Run workflow → type `yes-this-is-a-test-project` → Run.
4. Every line must say PASS. If any line says FAIL, **do not use real data** and send me the output.
5. Delete the two throwaway users, and the six secrets above, when you're done.

(To run it on your own computer instead: set the same values as environment variables and run `npm run verify:supabase`. See the top of `scripts/verify-supabase.mjs`.)

## Part 7: before the first real client

- [ ] Parts 1 to 6 all ticked.
- [ ] Sign in as yourself on the production site and make one fake deal, upload one fake file, create one fake draft. Delete them.
- [ ] Use **Settings → Download my data** once, to see what a backup export looks like. It lists files but doesn't contain them.
- [ ] Decide who is responsible for: removing people who leave, rotating keys if one leaks (Supabase, Anthropic, Resend), and keeping an eye on Anthropic and Resend usage.
- [ ] Think about what your clients have been told about how their details are stored and used. The AI sees names, addresses, dates and document names (never phone numbers, emails, prices or private notes), and that goes to the AI company you chose. Check their terms for your plan, and local rules for client data.
- [ ] Remember there is no virus scanning on uploaded files, and treat downloads like email attachments.

## When something leaks

Rotate the key in the service that issued it (Supabase → Project Settings → API; Anthropic or Google console; Resend), update it in Vercel, redeploy, and check usage on that service for activity you don't recognise. Keys must never be pasted into chats, screenshots or Git.
