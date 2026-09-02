# Mini Crosswords

A minimalist static site for hosting playable mini crosswords. No build step, no framework, just HTML + CSS + a bit of JS.

## Structure

```
.
├── index.html          # Landing page — lists all puzzles
├── puzzle.html         # Playable crossword — loads ?id=<slug>
├── style.css           # Shared styles (light + dark)
├── crossword.js        # Puzzle rendering, input, solve detection
├── puzzles/
│   ├── index.json      # Array of puzzle slugs, e.g. ["2026-08-16-heart"]
│   └── <slug>.json     # One file per puzzle
└── README.md
```

## Adding a new puzzle

1. Create `puzzles/<slug>.json` (e.g. `2026-08-20-flags.json`). Slug becomes the URL: `puzzle.html?id=<slug>`.
2. Add the slug to `puzzles/index.json`.
3. Commit + push.

### Puzzle JSON format

```json
{
  "title": "Mini #2",
  "author": "Ryan",
  "date": "2026-08-20",
  "grid": [
    "HEART",
    "EMBER",
    "AROSE",
    "RESIN",
    "TREND"
  ],
  "clues": {
    "across": { "1": "...", "6": "..." },
    "down":   { "1": "...", "2": "..." }
  }
}
```

- `grid` — rows of the puzzle. Letters (any case) are cells; `.` (or `#`) is a black square. Rows must all be the same length. Any size works — 4×4, 5×5, 7×7, etc.
- `clues.across` / `clues.down` — keyed by the number the site auto-assigns (top-to-bottom, left-to-right, standard crossword numbering). Any cell that starts a word gets a number.
- `date` — used to sort the index (newest first). ISO format recommended.
- `circles` (optional) — mask matching `grid` shape. `.` = no marker; anything else (e.g. `O`) draws a thin circle inside that cell. Use to visually link theme words. Example — associate RASH (row 0) with GUARD (row 2):

  ```json
  "circles": [
    ".RASH",
    ".....",
    "GUARD",
    ".....",
    "....."
  ]
  ```

  The exact character doesn't matter; only "is it `.` or not." Circles stay visible under the current-word highlight.

Numbers are computed at runtime, so you just make the grid and figure out which numbers to clue. Easiest way: load the puzzle in the browser — numbers appear in the corner of every start cell.

## Running locally

Open `index.html` via a local server (not `file://` — `fetch()` won't work from disk):

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploying to GitHub Pages

1. `cd` into this folder and `git init`, commit everything.
2. Create a repo on GitHub, push to it.
3. In the repo's Settings → Pages, set source to `main` branch, `/ (root)` folder.
4. Site is live at `https://<username>.github.io/<repo>/` within a minute or two.

For a custom domain, add a `CNAME` file with your domain, then point DNS at GitHub.

## Controls

- Click a cell / tap to select. Click same cell to toggle across/down.
- Type letters to fill; **Backspace** deletes; **Space** toggles direction.
- **Arrow keys** navigate.
- **Tab** / **Shift+Tab** cycle through words: all Across in order, then all Down, then wrap.
- **Check** highlights wrong letters in red. **Reveal cell** / **Reveal all** if stuck. **Clear** wipes it.
