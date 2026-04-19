# BugMe

A Chrome extension for capturing and reporting bugs directly to Azure DevOps. Reproduce a bug naturally — BugMe records every click, input, navigation, screenshot, and console/network event in the background, then creates a fully documented **Bug** work item in ADO with one click.

---

## Features

| Feature | Detail |
|---|---|
| **Step capture** | Records clicks, form inputs, page navigation, and scrolls as human-readable steps automatically |
| **Screenshots** | Take point-in-time screenshots at any moment; all are attached to the ADO work item |
| **Console capture** | Captures all browser console output (log, info, warn, error, debug) via the Chrome Debugger API |
| **Network capture** | Records every network request, status code, and duration; failed requests are highlighted |
| **ADO integration** | Creates a Bug work item with repro steps, environment info, screenshots, and a full diagnostic comment |
| **Editable bug title** | Set a title before starting or change it at submission time |
| **Bug history** | View, re-submit, or delete past captures from the History tab |
| **Keyboard shortcut** | `Alt+Shift+R` toggles capture on/off without opening the popup |
| **Pause / Resume** | Pause capture mid-session without stopping the recording |

---

## Prerequisites

- Google Chrome (Manifest V3)
- Node.js 18+
- An Azure DevOps organisation with a Personal Access Token (PAT)

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Build

```bash
npm run build
```

Output is written to `dist/`.

### 3. Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `dist/` folder
4. The BugMe icon appears in the Chrome toolbar

### 4. Configure Azure DevOps

1. Click the BugMe icon → open **Settings** (⚙)
2. Enter your **Organisation URL** — e.g. `https://dev.azure.com/yourorg`
3. Enter a **Personal Access Token** with *Work Items (Read & Write)* scope
4. Click **Verify Connection**, then **Save**

> The PAT is stored only in `chrome.storage.local` on your machine and never transmitted anywhere except the ADO API.

---

## Usage

### Capturing a bug

1. Click the BugMe icon → optionally type a bug title → click **● Start Capturing Bug**
   *(or press `Alt+Shift+R` from any tab)*
2. Reproduce the bug — every click, input, and navigation is recorded automatically
3. Click **📸 Take Screenshot** at any point to attach a screenshot
4. Click **⏸ Pause** if you need to enter sensitive data without recording it
5. Click **⏹ Stop & Review** when done

### Submitting to Azure DevOps

1. The Submit screen opens automatically after stopping
2. Edit the bug title if needed
3. Select **Project**, **Area Path**, and optionally **Iteration Path**
4. Review what will be attached (action count, screenshots, console/network counts)
5. Click **Create Bug in ADO**
6. Copy the resulting work item URL with the **📋** button

---

## ADO Work Item Output

**Repro Steps field**
- Numbered list of recorded steps (e.g. *Clicked 'Save'*, *Typed in 'Email' field*, *Navigated to Dashboard*)
- Environment section with Chrome version

**Diagnostic comment** (posted after creation)
- Full console log table — level, message, source file, timestamp
- Full network request table — method, URL, status, duration; failures highlighted in red
- List of attached files

**Attachments**
- One timestamped PNG per screenshot

---

## Project Structure

```
BugMe/
├── src/
│   ├── background/
│   │   ├── service-worker.ts      # MV3 service worker — message router and orchestrator
│   │   └── debugger-client.ts     # Chrome Debugger Protocol — console & network capture
│   ├── content/
│   │   └── recorder.ts            # Content script (IIFE) — captures clicks, inputs, scroll, navigation
│   ├── popup/
│   │   ├── App.tsx                # Popup shell, view routing, recording state management
│   │   └── components/
│   │       ├── ActionFeed.tsx     # Live scrolling list of captured steps
│   │       ├── Settings.tsx       # ADO organisation URL + PAT configuration
│   │       └── SubmitView.tsx     # Bug submission form with ADO project / area / iteration pickers
│   └── shared/
│       ├── types.ts               # TypeScript interfaces (BugReport, RecordingState, Message, …)
│       ├── browser.ts             # webextension-polyfill re-export
│       ├── storage.ts             # chrome.storage helpers (bug reports, ADO config, recording state)
│       ├── screenshot-db.ts       # IndexedDB wrapper for screenshot blobs
│       └── ado-client.ts          # ADO REST API — projects, area/iteration paths, work item creation, attachments
├── scripts/
│   └── generate-icons.mjs        # Converts public/favicon.svg → public/icons/*.png using sharp
├── public/
│   └── icons/                    # icon16.png  icon48.png  icon128.png
├── popup.html                     # Popup entry point (React)
├── manifest.json                  # Chrome Manifest V3
├── vite.config.ts                 # Main build — popup + service worker (ESM output)
└── vite.config.content.ts         # Content script build — IIFE output (required for Chrome content scripts)
```

---

## Architecture

### Extension contexts

```
┌──────────────────────────────────────────────┐
│  Popup  (React / Vite ESM)                   │
│  App.tsx → ActionFeed, SubmitView, Settings  │
│  Sends messages via browser.runtime          │
└──────────────────┬───────────────────────────┘
                   │ runtime messages
┌──────────────────▼───────────────────────────┐
│  Service Worker  (service-worker.ts)         │
│  Routes all messages, owns business logic    │
│  Persists state to chrome.storage            │
└─────────┬────────────────────────┬───────────┘
          │ Chrome Debugger API    │ tabs.sendMessage / scripting.executeScript
┌─────────▼──────────┐  ┌─────────▼─────────────────────┐
│ debugger-client.ts │  │ Content Script (recorder.ts)  │
│ Console + network  │  │ Captures clicks, inputs,       │
│ capture via CDP    │  │ scroll, SPA navigation         │
└────────────────────┘  └────────────────────────────────┘
```

### Message flow during a session

1. User clicks **Start Capturing Bug** in the popup
2. Service worker creates a `BugReport`, attaches the Chrome Debugger to the active tab, writes `RecordingState` to `chrome.storage.session`, and broadcasts state to all tabs
3. Content script reads state from `storage.onChanged` (primary) or `GET_STATE` message (fallback with retry) and starts listening for DOM events
4. Each user action → content script sends `ADD_ACTION` → service worker appends to the report and re-broadcasts updated counts
5. User clicks **Stop & Review** → service worker detaches the debugger (flushing all console/network entries), collects browser info from the content script, saves the final report
6. User clicks **Create Bug in ADO** → service worker calls `exportAsBug()`:
   - `POST /wit/workitems/$Bug` — creates the work item with repro steps
   - `POST /wit/attachments` × N — uploads screenshots as binary streams
   - `PATCH /wit/workItems/{id}` — attaches all files to the work item in one call
   - `POST /wit/workItems/{id}/comments` — posts the full diagnostic table comment

### State persistence

| Data | Storage |
|---|---|
| Bug reports (actions, screenshot IDs, metadata) | `chrome.storage.local` |
| ADO config (org URL + PAT) | `chrome.storage.local` |
| Active recording state (flags, live counts) | `chrome.storage.session` |
| Screenshot blobs | IndexedDB — `BugMeDB` / `screenshots` store |

### Content script build

Chrome content scripts declared in `manifest.json` are loaded as **regular scripts**, not ES modules — `import` statements cause a silent `SyntaxError`. The content script is therefore built separately as an **IIFE** by `vite.config.content.ts` with `inlineDynamicImports: true`, bundling the webextension-polyfill inline. The main Vite build (popup + service worker) uses standard ESM.

---

## Build Scripts

| Command | Description |
|---|---|
| `npm run build` | Type-check + full production build → `dist/` |
| `npm run dev` | Vite dev server for popup UI iteration |
| `npm run lint` | ESLint across all TypeScript/TSX files |
| `npm run generate-icons` | Regenerate `public/icons/` PNGs from `public/favicon.svg` |

> After any `npm run build`, go to `chrome://extensions` and click the reload icon on the BugMe card to pick up the latest changes.

---

## Permissions

| Permission | Reason |
|---|---|
| `storage` | Persist bug reports, ADO config, and recording state |
| `activeTab` | Read the current tab URL and take screenshots |
| `scripting` | Inject the content script into tabs when needed |
| `tabs` | Query all tabs to broadcast live state updates to the popup |
| `debugger` | Attach Chrome Debugger Protocol to capture console and network events |
| `host_permissions: <all_urls>` | Allow capture on any website |
