# T-005: Validación y Testing

## Objetivo
Verificar que la implementación funciona correctamente y no rompe el flujo existente de Lion.

## Pasos de Validación

### 1. Compilación

```bash
cd packages/extensions
bun run check
```

Verificar que no hay errores de TypeScript en:
- `src/extensions/lion/types.ts`
- `src/extensions/lion/events/defs.ts`
- `src/extensions/lion/subagents/parallel.ts`
- `src/extensions/lion/tools.ts`
- `src/extensions/lion/prompts/planning.ts`

### 2. Flujo Existente No Roto

Verificar que las tools existentes siguen funcionando:
- `lion_activate_plan`
- `lion_validate_plan`
- `lion_start_next_task`
- `lion_start_review`
- `lion_finish_current_task`
- `lion_get_run`
- `lion_prompt_subagent`
- `lion_release_subagent`
- `lion_subagent_health`
- `lion_cancel_subagent`

### 3. Validación de la Nueva Tool

Escenarios a probar:

#### 3.1 Modo Planning + Plan Activo
- Lion está en modo `planning`
- Hay un plan activo
- Ejecutar `lion_plan_parallel` con 2-3 tareas
- Verificar que se ejecutan en paralelo
- Verificar que los resultados se agregan

#### 3.2 Modo Building (Debe Rechazar)
- Lion está en modo `building`
- Ejecutar `lion_plan_parallel`
- Verificar que rechaza con error claro

#### 3.3 Sin Plan Activo (Debe Rechazar)
- Lion está en modo `planning`
- No hay plan activo
- Ejecutar `lion_plan_parallel`
- Verificar que rechaza con error claro

#### 3.4 Concurrencia
- Ejecutar con `concurrency: 1`
- Verificar que solo 1 subagente corre a la vez
- Ejecutar con `concurrency: 5`
- Verificar que hasta 5 corren simultáneamente

#### 3.5 Manejo de Errores
- Una tarea falla intencionalmente
- Verificar que las demás continúan
- Verificar que el resultado indica cuál falló

### 4. Integración de Eventos

Verificar que los eventos se emiten correctamente:
- `lion.parallel.start`
- `lion.parallel.task.start`
- `lion.parallel.task.end`
- `lion.parallel.complete`

### 5. UI de Subagentes

Verificar que:
- Los subagentes paralelos aparecen en `runtime.subagentUi`
- El widget se actualiza correctamente
- Los estados cambian de "queued" → "running" → "completed"/"failed"

## Checklist

- [ ] `bun run check` pasa sin errores
- [ ] Tools existentes no están rotas
- [ ] `lion_plan_parallel` funciona en modo planning
- [ ] `lion_plan_parallel` rechaza en modo building
- [ ] `lion_plan_parallel` rechaza sin plan activo
- [ ] Control de concurrencia funciona
- [ ] Manejo de errores funciona
- [ ] Eventos se emiten correctamente
- [ ] UI de subagentes se actualiza

## Notas

- No crear tests automatizados a menos que el proyecto ya tenga infraestructura de testing para extensiones.
- La validación manual es suficiente dado que esta es una extensión interna.
