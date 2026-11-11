# The Exchange — GitHub Pages prediction league

A one-page prediction game for a small friend group. It uses plain HTML, CSS, and JavaScript. No React, Node.js, npm, build step, or separately hosted application server.

## Simple architecture

- **GitHub Pages:** hosts the website.
- **`users.json`:** usernames, joke-game passwords, and avatar paths.
- **Supabase `polls` table:** all poll definitions and resolutions. Manage these rows in Supabase Table Editor.
- **Supabase `votes` table:** each person's current prediction.
- **`assets/avatars/`:** profile pictures committed to the GitHub repository.

There is no Supabase Auth, no `profiles` table, and no admin interface in the website.

## Important limitation

The username/password gate is deliberately not secure authentication. `users.json` is publicly downloadable from GitHub Pages, and anyone can inspect the website or browser requests. The public Supabase key is also visible by design. The database policies allow public reading and writing of vote rows so the static website can share votes without real user authentication. A person could impersonate another username or manipulate vote data. Use this only for an informal game; do not reuse real passwords or store sensitive information.

## 1. Set up Supabase

1. Create or open your Supabase project at https://supabase.com/.
2. Open **SQL Editor** and create a new query.
3. Paste the entire contents of `supabase/schema.sql` and click **Run**.
4. Open **Table Editor**. Confirm that you see `polls` and `votes`.

**Reset warning:** this SQL intentionally drops the previous prototype `profiles`, `polls`, and `votes` tables and recreates them with the simplified schema. It deletes any test polls/votes in those old tables. Run it before entering any real game data.

### Database tables

`polls` columns:

| Column | Type | Meaning |
|---|---|---|
| `id` | text, primary key | Unique ID you choose, e.g. `peter-drunk-sat-2026-11-14` |
| `question` | text | The poll question |
| `excluded` | jsonb | JSON array of excluded usernames, e.g. `["peter"]` |
| `closing_date` | timestamptz | Voting deadline, including timezone |
| `description` | text, nullable | Optional description |
| `specifications` | text, nullable | Optional text opened in an in-page dialog |
| `options` | jsonb | JSON array of answer strings, e.g. `["Yes", "No"]` |
| `resolved` | text, nullable | Exact winning option; leave NULL until resolved |
| `date_resolved` | timestamptz, nullable | Resolution date/time; leave NULL until resolved |
| `created_at` | timestamptz | Automatically generated |

`votes` columns:

| Column | Type | Meaning |
|---|---|---|
| `username` | text | Username from `users.json` |
| `poll_id` | text | ID of the poll |
| `choice` | text | Selected option |
| `updated_at` | timestamptz | Automatically set/updated by the website |

The primary key on `(username, poll_id)` gives each person one current prediction per poll. Submitting another option changes that person's existing vote until the deadline.

## 2. Configure the website connection

Open `config.js` and replace the placeholders:

```js
window.PREDICTION_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT-REF.supabase.co",
  supabaseKey: "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY",
  siteName: "THE EXCHANGE",
  refreshIntervalMs: 15000
};
```

Find the Project URL and **publishable** key in the Supabase dashboard (Project Settings / API Keys, or the project's Connect dialog). A legacy anon key also works. Never put a Supabase secret or service-role key in `config.js`.

## 3. Configure the six players

Edit `users.json` and replace the six placeholder entries. Example:

```json
[
  {
    "username": "peter",
    "password": "game-password-only",
    "avatar": "assets/avatars/peter.png"
  },
  {
    "username": "alex",
    "password": "another-game-password",
    "avatar": "assets/avatars/alex.png"
  }
]
```

Use unique lowercase usernames. Passwords are case-sensitive. `avatar` is a path relative to the repository; use an empty string if you do not want an image. Put each image in `assets/avatars/` with the filename used in `users.json`.

The first successful login stores the username in that browser's local storage. Logging out clears it. This is just a convenience gate, not a secure session.

## 4. Create and manage polls in Supabase

Open **Supabase → Table Editor → polls → Insert row**. You do not edit `polls.json`; the website reads the `polls` table directly.

Example row:

| Column | Value |
|---|---|
| `id` | `peter-drunk-sat-2026-11-14` |
| `question` | `Peter gets drunk this Saturday` |
| `excluded` | `["peter"]` |
| `closing_date` | `2026-11-14T23:59:00-05:00` |
| `description` | Optional text, or NULL |
| `specifications` | `Must be visibly intoxicated.` or NULL |
| `options` | `["Yes", "No"]` |
| `resolved` | NULL |
| `date_resolved` | NULL |

For the `excluded` and `options` columns, enter valid JSON arrays. Usernames in `excluded` must match the lowercase usernames in `users.json`.

To resolve a poll, edit its row:

1. Set `resolved` to the exact winning option, including capitalization.
2. Set `date_resolved` to the actual resolution timestamp, including timezone.
3. Save the row.

The database checks that the resolution matches one of the options and that `resolved` and `date_resolved` are either both NULL or both populated.

A poll automatically moves from **Open Polls** to **Closed Polls** when its `closing_date` passes. The website derives that state from the timestamp; it does not need a separate status field or background job. Poll and vote data refresh every 15 seconds while the page is visible. You can also click Refresh.

### Editing rules

- Give every poll a unique `id`. Do not change the ID after votes exist.
- Keep at least two strings in `options`.
- Do not change or remove an option after people have voted for it, unless you intend to invalidate those votes.
- Keep `resolved` and `date_resolved` NULL until the poll is resolved.
- When resolving, set both fields in the same edit.
- To void/delete a test poll, delete its row in Supabase Table Editor. Its votes are deleted automatically by the foreign key.

## 5. Scoring

For every resolved poll:

- Correct prediction: one win.
- Incorrect prediction: one loss.
- No prediction: one loss.
- Excluded user: neither win nor loss.

The leaderboard is calculated in the browser from `users.json`, the Supabase polls table, and the Supabase votes table. It sorts by wins, then accuracy, then total resolved predictions, then username.

Accuracy = wins / (wins + losses). Excluded polls are not included in the user's total.

## 6. Publish using GitHub Pages

1. Create a GitHub repository, e.g. `prediction-league`.
2. Upload the **contents** of this project folder to the repository root (do not upload an extra nested `prediction-league` folder).
3. Commit the files.
4. In GitHub, open **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Select branch `main` and folder `/ (root)`, then save.
7. Wait for the Pages deployment to finish. GitHub will display the website URL in the Pages settings.

You only need to commit to GitHub when changing the website code, `users.json`, or avatars. Adding, editing, and resolving polls happens in Supabase Table Editor.

## 7. Local testing

Do not open `index.html` directly as a `file://` URL; browsers commonly block JSON fetches from local files. Use VS Code Live Server, or run:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Project files

```text
prediction-league/
├── index.html
├── styles.css
├── app.js
├── config.js
├── users.json
├── .nojekyll
├── README.md
├── assets/
│   └── avatars/
└── supabase/
    └── schema.sql
```
