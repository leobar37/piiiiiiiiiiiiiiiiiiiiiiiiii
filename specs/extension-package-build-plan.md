# Plan: Extension Package Build System

## Objetivo

Permitir que los usuarios de Pi creen **paquetes de extensiones** autocontenidos: múltiples extensiones con dependencias propias (`zod`, `lodash`, etc.) en un solo directorio, compiladas a `.js` bundleados que el agente puede cargar directamente.

**Restricción**: Sin modificar el runtime del agente. El loader existente ya soporta esto.

---

## Estado actual (ya funciona)

El loader de extensiones de Pi (`packages/coding-agent/src/core/extensions/loader.ts`) ya soporta:

- **`pi.extensions` como array de paths** en `package.json`
- **Descubrimiento de archivos `.js`/`.ts` en directorios**
- **Carga de múltiples extensiones desde un solo `-e` path**

Ejemplo en el repo: `packages/extensions/` carga `auth.js`, `deploy.js`, etc. desde `./dist/extensions`.

---

## Problema

Hoy no hay un **script de build oficial** para crear estos paquetes. El usuario debe:
1. Escribir extensiones en TypeScript con dependencias npm
2. Bundlelas a `.js` manualmente (con `esbuild` o `bun build`)
3. Configurar correctamente los `external` (qué no bundlea)

Esto es repetitivo y propenso a errores.

---

## Solución

Un script de build oficial que:

1. Descubra automáticamente todos los entry points `.ts` en un directorio
2. Bundle cada uno a `.js` con sus dependencias incluidas
3. Deje como `external` los paquetes que el agente provee
4. Genere un `package.json` con `pi.extensions` apuntando al output

---

## Arquitectura del paquete de extensiones

```
mi-pi-toolkit/
├── package.json              # Dependencias + pi.extensions
├── build.ts                  # Script de build (provisto por nosotros)
├── src/                      # CÓDIGO FUENTE
│   ├── auth.ts               # Extensión "auth"
│   ├── deploy.ts             # Extensión "deploy"
│   ├── db-migrate.ts         # Extensión "db-migrate"
│   └── shared/               # Código compartido
│       └── logger.ts
├── dist/                     # OUTPUT BUNDLEADO (generado)
│   ├── auth.js
│   ├── deploy.js
│   └── db-migrate.js
└── node_modules/
    └── zod/                  # Dependencias instaladas aquí
```

### `package.json`

```json
{
  "name": "mi-pi-toolkit",
  "type": "module",
  "pi": {
    "extensions": ["./dist"]
  },
  "scripts": {
    "build": "bun run build.ts",
    "watch": "bun run build.ts --watch"
  },
  "dependencies": {
    "zod": "^3.22.0",
    "ms": "^2.1.3"
  }
}
```

### Cada archivo `.ts` en `src/`

Exporta `default` como `ExtensionFactory`:

```typescript
import { z } from "zod";
import { log } from "./shared/logger";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function authExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "verify_token",
    parameters: z.object({ token: z.string() }),
    execute: async (id, params) => {
      log("Verificando...");
      return { content: [{ type: "text", text: "valid" }] };
    },
  });
}
```

---

## El script de build (`build.ts`)

```typescript
#!/usr/bin/env bun
/**
 * Build all extensions in src/ to dist/ with bundled dependencies.
 *
 * Usage:
 *   bun run build.ts              # build once
 *   bun run build.ts --watch      # watch mode
 */

import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

const SRC_DIR = join(import.meta.dir, "src");
const OUT_DIR = join(import.meta.dir, "dist");

const EXTERNAL = [
  // Pi packages — provided by the agent runtime
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-ai/oauth",
  "@earendil-works/pi-tui",
  "@earendil-works/pi-coding-agent",
  "@mariozechner/pi-agent-core",
  "@mariozechner/pi-ai",
  "@mariozechner/pi-ai/oauth",
  "@mariozechner/pi-tui",
  "@mariozechner/pi-coding-agent",
  // TypeBox — provided by the agent
  "typebox",
  "typebox/compile",
  "typebox/value",
  "@sinclair/typebox",
  "@sinclair/typebox/compile",
  "@sinclair/typebox/value",
];

function discoverEntrypoints(dir: string): string[] {
  const entries: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isFile() && name.endsWith(".ts")) {
      entries.push(full);
    }
  }
  return entries;
}

async function build() {
  const entrypoints = discoverEntrypoints(SRC_DIR);
  if (entrypoints.length === 0) {
    console.log("No extension entrypoints found in src/");
    return;
  }

  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }

  let built = 0;
  for (const entrypoint of entrypoints) {
    const result = await Bun.build({
      entrypoints: [entrypoint],
      outdir: OUT_DIR,
      target: "bun",
      format: "esm",
      sourcemap: "inline",
      external: EXTERNAL,
    });

    if (!result.success) {
      for (const log of result.logs) {
        console.error(`[${basename(entrypoint, ".ts")}]`, log);
      }
      process.exit(1);
    }
    built++;
  }

  console.log(`Built ${built} extensions to ${OUT_DIR}`);
}

// Watch mode
if (process.argv.includes("--watch")) {
  console.log("Watching for changes...");
  build();
  const watcher = readdirSync(SRC_DIR);
  // Simplified: re-run on interval or use fs.watch
} else {
  await build();
}
```

---

## Qué se bundlea y qué no

| Código | ¿Dónde termina? |
|--------|-----------------|
| `src/auth.ts` | → `dist/auth.js` |
| `src/shared/logger.ts` | → **Incluido** en `auth.js` y `deploy.js` (duplicado) |
| `zod` (de `node_modules`) | → **Incluido** en `auth.js` y `deploy.js` (duplicado) |
| `@earendil-works/pi-coding-agent` | → **NO**, `import` resuelto por el agente |
| `typebox` | → **NO**, `import` resuelto por el agente |

---

## Cómo se usa el paquete

### 1. Desarrollo

```bash
cd mi-pi-toolkit
bun install        # instalar dependencias
bun run build      # generar dist/*.js
```

### 2. Ejecutar con el agente

```bash
pi -e /abs/path/to/mi-pi-toolkit "prompt aquí"
```

O desde cualquier lugar si está en `PI_PACKAGE_DIR` o el path es absoluto.

### 3. El loader del agente resuelve:

```
-e /abs/path/to/mi-pi-toolkit
  → lee package.json
  → encuentra pi.extensions = ["./dist"]
  → resuelve /abs/path/to/mi-pi-toolkit/dist
  → es directorio → descubre auth.js, deploy.js, db-migrate.js
  → carga cada uno como extensión independiente
```

---

## Ventajas

- **Sin tocar el runtime de Pi**: el loader ya soporta directorios y arrays de paths
- **Autocontenido**: cada paquete tiene sus propias dependencias
- **Múltiples extensiones**: un paquete exporta N extensiones separadas
- **TypeScript nativo**: escribís `.ts`, el build se encarga del resto
- **Código compartido**: `./shared/` funciona dentro del paquete (se duplica en cada bundle)

---

## Limitaciones aceptadas

- **Build requerido**: `bun run build` antes de usar. No hay hot-swap sin re-build.
- **Duplicación de shared code**: si `shared/logger.ts` es grande, se repite en cada `.js`. Solución: externalizarlo o aceptar la duplicación.
- **Bun runtime**: el build usa `Bun.build`. Para Node puro, reemplazar por `esbuild`.

---

## Entregables

1. **Script de build**: `build.ts` listo para copiar y usar
2. **Template de paquete**: estructura de carpetas + `package.json` ejemplo
3. **Ejemplo funcional**: `packages/coding-agent/examples/extensions/multi-toolkit/` con 3 extensiones y `zod`
4. **Documentación**: este plan como referencia

---

## No incluido (fuera de scope)

- Hot-reload automático del agente al cambiar el paquete
- Publicación a npm
- Registry de paquetes de extensiones
- Sistema de versionado entre extensiones
