# Thesis Hub

A small private web app for thesis supervision. No AI, no paid APIs.

**You can:**
- create an intake (June or January defenses), paste in names and emails, and send login emails
- see one row per student: title, design, IV, DV, moderator, mediator, progress per thesis section, "help needed", last note, and flags (not invited, snapshot incomplete, draft waiting for you, no note for 30+ days)
- change a student's section progress, comment on notes, and export the overview as CSV
- click to send reminder emails: meeting-note reminder, "complete your overview", or check-in. Tick students or press "Select matching". The same reminder type never goes to the same student twice within 3 days.
- delete an intake and all its data after the defenses

**Students can:** log in with an emailed link or 6-digit code (no password), fill in their thesis snapshot, set progress for Introduction, Literature review, Methods, Data collection, Results and General discussion (Not started / In progress / Draft with supervisor / Done), flag that they are stuck, and write meeting notes (Done / Look at / Questions / Next, prefilled with last time's plan). They see only their own data.

## Stack
- **Supabase**: database, login emails, two small functions (`invite`, `remind`)
- **GitHub Pages**: hosts the static site in `docs/`
- **Resend or Brevo**: sends the reminder emails and the login emails (free tiers)

## Before real students use it
**Check the data policy.** The app stores names, emails and thesis details outside the University. Ask your data steward or privacy officer first. Use an **EU region** (Frankfurt). The delete-intake button is there to remove data after the defenses.

## Setup (about an hour)
1. **Email service.** Create a free account at Resend (needs a domain you control, to verify the sender) or Brevo (can verify a single sender address). Note: an API key, and the SMTP login details.
2. **Supabase project.** Region EU (Frankfurt). Save the database password.
3. **Tables.** SQL Editor > New query: run `supabase/migrations/001_init.sql`, then `002_progress_reminders.sql`.
4. **Auth settings** (Authentication):
   - Sign In / Providers: turn **off** "Allow new users to sign up".
   - URL Configuration: **Site URL** = your GitHub Pages address (step 8); add it to Redirect URLs.
   - SMTP Settings: enable **custom SMTP** with your email service's SMTP details. The built-in sender allows only a few emails per hour.
   - Rate Limits: raise "emails per hour" above your intake size (for example 100).
   - Email Templates > **Magic link**: make sure the body contains both the link and the code, for example:
     `<p>Log in to Thesis Hub: <a href="{{ .ConfirmationURL }}">click here</a></p><p>Or type this code: <strong>{{ .Token }}</strong></p>`
     The code matters: some university mail filters open links before the student does, which uses the link up.
5. **Make yourself admin.** Authentication > Users > Add user: your email, tick "Auto confirm". Then SQL Editor:
   `insert into public.admins (email) values ('your-email@university.nl');`
6. **Deploy the functions.** Install the Supabase CLI, then:
   ```
   supabase login
   supabase link --project-ref YOUR-PROJECT-REF
   supabase secrets set SITE_URL=https://YOUR-NAME.github.io/YOUR-REPO/ SENDER_NAME="Your Name" REPLY_TO=you@university.nl EMAIL_FROM=thesis@your-verified-domain.com RESEND_API_KEY=re_xxx
   supabase functions deploy invite
   supabase functions deploy remind
   ```
   Use `BREVO_API_KEY=...` instead of `RESEND_API_KEY` if you chose Brevo. `EMAIL_FROM` must be a sender your provider has verified.
7. **Fill in `docs/config.js`** with your Project URL and **anon** key (Project Settings > API). Never put the `service_role` key there.
8. **Publish.** Push this folder to a GitHub repo. Settings > Pages > Deploy from branch > `main`, folder `/docs`. The repo can be public: it holds code and the public anon key, no data.
9. **Keep the free project awake.** In the repo: Settings > Secrets and variables > Actions, add `SUPABASE_URL` and `SUPABASE_ANON_KEY`. The workflow in `.github/workflows/keepalive.yml` then pings the database every 3 days.
10. **Test** with a second email of your own as a student before inviting anyone.

## Costs
For 5 to 7 students in June and about 3 in January, the free tiers cover everything (database, logins, functions, email). Free Supabase projects have **no automatic backups**: export the overview CSV before deleting an intake. Without the keep-alive in step 9, they also pause after about a week of inactivity.

## How security works
- Row-level security on every table. Students can read and write only their own rows. Only emails in `admins` see everything. Tested locally against a real Postgres: one student cannot read or write another's data, cannot see the admin table or the reminder log, and strangers see nothing.
- Login emails go only to registered addresses (sign-ups are off, `shouldCreateUser: false`).
- Only you can call `invite` and `remind`; both check the caller against `admins`. Reminder wording is fixed in the function, so nobody can use it to send arbitrary email.
- Strict content-security policy; all text is written with `textContent`, so pasted HTML does not run. CSV export neutralizes spreadsheet formulas.

## Not included
- Automatic scheduled reminders (you click to send). A scheduled version is possible later.
- File uploads. Keep files in OneDrive as before.
- Several supervisors with separate student lists.
