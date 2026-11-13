# The Exchange — Visual refresh patch

This patch improves the create-poll page layout, mobile responsiveness, and the main-dashboard Create poll button.

## Files to replace

Upload and replace these three files in the root of your existing GitHub Pages repository:

- `index.html`
- `create.html`
- `styles.css`

No changes are required to `app.js`, `create-poll.js`, `config.js`, `users.json`, Supabase, or the database schema.

## What changed

- The create form is divided into four clearly separated sections: question, timing/context, answer options, and excluded participants.
- Description and additional specifications sit side-by-side on larger screens and stack on phones.
- Inputs, option controls, exclusion chips, and submit action have larger touch targets.
- Excluded participants display in a responsive grid.
- The Create poll action on the dashboard has a stronger visual hierarchy and a clearer plus icon.
- The layout adapts down to narrow mobile screens without horizontal overflow from the form controls.

After committing the three files, refresh the site. On desktop use Ctrl+Shift+R; on mobile, reload the page after the GitHub Pages deployment completes.
