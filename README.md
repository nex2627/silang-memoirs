# Silang Memoirs — Yearbook Team System (Nexemeral 27)

React + Vite frontend, hosted free on **GitHub Pages**. **Supabase** provides login, database and row-level security (who can see/do what).

## Roles

| Role | Can do |
|---|---|
| **Admin** | Full access everywhere, including **Settings** (edit any profile, reset any password) — the only role that gets Settings. |
| **EIC / AEIC / Art Director** | Same as Admin everywhere *except* Settings — they cannot edit other people's profiles or reset passwords. |
| **Finance Manager / Assistant Finance Manager** | Read-only across every department's hours, events and tasks, plus full **Backup** access (view + download CSVs). No creating, editing, scheduling, or deleting. |
| **Head — Media** | Creates events on the calendar (name, date, start/end time, location, who's assigned), marks events "sorted" when done, edits/deletes events in the Tracker, sees the department's full ledger + Posting Tracker. |
| **Media (staff)** | View-only. Dashboard shows total hours, assigned events, and full detail on the next upcoming one. |
| **Head — Colorist / Layout Artist / Writer / Researcher** | Task-mode. Assigns tasks with an assigned + due date, sees a Tracker of finished work, Members, Resources (can add links), Backup. |
| **Colorist / Layout Artist / Writer / Researcher (staff)** | Sees their own undone tasks on the dashboard with a Done button; finished work moves to their Tracker. Can log Outputs and browse Resources. |

**The pipeline:** once Head Media marks an event "sorted," it becomes available work for Head Writer (caption) and Head Colorist (colorgrade) at the same time. Once Head Colorist's task is marked done, it becomes available for Head Layout ("posting cover"). Every step notifies the relevant head automatically.

Everyone gets a light/dark toggle, a collapsible sidebar (desktop) / bottom tab bar (mobile), a notification bell plus a full Notifications page, and can change their own password from the sidebar.

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

## 5. Google Sheets backup (pull-based — no involvement from the web app)

The **Backup** page in the app always gives you CSV downloads (an "All summary" and a "By person — detail" export) — no setup needed for that.

For a Google Sheet that keeps itself up to date automatically, the sheet pulls the data itself on a schedule, using one Apps Script. The web app never pushes to it — it only shows a "Check Google Sheet" link once you've told it the sheet's URL (Backup page → paste the link → Save).

### One-time setup

1. **Create a dedicated read-only login.** In the app, as Admin, go to **Members → Create account**, Section: *Finance* → role **Assistant Finance Manager**, name it something like "Sheets Sync". Finance roles can already view every department's hours and tasks, which is exactly the access the sheet needs — nothing extra to grant. Note its email and password.
2. **Create a Google Sheet** — one per section you want (Admin/all-data, Media, Colorist, Layout Artist, Writer, Researcher), or just one sheet with multiple tabs (the script below writes one tab per section anyway).
3. Open **Extensions → Apps Script** in that sheet and replace the default code with the script below.
4. At the top of the script, fill in the four config values (Supabase URL, anon key, and the Sheets-Sync account's email/password from step 1). Set `DEPARTMENT` to one of `'Media'`, `'Colorist'`, `'Layout Artist'`, `'Writer'`, `'Researcher'`, or leave it as `null` for a sheet with everyone's data (Admin view).
5. Run the `syncNow` function once manually (▶ button) — it'll ask for permissions the first time, approve them.
6. Set it to refresh automatically: click the clock icon (**Triggers**) → **Add Trigger** → function `syncNow` → time-driven → every 30 minutes (or however often you like).
7. Copy the sheet's shareable link, paste it into the app's **Backup** page (the "Paste the sheet's share URL" box), click **Save link**. Now everyone with Backup access sees a **Check Google Sheet** button.

### The script (same code for every sheet — just change `DEPARTMENT`)

```javascript
// ── Config — fill these in ──────────────────────────────────
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-or-publishable-key';
const SYNC_EMAIL = 'sheets-sync@yourteam.example';   // the Assistant Finance Manager account from step 1
const SYNC_PASSWORD = 'its-password';
const DEPARTMENT = null; // e.g. 'Media', 'Colorist', 'Layout Artist', 'Writer', 'Researcher' — or null for everyone
// ─────────────────────────────────────────────────────────────

function syncNow() {
  const token = signIn();
  const dept = DEPARTMENT ? `&department=eq.${encodeURIComponent(DEPARTMENT)}` : '';
  const profiles = restGet(`profiles?select=id,full_name,position,department,role${dept}`, token);
  const tasks = restGet(`tasks?select=*${dept}`, token);
  const schedules = restGet(`schedules?select=*,schedule_members(member_id)${DEPARTMENT==='Media'||!DEPARTMENT?dept:'&department=eq.Media'}`, token);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  writeSheet(ss, 'Members', profiles);
  writeSheet(ss, 'Tasks', tasks);
  writeSheet(ss, 'Events', schedules);
  ss.getRangeByName || ss.toast('Synced ' + new Date().toLocaleString());
}

function signIn() {
  const res = UrlFetchApp.fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: SUPABASE_ANON_KEY },
    payload: JSON.stringify({ email: SYNC_EMAIL, password: SYNC_PASSWORD })
  });
  return JSON.parse(res.getContentText()).access_token;
}

function restGet(path, token) {
  const res = UrlFetchApp.fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  return JSON.parse(res.getContentText());
}

function writeSheet(ss, name, rows) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name); else sheet.clearContents();
  if (!rows || !rows.length) return;
  const headers = Object.keys(rows[0]).filter(h => typeof rows[0][h] !== 'object');
  sheet.appendRow(headers);
  rows.forEach(r => sheet.appendRow(headers.map(h => r[h] ?? '')));
}
```

This calls Supabase's own REST API directly — the same one the web app uses — so it always reflects live data, and it respects the same security rules (the Sheets-Sync account only ever sees what a Finance role is allowed to see).

## Color palette
`#261e1a` (ink) · `#d0a97e` (sand) · `#b2b6ae` (sage) · `#acbcc4` (mist)
