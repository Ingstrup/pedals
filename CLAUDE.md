# Pedalboard Planner — project context for Claude

## What this is
Vanilla JS + CSS + HTML pedalboard layout planner. No build step, no backend.
Bootstrap 5 and Bootstrap Icons loaded from CDN. All JS is browser-native ES modules.
FTP-deployable: upload `index.html`, `src/`, `data/` — nothing else needed on the server.

## Stack
- `index.html` — app shell, CDN Bootstrap 5 + Bootstrap Icons
- `src/` — 8 vanilla JS/CSS files (no npm at runtime)
- `data/` — `boards.json`, `pedals.json`, static images. **Do not restructure this folder.**
- `tests/` — Playwright tests (dev only)
- `node_modules/` — dev only (`serve` + `@playwright/test`)

## Running locally
```
npm start       # serves on http://localhost:3000
npm test        # 44 Playwright tests, should all pass
npm run test:ui # Playwright UI mode
```

## Active branch: develop (on top of master)
All fixes and features live here. See `CHANGELOG.md` for a full plain-English diff vs master.

## Architecture: key files
| File | Owns |
|------|------|
| `src/app.js` | Event wiring, hotkeys, zoom handler |
| `src/canvas.js` | Viewport, boards, pedals, fit-to-screen, rotate |
| `src/dragDrop.js` | Pedal drag + board reparenting |
| `src/sidebar.js` | Search lists, board info panel, shade selector |
| `src/storage.js` | localStorage save/load (synchronous writes) |
| `src/state.js` | Shared mutable state + storage key |
| `src/data.js` | Loads boards.json / pedals.json |
| `src/style.css` | Custom CSS on top of Bootstrap 5 dark theme |

## Design conventions
- **Accent colour:** `#4caf50` (Material green) — defined as `--pp-accent` in `src/style.css`. Do not change this back to cyan — previous cyan theme looked too similar to pedalplayground.com.
- **Snap:** `maybeSnap()` in `canvas.js` is the single gate for grid snapping. Do not add a second call site.
- **Persistence:** writes in `storage.js` are intentionally synchronous — do not re-introduce a debounce.
- **No comments** unless the WHY is genuinely non-obvious.

## Todo / backlog
See `.ignore/todo.md`. Pending items are above the divider; completed items are below it.
Completed items must always be moved below the divider (with a one-line note) — never just checked off in place.

## Key completed work (summarised)
- Bootstrap 5 dark UI with green accent
- Snap-to-grid single gate (`maybeSnap`)
- Synchronous localStorage + `beforeunload` flush
- Cross-browser wheel-zoom normalisation (`normalizedWheelTicks`)
- Board labels removed from canvas
- `R` hotkey rotates focused pedal 90°; `Delete`/`Backspace` removes it; `F` fits viewport
- Search: keyboard-vs-mouse conflict resolved with `body.kbd-nav` class
- 44 Playwright tests across 6 files
