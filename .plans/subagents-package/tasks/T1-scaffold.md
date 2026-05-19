# T1: Package Scaffold

## Goal
Create package skeleton: `package.json`, `build.ts`, `tsconfig.build.json`, `.gitignore`.

## Files

### `packages/subagents/package.json`
```json
{
  "name": "@local/pi-subagents",
  "version": "0.0.1",
  "description": "Sub-agent controller with lifecycle, events, and RPC adapter",
  "type": "module",
  "private": true,
  "keywords": ["pi-package"],
  "scripts": {
    "build": "bun run build.ts",
    "watch": "bun run build.ts --watch"
  },
  "pi": {
    "extensions": ["./dist"]
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-agent-core": "*",
    "@earendil-works/pi-ai": "*",
    "@earendil-works/pi-tui": "*"
  }
}
```

### `packages/subagents/build.ts`
Replicate from `packages/extensions/build.ts`:
- Discover `src/extensions/<name>/index.ts`
- Bundle each to `dist/<name>.js` via Bun.build
- ESM, `target: "bun"`, `--watch` support

### `packages/subagents/tsconfig.build.json`
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "declaration": true
  },
  "include": ["src/**/*.ts"]
}
```

### `packages/subagents/.gitignore`
```
dist/
node_modules/
```

## Validation
- `bun run build` succeeds (may fail until T11 creates extension source)
- `package.json` valid JSON
- Directory matches `packages/extensions/` conventions
