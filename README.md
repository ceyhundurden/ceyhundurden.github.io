# Brain

A public digital mind map you can explore on an infinite, dark canvas.
Main modules, sub-modules and the connections between them; every node holds short notes
(anecdote, quote, link, image, video, code). See `ARCHITECTURE.md` for the architecture.

Live site: **https://ceyhundurden.github.io**

## How it works

The site is fully static (Next.js `output: "export"`) and served from GitHub Pages; there is no server.

- **Data:** `public/brain.json` in the repo is the single source of truth. Visitors read this
  static file.
- **Editing:** once you sign in, the browser reads the data straight from the GitHub API (the
  freshest version). Every change you make shows up on screen immediately; 3 s after the last
  change the whole `brain.json` is sent to `main` as a single commit (press `Ctrl+S` to save right away).
  The indicator in the top right shows the status: *Unsaved changes → Saving… →
  Saved · live in ~1 min*. If saving fails, your changes stay in the browser and
  **Try again** re-sends them. If you try to leave the page with unsaved changes,
  the browser warns you.
- **Deploy:** on every push to `main`, GitHub Actions (`.github/workflows/deploy.yml`) builds
  the site and uploads it to Pages. So an admin commit goes live in about a minute.
- **Auth:** there is no password; GitHub itself enforces permissions. You sign in with a
  fine-grained token that can write only to this repo. The token lives only in the browser's
  `localStorage` (`brain.gh-token`) and is removed with **Sign out**.

## Creating a token

1. Go to https://github.com/settings/personal-access-tokens/new.
2. Give it a name and an expiration (e.g. 90 days).
3. **Repository access** → **Only select repositories** → `ceyhundurden.github.io`.
4. **Permissions** → **Repository permissions** → **Contents: Read and write**
   (Metadata: Read-only is added automatically). Don't grant anything else.
5. **Generate token**, then copy the resulting `github_pat_…` value.
6. On the site, click **Sign in** in the top right → paste the token → **Sign in**.

If the token expires or is revoked, the site notices on load, discards the token and
drops you into read-only mode; just sign in again with a new token.

## Local development

```bash
npm install
npm run dev        # http://localhost:3000
```

In visitor mode the data is read from `public/brain.json`.

> **Warning:** if you sign in locally too, edits are committed directly to the **live repo**
> (written through the GitHub API, not to the local file) and appear on the site ~1 min later.
> Don't sign in if you only want to try out the UI. If your local `public/brain.json` and the
> repo's copy diverge, run `git pull` before pushing.

To produce the static output: `npm run build` → the `out/` folder (preview it with
`npx serve out` if you like). Code quality: `npm run lint`, `npx tsc --noEmit`.

## Deploy flow

1. Push this project to the `main` branch of the (public) `ceyhundurden/ceyhundurden.github.io`
   repo on GitHub.
2. Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. On every push (or via **Run workflow** in the Actions tab) the site is built and published.
4. Content edits are commits too, so they go live through the same flow; before changing code,
   don't forget to `git pull` those commits locally.

## Usage

**Everyone:** drag to pan (it glides when released), use the wheel / two fingers to zoom,
and look closer with the lens around the cursor. Click a node → a reading panel opens on the right.
Press `/` to search and Enter to fly to a module. You can link directly to a module with
`#node-id` in the address bar.

**Edit mode:** **Sign in** in the top right → token → turn on the **Edit** switch (shortcut `E`).

- **Click empty space** → type a title, Enter → new main module.
- **Drag** the **+** handle on a node's edge **onto empty space** → sub-module (type its name, then Enter).
- **Drag** the **+** handle **onto another node** → link (dashed line).
- **Drag a node by its body** → move it; the position is saved when you release.
- **Click a node** → edit its title, color (main modules) and blocks in the panel; changes
  are saved automatically.
- **Click an edge** → give it a label or delete it.
- `Delete` removes the selected node / connection (asks for confirmation), `Esc` clears the selection, `Ctrl+S` saves immediately.

## Backup

All data lives in `public/brain.json` and every change is a git commit; you can go back to
earlier versions through the repo history.
