# Pedalboard Planner

A zero-build, vanilla-JS (ES modules) + Bootstrap 5 web app for sketching out
guitar pedalboards. Pan/zoom an infinite canvas, drop boards and pedals onto
it, snap-to-grid, persist to localStorage, import/export JSON.

## Run it

```bash
npm install        # one-time
npm start          # serves on http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000) in any modern browser.

## Project layout

```
.
├── index.html                # entry point
├── src/                      # all JS modules + CSS
│   ├── app.js                # bootstrap & top-level event wiring
│   ├── canvas.js             # board/pedal rendering, viewport, hotkeys
│   ├── dragDrop.js           # pedal drag + reparenting
│   ├── sidebar.js            # search lists, info panel, on-canvas tree
│   ├── data.js               # boards.json / pedals.json loader & normalizer
│   ├── state.js              # in-memory app state
│   ├── storage.js            # localStorage persistence (debounced)
│   └── style.css             # custom layer on top of Bootstrap
├── data/                     # boards.json, pedals.json, images/ (untouched)
├── scripts/setup_testing.sh  # one-shot bootstrap for Playwright
├── tests/                    # Playwright suite
├── playwright.config.js
└── package.json
```

## Hotkeys

| Key            | Action                                |
|----------------|---------------------------------------|
| `R`            | Rotate the selected pedal 90°         |
| `Delete` / `⌫` | Remove the selected pedal             |
| `F`            | Fit the entire layout to the viewport |
| `Enter` in search list | Add highlighted pedal/board   |
| `↑` / `↓`      | Navigate search list                  |
| `Esc`          | Close search list                     |
| Double-click pedal / board | Delete it                 |
| `Enter` in custom-W input | Jumps to custom-H          |
| `Enter` in custom-H input | Creates the board          |

## Tests

```bash
npm test           # headless Playwright run
npm run test:ui    # Playwright UI mode
npm run test:headed
```

The suite covers viewport (pan/zoom/fit), board management, pedal drag &
reparenting, fuzzy search & keyboard navigation, hover preview, hotkeys,
persistence, and JSON export/import.

## Data folder

`data/` is intentionally untouched and gitignored. `boards.json` and
`pedals.json` follow the original schema and ship the original imagery.
