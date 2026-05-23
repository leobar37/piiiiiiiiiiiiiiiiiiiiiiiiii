# Lion Extension

Extension de orquestacion para pi coding agent que proporciona planificacion estructurada, ejecucion de tareas con subagentes y revision automatica de codigo.

## Diagrama de Estado

El siguiente diagrama muestra el flujo completo de estados de Lion, desde la activacion hasta la finalizacion de una tarea:

```mermaid
stateDiagram-v2
    [*] --> Inactivo

    Inactivo --> Planning : /lion-activate
    Inactivo --> Planning : /lion-activate <plan>

    Planning --> Building : /lion-build
    Planning --> Planning : cambio de plan

    Building --> Ejecutando : seleccionar tarea
    Building --> Planning : tarea completada / fallida

    Ejecutando --> EsperandoRevision : executor completado
    Ejecutando --> Fallido : executor fallo

    EsperandoRevision --> Revisando : delegar reviewer
    EsperandoRevision --> Fallido : timeout / error

    Revisando --> Aprobado : verdict = approved
    Revisando --> Rechazado : verdict = rejected
    Revisando --> Fallido : reviewer fallo

    Rechazado --> Corrigiendo : solicitar correccion
    Corrigiendo --> Ejecutando : reintentar executor
    Corrigiendo --> Fallido : max attempts alcanzado

    Aprobado --> Building : marcar completa
    Fallido --> Building : siguiente tarea / reintentar
    Fallido --> [*] : abortar
```

## Arquitectura del Runtime

```mermaid
graph TB
    subgraph "Extension API"
        CMD[Commands<br/>/lion-activate<br/>/lion-build]
        UI[UI Updates<br/>Status / Widget]
    end

    subgraph "Lion Runtime"
        direction TB
        STATE[LionState<br/>mode | plan | task]
        CORE[LionCore<br/>activeRun | runHistory]
        EVENTS[LionEventBus<br/>pub/sub eventos]

        subgraph "Subagent Management"
            CTRL[Controllers<br/>Map&lt;runId, Controller&gt;]
            JOBS[SubagentJobs<br/>Map&lt;taskId, Job&gt;]
            UI_STATE[SubagentUi<br/>Map&lt;taskId, UiState&gt;]
            RETAINED[RetainedInstances<br/>Map&lt;taskId, Subagent&gt;]
        end
    end

    subgraph "Persistencia"
        P_STATE[Estado<br/>lion-state entries]
        P_CORE[Core<br/>lion-core entries]
    end

    subgraph "Estrategias"
        REV[Review Verdict Parser]
        VAL[Plan Validation]
        WORKFLOW[Reviewed Executor Workflow]
    end

    subgraph "Planes"
        DETECT[Detect Kind]
        STRUCT[Structured Plan Loader]
        SELECT[Task Selection]
    end

    CMD --> STATE
    STATE --> CORE
    CORE --> EVENTS
    EVENTS --> UI

    CORE --> CTRL
    CTRL --> JOBS
    JOBS --> UI_STATE
    RETAINED -.-> CTRL

    STATE --> P_STATE
    CORE --> P_CORE

    WORKFLOW --> REV
    WORKFLOW --> VAL
    CORE --> WORKFLOW

    STATE --> DETECT
    DETECT --> STRUCT
    STRUCT --> SELECT
    SELECT --> CORE
```

## Flujo de Eventos (Build Pipeline)

```mermaid
sequenceDiagram
    participant User
    participant Extension
    participant Workflow as runReviewedExecutorWorkflow
    participant Controller as SubAgentController
    participant Executor
    participant Reviewer
    participant EventBus

    User->>Extension: /lion-build
    Extension->>EventBus: lion.build.start

    loop Intento 1..maxAttempts
        Workflow->>Workflow: buildExecutorPrompt
        Workflow->>EventBus: delegation.prompt.created(executor)

        Workflow->>Controller: executeTask(executor)
        Controller->>Executor: delegar
        Executor-->>Controller: DelegationResult
        Controller-->>Workflow: result
        Workflow->>EventBus: delegation.end(executor)

        alt Executor fallo
            Workflow-->>Extension: LionBuildResult(failed)
            Extension->>EventBus: lion.build.failed
        else Executor exitoso
            Workflow->>Workflow: buildReviewerPrompt
            Workflow->>EventBus: delegation.prompt.created(reviewer)

            Workflow->>Controller: executeTask(reviewer)
            Controller->>Reviewer: delegar
            Reviewer-->>Controller: DelegationResult
            Controller-->>Workflow: result
            Workflow->>EventBus: delegation.end(reviewer)

            alt Reviewer fallo
                Workflow-->>Extension: LionBuildResult(failed)
                Extension->>EventBus: lion.build.failed
            else Reviewer exitoso
                Workflow->>Workflow: parseReviewVerdict
                Workflow->>EventBus: review.verdict

                alt Veredicto approved
                    Workflow->>EventBus: task.approved
                    Workflow-->>Extension: LionBuildResult(approved)
                    Extension->>EventBus: lion.build.complete
                else Veredicto rejected y quedan intentos
                    Workflow->>EventBus: correction.requested
                    Workflow->>Workflow: buildCorrectionPrompt
                    Note over Workflow: siguiente iteracion del loop
                else Veredicto rejected y no quedan intentos
                    Workflow->>EventBus: task.rejected
                    Workflow-->>Extension: LionBuildResult(rejected)
                    Extension->>EventBus: lion.build.complete
                end
            end
        end
    end
```

## Modelo de Datos

```mermaid
classDiagram
    class LionState {
        +version: 1
        +active: boolean
        +mode: LionMode
        +activePlanPath: string
        +activePlanSlug: string
        +planKind: LionPlanKind
        +activeTaskId: string
        +maxAttempts: number
        +lastRunId: string
        +lastBuild: LionBuildResult
    }

    class LionCore {
        +activeRun: LionRun
        +runHistory: LionRun[]
    }

    class LionRun {
        +runId: string
        +planSlug: string
        +taskId: string
        +taskTitle: string
        +status: LionRunStatus
        +attempts: number
        +maxAttempts: number
        +executorSummary: string
        +reviewerSummary: string
        +verdict: LionReviewVerdict
        +subagents: LionRunSubagent[]
        +createdAt: number
        +updatedAt: number
    }

    class LionPlan {
        +kind: LionPlanKind
        +slug: string
        +rootPath: string
        +tasks: LionTask[]
    }

    class LionTask {
        +id: string
        +title: string
        +file: string
        +status: LionTaskStatus
        +dependencies: string[]
        +requirements: string[]
        +phase: string
    }

    class LionEventBus {
        +emit(event: LionEvent)
        +on(type, handler)
    }

    class LionRuntime {
        +pi: ExtensionAPI
        +state: LionState
        +core: LionCore
        +events: LionEventBus
        +controllers: Map
        +subagentJobs: Map
        +subagentUi: Map
    }

    LionState --> LionBuildResult
    LionCore --> LionRun
    LionRun --> LionRunSubagent
    LionPlan --> LionTask
    LionRuntime --> LionState
    LionRuntime --> LionCore
    LionRuntime --> LionEventBus
```

## Estados de Ejecucion (LionRunStatus)

| Estado | Descripcion |
|--------|-------------|
| `idle` | Sin run activo |
| `executing` | Executor trabajando en la tarea |
| `awaiting_orchestrator` | Esperando decision del orquestador |
| `reviewing` | Reviewer evaluando el resultado |
| `correcting` | Solicitando correccion despues de rechazo |
| `approved` | Tarea aprobada por reviewer |
| `rejected` | Tarea rechazada (puede reintentar) |
| `failed` | Fallo definitivo (executor o reviewer) |
