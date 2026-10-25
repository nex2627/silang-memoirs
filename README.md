# Silang Memoirs — Yearbook Team System (Nexemeral 27)

React + Vite + Supabase, hosted free on GitHub Pages at **https://smnexemeral27.xyz**.

## Roles

| Section | Position (label) | What they can do |
|---|---|---|
| Admin | Admin | Everything + **Settings** (create/edit accounts, reset passwords) |
| EDBO | **EIC**, **AEIC** | Add/edit everything (events, tasks, announcements, resources). No Settings. |
| EDBO | **TD** | Assigns colorgrade tasks (to self, colorists or EDBO), checks the **Posting Tracker**. Sees Colorist tasks only (not the Art Director's). |
| EDBO | **Art Director** | Gets the "Facebook cover" task automatically after colorgrade, marks it posted. Can be put on events and colorgrade tasks. |
| EDBO | **Head Media** | Creates/edits events, manages Media staff, backup for Media. |
| EDBO | Finance, Head Layout, Head Writer, Head Researcher | **View only** — can check everything, cannot add or edit. |
| Media | Staff (Media) | See their events + who is on the same event, mark "I've sorted my part". |
| Colorist | Staff (Colorist) | See and finish their colorgrade tasks. |

Event crew can carry a duty tag: **PM** Photo Main · **PC** Photo Creative · **VM** Video Main · **VC** Video Creative (tap the tag next to the name while assigning; editable later; shows in the calendar, trackers and backups).

Pipeline: every crew member marks their part *sorted* → event turns *completed* and TD is notified → TD assigns colorgrade → when all colorgrade tasks are done, the Art Director gets "Facebook cover — event" → marked posted.

---

## 1. Supabase (free tier is enough)
1. Supabase → **SQL Editor** → New query. Run **only these two lines first**, alone (Postgres can't use a new enum value in the same run that adds it):
   ```sql
   alter type user_role add value if not exists 'aeic';
   alter type user_role add value if not exists 'edbo';
   ```
   (On a brand-new project you can skip this; if it says the type doesn't exist, just go on.)
2. New query → paste all of `supabase/schema.sql` → **Run**. It is safe to re-run; it also converts old Finance / Head Layout / Head Writer / Head Researcher accounts to the EDBO role (with their Position kept) and creates the `resources` photo storage bucket.
3. **Authentication → Providers → Email**: keep on. (Optional: turn off "Confirm email".)
4. Create your first admin: Authentication → Users → Add user, then in SQL Editor:
   ```sql
   update public.profiles set role='admin', department='Media', full_name='YOUR NAME' where email='you@example.com';
   ```
5. Edge Functions — deploy/redeploy these three (Dashboard → Edge Functions, or CLI):
   ```bash
   supabase login
   supabase link --project-ref xbxrzywkormwegxkaxwi
   supabase functions deploy create-user
   supabase functions deploy admin-manage-user
   supabase functions deploy sheet-export --no-verify-jwt
   ```
   (`create-user` and `admin-manage-user` must be redeployed after this update — they now know the EDBO roles.)
6. **Project Settings → API**: copy the **Project URL** and the **publishable (anon) key**.

## 2. GitHub + push

### Secrets (once)
Repo → **Settings → Secrets and variables → Actions → New repository secret**:
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

### Pages (once)
Repo → **Settings → Pages → Source: GitHub Actions**.

### Push the update
Copy the files of this project over your existing repo folder (keep its hidden `.git` folder), then:
```bash
cd path/to/silang-memoirs
git add .
git commit -m "Update: EDBO roles, crew duties, backups, custom domain"
git push origin main
```
GitHub asks for a username and a **Personal Access Token** (not your password): GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate, tick **repo** and **workflow**. On a Mac, if it says "Invalid username or token", remove the old entry in Keychain Access (search `github.com`) and try again.

No `.git` folder (error "not a git repository")?
```bash
git init && git branch -M main
git remote add origin https://github.com/nex2627/silang-memoirs.git
git add . && git commit -m "Update"
git push -u origin main --force
```
Open the repo's **Actions** tab — a green check means it's live (about 1–2 minutes).

## 3. Custom domain: smnexemeral27.xyz
This project is already set up for it (`vite.config.js` uses `base:'/'`, and `public/CNAME` holds the domain). You do the DNS part:

1. At your domain registrar → **DNS records** (delete any old parking/forwarding records on `@`):

| Type | Host / Name | Value |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `nex2627.github.io` |

2. GitHub repo → **Settings → Pages → Custom domain** → type `smnexemeral27.xyz` → Save. Wait for the DNS check to turn green (minutes to a few hours), then tick **Enforce HTTPS**.
3. (Recommended) Supabase → **Authentication → URL Configuration** → set **Site URL** to `https://smnexemeral27.xyz`.
4. The old address `nex2627.github.io/silang-memoirs` will redirect to the new domain.

## 4. Local development
```bash
npm install
cp .env.example .env     # fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

## 5. Creating accounts (Admin → Settings → Create account)
Pick a **Section**: Admin / EDBO / Media / Colorist. For EDBO a **Position** list appears: EIC, AEIC, TD, Finance, Art Director, Head Layout, Head Media, Head Writer, Head Researcher. (TD, Art Director and Head Media are EDBO too — they just get their own tools.) For Media/Colorist choose Staff.

## 6. Google Sheet that updates itself (no script, no password)
The **Backup** page lists everyone by name (tap to expand events/tasks, with PM/PC/VM/VC), has a People filter (EDBO / Media / Colorist), an Events table (event date, name, medias, hours), and CSV downloads. For a Google Sheet that refreshes on its own:

1. Make a long random secret, e.g. `sm27-k8Zq2pLx9vTn4Rb7`.
2. Supabase → **Edge Functions → Secrets** → name **`SHEET_TOKEN`**, value = your secret.
3. Deploy `sheet-export` (step 1.5 above, **Verify JWT off**).
4. In a Google Sheet, put in cell **A1** of each tab (replace `YOUR_SECRET`):

| Tab | Formula |
|---|---|
| Summary | `=IMPORTDATA("https://xbxrzywkormwegxkaxwi.supabase.co/functions/v1/sheet-export?view=summary&token=YOUR_SECRET")` |
| Detail | `…sheet-export?view=detail&token=YOUR_SECRET` |
| Events | `…sheet-export?view=events&token=YOUR_SECRET` (Event Date, Event Name, Medias, Hours) |
| Posting Tracker | `…sheet-export?view=posting&token=YOUR_SECRET` |

   Add `&group=EDBO`, `&group=Media` or `&group=Colorist` to limit the people.
5. Share the sheet view-only, paste its link on the Backup page → **Save link**.

## 7. Resources
Admin / EIC / AEIC / Head Media / TD can add a **photo** (upload, max 5 MB — e.g. the AUP calendar) with an optional link, or a plain link. Tap a photo to open it full size.

## 8. Is it safe? (can people read my code in "inspect")
Yes, that's normal. A website's files (index.html, the `assets` JS) are always readable by anyone — that is how websites work, and it is true of every site. What matters is what's *in* them:
- The **Supabase URL and publishable (anon) key** are *meant* to be public. They only identify the project; **Row Level Security (RLS)** in `schema.sql` is what decides who can read or change data, and nobody can get past it without logging in with a role that is allowed.
- **Never** put the `service_role` key, the Supabase database password, or `SHEET_TOKEN` in the frontend, `.env.example` or GitHub. They live only in Supabase secrets. Never commit `.env` (it's in `.gitignore`).
- Use strong passwords for admin accounts, and rotate `SHEET_TOKEN` if it leaks.

## Color palette
`#261e1a` (ink) · `#d0a97e` (sand) · `#b2b6ae` (sage) · `#acbcc4` (mist)
