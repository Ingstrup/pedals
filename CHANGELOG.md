# Changelog

Plain-English notes on what changed in the develop branch on top of
commit `11ff9c0`. Read top-to-bottom — most important first.

---

## TL;DR

1. The app now uses Bootstrap 5 for a cleaner dark UI, but it's still
   pure vanilla JS/CSS/HTML — no build step.
2. The root folder is tidy: all JS/CSS lives in `src/`, the setup
   script in `scripts/`, the tests in `tests/`. `data/` is untouched.
3. Every item on the `todo.md` "high-priority fixes" list is done.
4. You can run it with `npm start` → http://localhost:3000.
5. There are 44 Playwright tests in 6 files. `npm test` runs them.

---

## What you'll see and feel in the browser

### Cleaner, more "designed" UI
- Sidebar uses Bootstrap cards, step badges ("1" / "2"), and proper
  form controls.
- Toolbar buttons now have icons (Bootstrap Icons): Fit, Export,
  Import, Clear.
- The footer hint bar shows `<kbd>`-style key hints so users can
  discover hotkeys without reading the README.
- A subtle "saved" indicator flashes whenever the app autosaves —
  useful when you're wondering "did that actually persist?"
- Boards no longer have a redundant text label hanging underneath
  them on the canvas (that was on the todo list).

### Darkest mode by default
The canvas now boots up at the darkest shade (`#18191b`) instead of
the previous "Light Silver". The shade selector still works and the
choice still persists.

### Better keyboard story
| Key                    | What it does                          |
|------------------------|---------------------------------------|
| `R`                    | Rotate the selected pedal 90 degrees  |
| `Delete` / `Backspace` | Remove the selected pedal             |
| `F`                    | Fit everything to the viewport        |
| `Enter` in custom-W    | Jump focus to custom-H                |
| `Enter` in custom-H    | Click Create                          |
| `↑` / `↓` in search    | Move highlight; mouse hover no longer steals it |
| `Esc` in search        | Close the list                        |

### Double-click a board to delete it
Previously you could double-click a *pedal* to delete it but had to
hunt for the sidebar X for boards. Now double-clicking the empty
area of a board removes it (mirrors the pedal behaviour).

---

## Bugs from `todo.md` and `checklist.md` — fixed

### "Snap-to-grid was overriding the checkbox"
**Before:** in some code paths, pedals snapped even when the Snap
checkbox was unchecked, and conversely on JSON import, exact saved
coordinates were re-snapped and lost.
**Now:** a single helper (`maybeSnap` in [src/canvas.js](src/canvas.js))
is the only gate. Spawn / drag / drop all funnel through it.
Imports preserve coordinates exactly — re-importing a layout no
longer drifts.

### "Local storage doesn't auto-load on a fresh page load"
**Before:** the boot sequence was `await loadData(); fitToScreen();
loadFromLocalStorage();`. `fitToScreen` would compute a default
zoom/pan against an empty state, then localStorage would restore
the real layout but the camera had already been recomputed once.
Worse, save writes were debounced 50 ms, so a quick reload could
race the save.
**Now:**
- Boot order is fixed: `loadFromLocalStorage()` runs first; we only
  call `fitToScreen()` when there's nothing to restore.
- Writes are synchronous (localStorage is fast — debouncing was
  premature optimization) and we also flush on `beforeunload` as
  belt-and-suspenders.

### "Zoom feels broken in Chrome/Brave but fine in Firefox"
**Before:** the wheel handler used `e.deltaY > 0 ? 0.98 : 1.02` —
which throws away the actual delta magnitude. Different browsers
report different deltas (Chrome: ~100/notch, Firefox can use
`deltaMode=1` and report lines instead of pixels). So the same
flick of the wheel produced very different zoom amounts.
**Now:** [`normalizedWheelTicks`](src/canvas.js) reads `deltaMode`,
converts everything to a common "tick" unit (1 tick ≈ one mouse
notch), clamps to ±200 to absorb trackpad-pinch bursts, and zoom
scales as `0.92 ^ ticks`. Feel is identical in Chrome, Brave,
Safari and Firefox.

### "Board labels render under boards"
**Before:** every placed board had a `<div class="board-label">`
glued 25px below it.
**Now:** removed entirely. The sidebar's "On Canvas" list and the
board info panel already convey the name.

### "Custom-board Enter UX"
**Before:** pressing Enter inside either custom-W or custom-H did
nothing.
**Now:** Enter in W focuses H. Enter in H triggers Create. (Tests
cover this.)

### "Search list keyboard vs mouse conflict"
**Before:** if the mouse cursor happened to be over the search
list while you were using `↑` / `↓`, mouse-hover events fought
the keyboard for highlight ownership and the selection jittered.
**Now:** the moment you press an arrow key, `document.body` gets a
`kbd-nav` class. While that class is on, the CSS `:hover` rule is
disabled and the JS `mouseenter` handler bails out. Any actual
mouse movement removes the class and hover is back in charge.

### Consolidated the board info panel
The selected-board info panel now sits inside the sidebar flow as
a proper Bootstrap card (name + brand + cm dims, with a small
"clear pedals" eraser button) rather than the loose inline-styled
div it was before.

### Pedal smart-spawn offset
**Before:** consecutive spawns were nudged 8 px diagonally per
add. With 73 px wide pedals that was nearly invisible. New pedals
looked like they hadn't appeared.
**Now:** 30 px per step, cycling every 6 spawns.

### Click vs drag threshold
**Before:** the slightest mouse movement between mousedown and
mouseup counted as a "drag" and would commit a new position. A
trembling hand on a single-click could nudge a pedal by 1 px.
**Now:** a 3 px deadzone — anything below that is treated as a
click and the position isn't touched.

---

## New developer-facing things

### `npm start`
Runs `serve -p 3000 -L .` on port 3000. Open
http://localhost:3000.
(`serve` was already in `devDependencies`; we just gave it a
script name.)

### Folder layout
```
.
├── index.html
├── package.json
├── playwright.config.js
├── README.md
├── CHANGELOG.md
├── src/
│   ├── app.js            top-level event wiring + hotkeys
│   ├── canvas.js         viewport, boards, pedals, fit, rotate
│   ├── dragDrop.js       pedal drag + reparenting
│   ├── sidebar.js        custom lists, info panel, shade selector
│   ├── data.js           boards.json / pedals.json loader
│   ├── state.js          shared mutable state + storage keys
│   ├── storage.js        localStorage save/load
│   └── style.css         custom CSS on top of Bootstrap
├── scripts/
│   └── setup_testing.sh
├── tests/
│   ├── helpers.js
│   ├── 01-boot.spec.js
│   ├── 02-canvas.spec.js
│   ├── 03-boards.spec.js
│   ├── 04-pedals.spec.js
│   ├── 05-search.spec.js
│   └── 06-persistence.spec.js
└── data/                 untouched
```

### Tests
44 Playwright cases organised into themes:

| File | Covers |
|------|--------|
| `01-boot.spec.js` | Page renders, Bootstrap loaded, dark default, data loaded, no board labels |
| `02-canvas.spec.js` | Zoom clamp + readout, click-empty-canvas deselects, fit-to-screen, F hotkey, shade persistence |
| `03-boards.spec.js` | Custom-board scaling, Enter UX, info panel, multi-board DOM, sidebar X, focused class |
| `04-pedals.spec.js` | Type+Enter add, double-click delete, snap on/off, R rotate, Delete hotkey, z-index raise, sidebar X, count badge, multi-board reparenting, boardless drop |
| `05-search.spec.js` | Fuzzy/unordered/case-insensitive match, kbd nav, kbd-vs-hover, Escape, 50-item chunking, hover preview debounce, board cm preview, search state memory |
| `06-persistence.spec.js` | Layout / camera / rotation survive reload, Clear-Canvas confirm dialog, JSON export schema, full round-trip import |

Run them:
```
npm test           # headless
npm run test:ui    # Playwright UI mode
npm run test:headed
```

I ran the full suite 4 times back-to-back; passed cleanly each time
in ~5 s.

---

## How to QA each change (the "convince me" checklist)

1. **First page load** — open http://localhost:3000. Canvas should
   be the darkest shade, sidebar should look like the new Bootstrap
   layout, and the footer should show key hints.
2. **Search hover-vs-keyboard** — focus the pedal search, type
   `boss`, press `↓` a few times, then hover a row further down with
   the mouse. The highlight should *not* jump to the hovered row.
3. **Custom board Enter UX** — type `60` in the W field, press
   Enter — cursor jumps to H. Type `30`, Enter — board appears.
4. **Snap toggle** — add a pedal, drag it. With Snap ON, position is
   a multiple of 10. Uncheck Snap, drag again — position is no
   longer aligned.
5. **Rotate / delete hotkeys** — click a pedal, press R (rotates
   90 degrees), press R again (180), press Delete (gone).
6. **Reload persistence** — drop a board, a pedal, zoom in heavily,
   pan around. Reload. Everything is exactly where you left it
   (this was the main "broken local storage" complaint).
7. **Zoom feel across browsers** — open in Chrome and Firefox side
   by side. The same wheel motion should now scale the canvas by
   the same amount.
8. **Background shade** — pick a different swatch. Reload. Same
   shade.
9. **Export → Clear → Import round trip** — click Export, Clear
   (accept the confirm), Import the file. Layout fully restored.
10. **Tests** — `npm test`. All 44 should pass.

---

## What I deliberately did NOT touch

- The `data/` folder. (You asked.)
- The two big future-roadmap items in `todo.md`: SVG cable routing
  and multi-board relative locking. These are real features, not
  bug-fixes, and they each deserve their own session.
- `node_modules/`, `test-results/`, `.ignore/` — gitignored.

---

## File pointers if you want to read the diff

- New UI markup: [index.html](index.html)
- New styling: [src/style.css](src/style.css)
- Boot sequence + hotkeys + zoom math: [src/app.js](src/app.js)
- Snap/spawn/rotate/fit: [src/canvas.js](src/canvas.js)
- Drag and reparenting: [src/dragDrop.js](src/dragDrop.js)
- Search lists + info panel + shade selector: [src/sidebar.js](src/sidebar.js)
- Synchronous persistence: [src/storage.js](src/storage.js)
- Tests: [tests/](tests/)
