# Silang Memoirs — Yearbook Team System (Nexemeral 27)

React + Vite frontend, hosted free on **GitHub Pages**. **Supabase** provides login, database and row-level security (who can see/do what).

## Roles

| Role | Can do |
|---|---|
| **Admin** | Sees every department's overview, all tasks, the full calendar, every member, Settings (edit profiles / reset anyone's password), and the full Backup. Creates staff/head accounts. |
| **Head — Media / Colorist** | Hours-mode. Creates events (name, date, start/end time, location, description) on the calendar, sees Tracker (full ledger of every event + hours), Members (click a person to see their totals), and Backup. |
| **Staff — Media / Colorist** | View-only. Dashboard shows total hours, total assigned events, and upcoming events. Calendar shows just their own schedule. |
| **Head — Layout / Writing / Research** | Task-mode. Creates tasks with an assigned date + due date, sees a full Tasks tracker, Members, Outputs & Resources (can add links), and Backup. |
| **Staff — Layout / Writing / Research** | Sees their own tasks (with a running completed-count), their calendar (by due date), and can log Outputs and browse Resources. |
| **Colorist** (new) | After a Head Media event is marked "completed," it appears in Head Colorist's queue. They claim it for themselves or assign it to a colorist staff member; that person marks it "done" when the grade is finished. Both head and staff colorist dashboards show a colorgraded-event count. |

Every account can toggle light/dark mode from the sidebar, gets a notification bell (new task or schedule assignments, and colorist handoffs), and can change their own password from the sidebar. Only Admin gets the full **Settings** page for editing anyone's profile or resetting anyone's password.

---

## 1. Set up Supabase (free tier is enough)

1. Go to https://supabase.com → **New project**.
2. Once it's created, open **SQL Editor** → paste the entire contents of `supabase/schema.sql` → **Run**. This creates all tables, roles and security rules.
3. Open **Edge Functions** → **Deploy a new function** named `create-user`, and paste in `supabase/functions/create-user/index.ts` (or use the Supabase CLI — see below). This is what lets Admin create staff/head accounts from inside the app.
4. Open **Project Settings → API**. Copy the **Project URL** and the **anon / publishable key** — you'll need both in step 3 below.
5. Create your first Admin account manually:
   - **Authentication → Users → Add user** (set an email + password, tick "Auto confirm").
   - Go to **Table Editor → profiles**, find the row that was auto-created for that user, and change `role` to `admin`.

### Deploying the Edge Function with the CLI (recommended)
```
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy create-user
```

---

## 2. Set up the GitHub repo

1. Create a new **public or private** repo on GitHub (e.g. `silang-memoirs`).
2. Push this project to it:
   ```
   git init
   git add .
   git commit -m "Silang Memoirs yearbook system"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/silang-memoirs.git
   git push -u origin main
   ```
3. In the repo, go to **Settings → Pages** → under "Build and deployment", set **Source: GitHub Actions**.
4. Go to **Settings → Secrets and variables → Actions → New repository secret** and add:
   - `VITE_SUPABASE_URL` — your Supabase project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` — your Supabase anon/publishable key
5. Push again (or re-run the "Deploy Silang Memoirs to GitHub Pages" workflow under the **Actions** tab). Your site will be live at:
   `https://YOUR_USERNAME.github.io/silang-memoirs/`

> If your repo name isn't `silang-memoirs`, update the `base` value in `vite.config.js` and the favicon path in `index.html` to match.

---

## 3. Local development

```
npm install
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env
npm run dev
```

---

## 4. Creating accounts

Sign in as Admin → **Members → Create account**. Pick a role (Head Media, Staff Layout, etc.) — the department is set automatically. The new person can sign in immediately with the email/temporary password you set.

---

## 5. Google Sheets backup (Admin + Head Layout)

The **Backup** page always lets you **download CSV files** of members/tasks/schedules/outputs — no setup needed, just open the app and click.

For a live, one-click sync straight into a Google Sheet:

1. Create a new Google Sheet.
2. **Extensions → Apps Script**, delete the placeholder code, and paste this:

   ```javascript
   function doPost(e) {
     const payload = JSON.parse(e.postData.contents);
     const ss = SpreadsheetApp.getActiveSpreadsheet();
     writeSheet(ss, 'Members', payload.profiles);
     writeSheet(ss, 'Tasks', payload.tasks);
     writeSheet(ss, 'Schedules', payload.schedules);
     writeSheet(ss, 'Outputs', payload.outputs);
     return ContentService.createTextOutput(JSON.stringify({ ok: true }))
       .setMimeType(ContentService.MimeType.JSON);
   }

   function writeSheet(ss, name, rows) {
     if (!rows || !rows.length) return;
     let sheet = ss.getSheetByName(name);
     if (!sheet) sheet = ss.insertSheet(name);
     sheet.clearContents();
     const headers = Object.keys(rows[0]);
     sheet.appendRow(headers);
     rows.forEach(r => sheet.appendRow(headers.map(h => r[h] ?? '')));
   }
   ```

3. Click **Deploy → New deployment → Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy**, then copy the **Web app URL** (ends in `/exec`).
4. In the Silang Memoirs app, go to **Backup**, paste that URL into "Apps Script Web App URL", click **Save URL**, then **Sync now**. Your sheet will fill in with the latest data every time you click Sync.

Admin's sync pulls **everyone's** data across all departments into one spreadsheet. Head Layout's sync pulls only the Layout department, as a personal backup.

---

## Color palette
`#261e1a` (ink) · `#d0a97e` (sand) · `#b2b6ae` (sage) · `#acbcc4` (mist)
