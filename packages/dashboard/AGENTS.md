<coding_guidelines>
# Pi Dashboard

## Purpose

Electron-based iframe orchestrator for the Pi subagents web UI. Spawns the coding-agent backend, renders the subagents frontend inside iframes on a canvas, and tracks local canvas state (node positions and session metadata). It does not run agent sessions itself.

## Architecture

```
packages/dashboard/
├── src/
│   ├── index.ts                  # Public API exports (DashboardDaemon, DashboardConfig)
│   ├── contract.ts               # Type-only re-exports
│   ├── types.ts                  # DashboardConfig
│   ├── logging.ts                # DashboardLogger (in-memory, structured)
│   │
│   ├── server/
│   │   ├── daemon.ts             # Minimal HTTP server + static SPA files
│   │   └── static.ts             # SPA static file serving with fallback
│   │
│   └── procedures/
│       ├── index.ts              # createDashboardRouter factory
│       └── dashboard.ts          # Minimal procedures (state, logs)
│
├── frontend/                     # React 19 + Tailwind v4 SPA (see frontend/AGENTS.md)
│   ├── src/
│   │   ├── App.tsx               # Root shell: backend URL loading + canvas layout
│   │   ├── electron.ts           # Electron preload API helpers + resolveBackendUrl
│   │   ├── canvas/               # React Flow canvas + session nodes + iframes
│   │   └── sessions/             # Sidebar + inspector panels
│
├── electron/                     # Electron desktop app
│   ├── main.ts                   # Spawns coding-agent backend, IPC URL channel
│   ├── preload.ts                # contextBridge — exposes getBackendUrl()
│   ├── tsconfig.json             # TypeScript config for electron build
│   └── vite.config.ts            # Vite build config for main + preload
│
├── package.json
├── build.ts                      # Bun build script for the backend library
└── tsconfig.build.json
```

## Key Concepts

### DashboardDaemon

Minimal HTTP server that serves:

- `/api` — oRPC endpoints (`state.get`, `logs.get`)
- `/` — static React SPA from `frontend/dist`

Session management has moved to `packages/subagents`.

### Electron Backend Manager

`electron/main.ts` spawns the Pi coding-agent in `--web` mode with the local extensions directory. It parses `[lion] dashboard at <url>` from stdout, stores the URL, and exposes it to the renderer via IPC.

### Canvas Session Model

Sessions displayed on the canvas are lightweight metadata objects (`CanvasSession`):

- `id` — stable canvas session ID
- `name` — display name
- `createdAt` — creation timestamp
- `threadId` — optional subagents thread ID (defaults to the canvas session ID)

Sessions and node positions are persisted to `localStorage` in the frontend.

### Iframe Rendering

Each canvas node renders an iframe pointing to:

```
<backendUrl>/thread/<threadId>
```

The subagents frontend handles its own routing, state, and event streaming inside the iframe.

## Dependencies

| Package | Purpose |
|---------|---------|
| `@orpc/server` | oRPC server framework (minimal remaining API) |
| `zod` | Schema validation |
| `react` / `react-dom` | Frontend UI |
| `tailwindcss` | Frontend styling |
| `@xyflow/react` | Canvas graph library |
| `lucide-react` | Icons |

## Commands

```bash
# Backend
bun run build              # Build backend library to dist/
bun run watch              # Build in watch mode
bun run build:frontend     # Build frontend SPA
bun run build:all          # Build backend + frontend

# Desktop app (Electron)
bun run build:electron     # Build Electron main + preload scripts
bun run electron:dev       # Build frontend + electron, then run
bun run electron:build     # Full build for packaging
bun run electron:pack      # Package into .dmg / .exe / AppImage
```

## Electron App

The dashboard is packaged as a desktop application using Electron. The main process spawns the coding-agent backend as a child process and loads the React SPA.

### Architecture

```
Electron Main (Node.js)
├── Spawns: pi --web -e extensions (port assigned by coding-agent)
├── Parses backend URL from stdout ([lion] dashboard at http://...)
├── Exposes URL via contextBridge IPC
└── Creates BrowserWindow with preload script

Renderer (Chromium)
├── Loads: file://frontend/dist/index.html
├── Calls window.__PI_ELECTRON__.getBackendUrl()
└── Renders subagents UI in iframes on the canvas
```

### Key Implementation Details

- **Single backend**: One coding-agent process serves all canvas iframes.
- **URL via IPC**: The renderer requests the backend URL through the preload script, not a query param.
- **URL fallback**: For non-Electron development, `?backendUrl=` can be provided in the URL.
- **Process cleanup**: `before-quit` kills the backend with SIGTERM → SIGKILL after 3s.
- **Single instance**: `app.requestSingleInstanceLock()` prevents multiple instances.
- **Security**: `contextIsolation: true`, `nodeIntegration: false`, minimal preload API.

### Files

| File | Purpose |
|------|---------|
| `electron/main.ts` | Spawns backend, manages IPC, creates window, handles lifecycle |
| `electron/preload.ts` | Exposes `getBackendUrl`, `platform`, `versions` via contextBridge |
| `electron/vite.config.ts` | Builds main + preload as CJS |
| `build.ts` | Builds the backend library |

## Conventions

- Use `logger.info/warn/error/debug` for structured logging (not console.log).
- Frontend uses React Flow for the canvas and iframes for the subagents UI.
- Canvas sessions and positions are persisted to `localStorage`.
- The dashboard does not call subagents APIs directly; all session state lives inside the iframes.

## Testing

Tests were removed along with the legacy session runtime. Add new tests for:

- Electron backend spawner lifecycle.
- Canvas session persistence helpers.
- Node layout/positioning logic.

Run from package root:

```bash
bun x tsx ../../node_modules/vitest/dist/cli.js --run
```

## Changelog

Location: `packages/dashboard/CHANGELOG.md`

Format follows repo standard: `### Added`, `### Changed`, `### Fixed`, `### Removed` under `## [Unreleased]`.
</coding_guidelines>
