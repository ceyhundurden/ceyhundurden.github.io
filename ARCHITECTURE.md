# Brain — Architecture

A public, personal mind map you can explore on an infinite canvas.
No long-form writing; just interconnected nodes made of short anecdotes.

## 1. Technology

Live site: **https://ceyhundurden.github.io** (repo `ceyhundurden/ceyhundurden.github.io`, public).

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 + TypeScript, `output: "export"` (fully static) | GitHub Pages can't run a server; it only serves static files |
| Canvas | HTML5 Canvas 2D + our own camera system | Smooth with thousands of nodes; lets us apply the lens (fisheye) effect at the pixel level |
| UI layer | React + plain CSS (CSS Modules) | Panels, forms and popovers as DOM on top of the canvas |
| Data | `public/brain.json` in the repo | Single source of truth. Visitors read the static file |
| Writes | Commits to `public/brain.json` from the browser via the GitHub Contents API | Serverless admin panel |
| Auth | Fine-grained GitHub token (this repo only, Contents: read/write), kept in the browser's `localStorage` | There's no server to check a password; GitHub itself enforces permissions |
| Deploy | GitHub Actions: builds and deploys to Pages on every push to `main` | An admin commit goes live in ≈1 min |

### Save flow
1. In edit mode, the working copy of the graph is kept in the browser. Every change shows up on screen immediately.
2. 3 s after the last change, the whole `brain.json` is sent as a single commit (with its `sha`).
   On a sha mismatch (409/422) the file's sha is re-fetched and the write is retried.
3. Status indicator: *Unsaved changes → Saving → Saved · live in ~1 min*.
   Leaving the page with unsaved changes triggers a warning.
4. In admin mode the data is read from the GitHub API to get the freshest version. Visitors read `/brain.json`.

## 2. Data model

```ts
type NodeKind = "main" | "sub";

interface BrainNode {
  id: string;
  kind: NodeKind;          // main module / sub-module
  title: string;
  x: number; y: number;    // world coordinates (unbounded)
  color?: string;          // main module color; sub-modules inherit from their parent
  blocks: ContentBlock[];  // entries
  createdAt: string; updatedAt: string;
}

type ContentBlock =
  | { id: string; type: "text";  text: string }                 // short anecdote
  | { id: string; type: "quote"; text: string; source?: string }
  | { id: string; type: "link";  url: string; title?: string; note?: string }
  | { id: string; type: "image"; url: string; caption?: string }
  | { id: string; type: "video"; url: string; caption?: string } // YouTube/Vimeo embed
  | { id: string; type: "code";  code: string; lang?: string };

type EdgeKind = "child" | "link";   // child = hierarchy (solid line), link = cross-link (dashed)

interface BrainEdge { id: string; source: string; target: string; kind: EdgeKind; label?: string }

interface Graph { nodes: BrainNode[]; edges: BrainEdge[] }
```

## 3. API

There is no API server. On the client side, `src/lib/backend.ts` provides two access paths:

- `loadPublicGraph()` (visitor): read-only access via `GET /brain.json`
- `GitHubBackend` (admin): reads (with its `sha`) and writes `public/brain.json` via the Contents API

All operations on the graph (add, update, delete nodes/edges) run in the browser as pure
functions (`src/lib/graph-ops.ts`) and are validated by `validate.ts`.

Deleting a node also deletes the edges attached to it.

## 4. Canvas engine (`src/engine/`)

- **Camera:** `{x, y, zoom}`. Drag to pan (glides with inertia on release),
  wheel zoom toward the cursor (0.1x–4x), two-finger gestures on touch.
- **Sense of infinity:** The background is procedural, i.e. computed rather than stored. Across 3 parallax
  layers: deterministic "star" points hashed from cell coordinates, plus a very
  faint dot grid. Wherever you go, the void continues; you never
  hit an edge. A soft vignette around the edges, a light haze in the distance.
- **Lens:** A fisheye distortion with a radius of ~110px around the cursor
  (Sarkar–Brown). Applied to stars, edges and nodes in screen space.
  Nodes near the cursor grow, those farther away are compressed. Its rim is a thin, bright ring.
  It fades in and out smoothly over time; it fades out when the cursor leaves the canvas.
- **Rendering:** In the `requestAnimationFrame` loop, off-screen nodes are skipped.
  Main modules are large and glowing, sub-modules are small. `child` edges are drawn solid and
  slightly curved, `link` edges dashed.
- **Hit-testing:** Screen coordinates → world coordinates (including the inverse of the lens).

## 5. Interaction

**Visitor mode (everyone)**
- Pan / zoom / move the lens around.
- Clicking a node smoothly moves the camera there and opens a reading panel on the right
  (title, blocks, list of connected nodes, click them to jump).
- Hovering a node highlights its neighborhood; the rest fades.
- Press `/` to search and fly to the result.

**Edit mode (after signing in, switch in the top right)**
- **Click empty space** → a popover opens; type a title and press Enter to create a **main module**.
- **Drag from a node onto empty space** (from the `+` handle on the node's edge) → a **sub-module**
  is created and connected with a `child` edge.
- **Drag from a node onto another node** (from the handle) → creates a **link** (`link` edge).
- **Drag a node by its body** → moves it; the position is saved on release.
- **Click a node** → the right panel turns into an editor: title, color, add/delete/reorder blocks.
- **Click an edge** → delete / add a label.
- The `Delete` key removes the selected item (asks for confirmation). `Esc` clears the selection.

## 6. Folder structure

```
src/
  app/            page.tsx (canvas), login/page.tsx (token sign-in)
  engine/         camera.ts, lens.ts, background.ts, renderer.ts, hittest.ts
  components/     BrainCanvas.tsx, NodePanel.tsx, BlockEditor.tsx, CreatePopover.tsx, Toolbar.tsx, Search.tsx, SaveStatus.tsx
  lib/            types.ts, graph-ops.ts, validate.ts, backend.ts (Static + GitHub)
public/brain.json
.github/workflows/deploy.yml
```
