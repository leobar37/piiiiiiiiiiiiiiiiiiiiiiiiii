# Validator File Template

Use this structure for each file in `.plans/<plan-name>/validators/V-00X-*.md`.

Prefer declarative file names such as:

- `V-001-foundation-validation.md`
- `V-002-api-contract-validation.md`
- `V-003-auth-flow-validation.md`

Avoid generic names such as:

- `validator1.md`
- `misc.md`
- `validation.md`

```markdown
---
id: "V-001"
task_id: "T-001"
title: "Validar: Foundation Setup"
status: "pending"
created_at: "2026-04-06T10:30:00Z"
---

# Validar T-001: Foundation Setup

## Criterios Generados Automáticamente

- [ ] El código implementado sigue las convenciones del proyecto
- [ ] Los archivos mencionados en T-001 existen y son accesibles
- [ ] No hay errores de sintaxis o imports rotos

## Archivos a Validar

- `path/to/file-or-dir` - [Create | Modify | Review] - [why it matters]

## Referencia

- Task original: `tasks/T-001-foundation-setup.md`
- Plan: `.plans/<plan-name>/`
```

## Notes

- Each validator must be linked to exactly one task (task_id)
- Keep criteria concrete and verifiable by an auditor
- Status is managed by planner-validator.js - do not edit manually
- File name must start with validator ID (e.g., `V-001-`)
- Criterios should be generated automatically based on task content
- Write each validator so an execution command such as `/run-validators` can use it as a clean validation unit
