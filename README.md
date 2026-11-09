# Thesis Hub

A small private web app for thesis supervision. No AI, no paid APIs.

**You can:**
- create an intake (June or January defenses), paste in names and emails, and create a login (random password) for each
- see one row per student: title, design, IV, DV, moderator, mediator, progress per thesis section, "help needed", last note, and flags (not invited, snapshot incomplete, draft waiting for you, no note for 30+ days)
- change a student's section progress, comment on notes, and export the overview as CSV
- write reminders in one click: meeting-note reminder, "complete your overview", or check-in. Tick students, copy their emails and the message, paste both into your own mail app, then press "Mark as sent".
- delete an intake and all its data after the defenses

**Students can:** log in with the email and password you give them, and change the password themselves, fill in their thesis snapshot, set progress for Introduction, Literature review, Methods, Data collection, Results and General discussion (Not started / In progress / Draft with supervisor / Done), flag that they are stuck, and write meeting notes (Done / Look at / Questions / Next, prefilled with last time's plan). They see only their own data.

## Stack
- **Supabase**: database, logins, one small function (`invite`: creates logins and resets passwords; `remind` is retired)
- **GitHub Pages**: hosts the static site in `docs/`
- No email service needed: the app sends no email.

## Before real students use it
**Check the data policy.** The app stores names, emails and thesis details outside the University. Ask your data steward or privacy officer first. Use an **EU region** (Frankfurt). The delete-intake button is there to remove data after the defenses.

## Setup (about an hour)
1. **Supabase project.** Region EU (Frankfurt). Save the database password.
2. **Tables.** SQL Editor > New query: run the files in `supabase/migrations/` in order.
3. **Auth settings** (Authentication): Sign In / Providers: turn **off** "Allow new users to sign up". Optionally set a minimum password length of 10.
4. **Make yourself admin.** Authentication > Users > Add user: your email and a password, tick "Auto confirm". Then SQL Editor:
   `insert into public.admins (email) values ('your-email@university.nl');`
5. **Deploy the function.** Install the Supabase CLI, then:
   ```
   supabase login
   supabase link --project-ref YOUR-PROJECT-REF
   supabase secrets set SITE_URL=https://YOUR-NAME.github.io/YOUR-REPO/
   supabase functions deploy invite
   ```
6. **Fill in `docs/config.js`** with your Project URL, **anon** key and your name (Project Settings > API). Never put the `service_role` key there.
7. **Publish.** Push this folder to a GitHub repo. Settings > Pages > Deploy from branch > `main`, folder `/docs`. The repo can be public: it holds code and the public anon key, no data.
8. **Keep the free project awake.** In the repo: Settings > Secrets and variables > Actions, add `SUPABASE_URL` and `SUPABASE_ANON_KEY`. The workflow in `.github/workflows/keepalive.yml` then pings the database every 3 days.
9. **Test** with a second email of your own as a student before inviting anyone.

## Costs
For 5 to 7 students in June and about 3 in January, the free tiers cover everything (database, logins, functions, email). Free Supabase projects have **no automatic backups**: export the overview CSV before deleting an intake. Without the keep-alive in step 8, they also pause after about a week of inactivity.

## How security works
- Row-level security on every table. Students can read and write only their own rows. Only emails in `admins` see everything. Tested locally against a real Postgres: one student cannot read or write another's data, cannot see the admin table or the reminder log, and strangers see nothing.
- Sign-ups are off. Only you can create logins: the `invite` function checks the caller against `admins`. Passwords are random, shown once, and not stored by the app.
- Strict content-security policy; all text is written with `textContent`, so pasted HTML does not run. CSV export neutralizes spreadsheet formulas.

## Not included
- Automatic reminders and self-service password reset: you send reminders from your own mail, and forgotten passwords are reset by you.
- File uploads. Keep files in OneDrive as before.
- Several supervisors with separate student lists.
