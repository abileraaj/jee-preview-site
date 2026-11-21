# JEE Main Test Series platform

Built so far: phase 1 (login, roles, landing page) and phase 2A (question papers:
entry, admin confirmation, publishing, export).

Stack: Next.js 16 (App Router, TypeScript, Tailwind 4), Supabase (PostgreSQL, Auth), Vercel.

## What works in this phase

- Landing page with features, how it works, pilot pricing and FAQs
- Login and signup by 6-digit email code, or Google
- First-login form: name, mobile, class, state, and parent consent for under-18s
- Student dashboard (empty until tests exist) and account page
- Faculty area and admin area, each locked to its role
- Admin can make any user a faculty member or admin
- All database tables with row-level security

## Login: mobile number + password

No email or SMS is needed. Two ways to get an account:

- **Students register themselves** at `/register`: name, mobile number, password.
- **Admin creates accounts** at **Admin -> Students**: one at a time, or an Excel list
  (columns Name, Mobile, Password; empty password = one is made automatically). The page
  shows the passwords once, with a download, so you can share them. **Reset password**
  makes a new one for a student who forgot theirs.

Every account can open free tests. Paid tests will unlock with a plan (payments phase).

### Extra setup: the secret key (2 minutes)

Account creation needs Supabase's secret key, which never leaves your server:

1. Supabase -> gear icon (Project Settings) -> **API Keys** -> **Secret keys** -> copy it.
   On older projects it is the **service_role** key under **Legacy API keys**.
2. Add a fourth line to `.env.local`:
   `SUPABASE_SERVICE_ROLE_KEY=the-secret-key`
3. Stop the app (Ctrl+C) and run `npm run dev` again.

Never share this key and never rename it to start with `NEXT_PUBLIC_`.

### Make yourself admin

Register at `/register` with your own mobile number, then run in the SQL Editor:

```sql
update public.profiles set role = 'admin' where mobile = '9876543210';
```

## Taking a test (students) and reports

### Extra setup (1 minute)

Run `supabase/migrations/0003_attempts.sql` in the Supabase SQL Editor.

### How it works

- **Dashboard** lists the tests open now (Start / Resume / Report) and those coming up.
- **Instructions page** → tick "I have read the instructions" → **Start the test**. The 180-minute
  clock runs on the server from that moment, even if the page is closed.
- **Exam screen** (NTA style): Physics / Chemistry / Mathematics tabs, question palette,
  timer, SAVE & NEXT, SAVE & MARK FOR REVIEW, CLEAR, MARK FOR REVIEW & NEXT, BACK, NEXT,
  SUBMIT, and an on-screen keypad for numerical answers. As in the real exam, an answer
  counts only after SAVE & NEXT or SAVE & MARK FOR REVIEW.
- Time on every question is recorded (revisits add up). Answers save to the server every
  15 seconds, on every change of tab and before submitting; if the network drops they are
  kept in the browser and sent later. At zero the test submits itself.
- **Report card** after submitting: score, rank, NTA percentile (among everyone who has
  taken that test so far), correct / wrong / not answered, accuracy, marks lost, time used;
  per subject with strongest and weakest; a chart of time on every question; slow-and-wrong
  and possibly-careless questions; chapter strengths and chapters to revise; every
  question with your answer, the correct one, your time vs average vs topper; solutions.
  **Download PDF / Print** saves it as a PDF.
- **Progress** page: score per test with a Total / Physics / Chemistry / Mathematics toggle,
  ▲▼ changes per subject, and an alert when a subject drops, naming the chapters that were
  strong before and went wrong now.

### Staff trial

Staff can take any paper before its date (even unpublished): open the paper → **Try as
student**. Trial attempts are left out of students' ranks and percentiles, and can be
deleted from the bottom of their report to take the paper again.

### What to test

1. As admin: PT-1 → Try as student → start. Answer a few questions, mark one for review,
   type a numerical answer with the keypad, switch subjects, refresh the page mid-test
   (answers and time should come back), then submit.
2. Check the report: scores, subject table, time chart, chapter table (set chapters on the
   questions first), solutions, Download PDF.
3. Delete the trial, take it again with different answers, and look at Progress.
4. On a phone (same Wi-Fi, `http://192.168.x.x:3000`): the palette opens from **Questions**.

## Import a question paper from PDF or photos

Open a paper → **Import from PDF or photos**.

1. **Upload** one PDF, or photos of the pages (select all at once; name them in page
   order, e.g. `page1.jpg`, `page2.jpg`). Word files: in Word, File → Save As → PDF first.
2. **Check the blue lines.** Each marks where a question starts. The software finds the
   question numbers (1., 2., Q3, Question 4 …), handles two-column papers, and leaves out
   the cover page, the answer-key page, repeated headers/footers and subject headings.
   Click on a page to add a line; click × to remove one.
3. **Subjects.** Say which questions are Physics, Chemistry and Maths (e.g. Q1–25,
   Q26–50, Q51–75). Within a subject the first 20 go to Section A, the last 5 to Section B.
4. **Answer key.** Paste it (e.g. `1-B, 2-C, 3-(4), 21-4.5`; options as A–D or 1–4) or pick
   each answer. Every question is shown as the picture students will see.
5. **Save.** Questions are saved as drafts. Then set chapters and confirm each one on the
   paper page before publishing.

Notes:
- A PDF made from Word or a typesetting tool works best: question numbers are read exactly.
- Scans and photos are read by text recognition, which downloads about 10 MB the first
  time and needs internet. If it cannot run, mark the questions by hand with clicks.
- Each question is stored as a picture, so formulas and diagrams look exactly as printed.

## Phase 2A: question papers

### Extra setup (5 minutes)

In the Supabase **SQL Editor**, run these two files in this order:

1. `supabase/migrations/0002_papers.sql`
2. `supabase/seed/0002_schedule.sql` (creates the 33 scheduled papers, PT-1 to GT-15)

Then, as admin, open **Admin -> Chapters**, download the template, fill in your chapters
and topics, and upload it.

### How a paper moves

1. **Faculty** open **Faculty**, pick a paper and fill in the question forms one below the
   other. Each form has the question box, a picture upload, four option boxes (each with
   its own Picture button), the correct answer, chapter, topic and solution.
2. **Preview** shows the question exactly as the student will see it. **Save question**
   stores it. Its circle turns amber.
3. **Admin** opens the same paper, checks each question and presses **Confirm question**
   (the circle becomes a green tick) or **Needs correction** with a note for the faculty.
   The admin can edit any question; an edit needs confirming again.
4. When all 75 are confirmed, **Publish to students** becomes available. A published
   paper appears to students from its scheduled date (the student test screen is the
   next phase).

Every question has its own ID: the paper code plus the question number, e.g. `PT-1-Q07`.

### Exports

- One paper: **Excel**, **Word** and **PDF / Print** links at the top of the paper.
  For PDF, press the button and choose "Save as PDF" in the print window.
- Everything: **Export all questions (Excel)** on the papers page.

### What to test in phase 2A

1. The papers page lists 33 papers with the right dates (PT-1 on 24 Nov, GT-15 on 20 Jan).
2. Upload the chapter template; the chapters appear in the drop-downs.
3. As faculty, add a typed question, a question with a picture, an option with a picture
   and a numerical question (Q21). Preview each one.
4. Try saving with a missing option or no correct answer: you get a clear message.
5. As faculty, the Confirm and Publish buttons are absent.
6. As admin, confirm one question and send one back with a note; faculty sees the note.
7. Edit a confirmed question: it goes back to "awaiting admin".
8. Download Excel, Word and PDF for the paper and check the pictures appear.
9. Publish is refused until all 75 questions are confirmed.

### Known limitations of phase 2A

- These screens were built and checked without a live Supabase project. The database
  rules are tested (`npm run test:schema`); the screens need your first real run.
- Formulas are typed as plain text. For anything complex, attach a picture. Proper
  formula display arrives with the student test screen.
- Pictures must be PNG or JPG, up to 2 MB each.
- A removed picture stays in storage (it is no longer shown anywhere).
- Uploading a whole paper as PDF, Word or photos and splitting it automatically is the
  next piece (phase 2B). Until then questions are entered through the forms.

## Setup (about 20 minutes)

You need Node.js 20 or newer and a free Supabase account.

### 1. Supabase project

1. At supabase.com create a project. Region: **Mumbai (ap-south-1)**.
2. Open **SQL Editor**, paste all of `supabase/migrations/0001_schema.sql`, click **Run**.
3. Do the same with `supabase/seed/0001_seed.sql`.

### 2. Make the login email send a code

Supabase sends a link by default. To send a 6-digit code as well:

1. **Authentication -> Emails -> Templates**. Edit both **Magic Link** and **Confirm signup**.
2. Set the body of each to:

   ```html
   <h2>Your login code</h2>
   <p style="font-size:28px;letter-spacing:6px"><b>{{ .Token }}</b></p>
   <p>Enter this code on the login page. It expires in one hour.</p>
   <p>Or <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">log in with this link</a>.</p>
   ```

3. **Authentication -> URL Configuration**: set **Site URL** to `http://localhost:3000`
   and add `http://localhost:3000/**` under **Redirect URLs**.
   When the site goes live, add the real address in both places.

### 3. Run it on your computer

```bash
npm install
cp .env.example .env.local      # then fill in the two Supabase values
npm run dev
```

The two values are in Supabase under **Project Settings -> API**: the project URL and the
anon (publishable) key. Open http://localhost:3000.

### 4. Make yourself the admin

See "Make yourself admin" above (register with your mobile number, then one SQL line).

### 5. Google login (optional)

In Google Cloud Console create an OAuth client (type: Web application). Use the callback
URL that Supabase shows under **Authentication -> Sign In / Providers -> Google**, then paste
the client ID and secret there. Until this is done the Google button shows an error;
email login is unaffected.

### 6. Put it online (Vercel)

1. Push this folder to a GitHub repository.
2. In Vercel: **Add New -> Project**, import the repository.
3. Add the three variables from `.env.local` under **Environment Variables**, with
   `NEXT_PUBLIC_SITE_URL` set to the live address.
4. Deploy, then add the live address to Supabase **URL Configuration** (step 2.3).
5. Point the domain at Vercel under **Project -> Settings -> Domains**.

## Changing the name

The product name, tagline and support email are in `lib/config.ts`. Change them there only.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Run locally with live reload |
| `npm run build` | Production build |
| `npm run lint` | Code style check |
| `npm run typecheck` | TypeScript check |
| `npm run test:schema` | Runs the schema and its security rules against an in-memory database |

## What to test

1. Home page loads on a phone and a laptop; menu links scroll to the sections.
2. Sign up with an email you have not used: the code arrives, and you land on the details form.
3. Leave a field empty or type a 9-digit mobile: you get a clear message and nothing is saved.
4. Choose "under 18" without ticking the consent box: it refuses.
5. After saving you see the dashboard; Account shows what you entered; Edit details works.
6. Log out, then open `/dashboard` directly: you are sent to the login page.
7. As a student, open `/admin` and `/faculty` directly: you are sent back to the dashboard.
8. As admin, change another user's role; that user sees the Faculty menu after reloading.
9. Type a wrong code on the login page: you get an error and stay logged out.

## Known limitations of phase 1

- **Email sending.** Supabase's built-in email is for testing only and allows very few
  emails per hour. Before the pilot, connect your own email provider under
  **Authentication -> Emails -> SMTP Settings** (Resend, Amazon SES or similar).
- **Parent consent** is a self-declared form with the parent's name and number. It records
  when consent was given but does not verify the parent. Take legal advice on what Indian
  data protection law requires before the paid launch.
- **Mobile numbers** are collected but not verified; mobile OTP comes later.
- **One device per account** is not enforced yet; it arrives with the test screen.
- **Sample data** has subjects, 2 plans (placeholder prices) and 1 coupon. Sample students
  and the sample mock test arrive with the phases that create them.
- Terms, Privacy and Refund pages arrive with the payments phase.
- No tests, payments or reports yet; those are phases 2 to 5.

## Folder map

```text
app/(public)/        landing page
app/(auth)/login/    login form
app/auth/            login callbacks and logout
app/onboarding/      details form shown after first login
app/(student)/       dashboard and account
app/faculty/         question papers: dashboard, question forms, print, exports
app/admin/chapters/  chapter and topic upload
app/admin/           admin area
components/          shared interface pieces
lib/                 configuration, login helpers, database clients
proxy.ts             keeps sessions fresh and guards private pages
supabase/migrations/ database schema and security rules
supabase/seed/       sample data
scripts/             schema test
```
