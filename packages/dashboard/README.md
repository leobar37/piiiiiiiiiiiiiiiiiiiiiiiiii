# @local/pi-dashboard

Electron-based iframe orchestrator for the [Pi](https://github.com/earendil-works/pi-mono) subagents web UI.

## What it does

This package no longer runs agent sessions itself. It is a thin visual shell that:

1. Spawns the Pi coding-agent in `--web` mode.
2. Discovers the subagents backend URL from the agent's stdout.
3. Loads a React canvas that renders the subagents frontend inside iframes.
4. Tracks canvas nodes locally (positions and session metadata).

All session execution, persistence, chat, and event streaming live in `packages/subagents`.

## Installation

```bash
bun add @local/pi-dashboard
```

## Usage

### Desktop app (Electron)

```bash
# Build frontend + backend + electron, then run
bun run electron:dev

# Full production build
bun run electron:build

# Package into .dmg (mac), .exe (win), or AppImage (linux)
bun run electron:pack
```

### Static file server (non-Electron)

```ts
import { DashboardDaemon } from "@local/pi-dashboard";

const daemon = new DashboardDaemon({ port: 9393 });
const url = await daemon.start();
console.log(`Dashboard at ${url.href}`);

// The static SPA expects ?backendUrl= pointing at a subagents backend.
await daemon.stop();
```

The server exposes:

- `/api` — minimal oRPC endpoints (`state.get`, `logs.get`)
- `/` — static React SPA frontend

## Desktop architecture

```
Electron Main Process (Node.js)
├── Spawns: pi (coding-agent binary) --web -e extensions
├── Parses subagents URL from stdout: [lion] dashboard at http://...
├── Exposes URL to renderer via contextBridge IPC
└── Creates BrowserWindow with preload script

Renderer Process (Chromium)
├── React SPA loads from file://frontend/dist/index.html
├── Calls window.__PI_ELECTRON__.getBackendUrl() for the backend URL
└── Renders the subagents UI inside iframes on a React Flow canvas
```

## Frontend

The frontend (`frontend/`) is a React 19 + Tailwind v4 SPA with:

- A free-form React Flow canvas for session nodes.
- Each node contains an iframe loading the subagents frontend.
- Local persistence for canvas sessions and node positions.

See `frontend/AGENTS.md` for frontend-specific conventions.

## Development

```bash
# Build backend library
bun run build

# Build frontend
bun run build:frontend

# Build everything
bun run build:all

# Build Electron main + preload
bun run build:electron

# Watch mode
bun run watch
```

## License

MIT
