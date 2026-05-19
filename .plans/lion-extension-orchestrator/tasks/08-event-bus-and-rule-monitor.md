# T-008 Event Bus and Rule Monitor

## Objective

Add Lion orchestration events, durable event storage, sub-agent event bridging, and rule monitoring so the pipeline can be audited and process violations can be detected.

## Requirements Covered

- `FR-011`
- `FR-012`
- `FR-013`
- `NFR-005`
- `NFR-006`

## Dependencies

- `T-001`
- `T-005`
- `T-006`

## Files or Areas Involved

- `packages/extensions/src/extensions/lion/events/index.ts` — Create — Public event exports.
- `packages/extensions/src/extensions/lion/events/types.ts` — Create — `LionEventMap`, `LionEvent`, `LionEventType`.
- `packages/extensions/src/extensions/lion/events/bus.ts` — Create — Typed best-effort event bus.
- `packages/extensions/src/extensions/lion/events/store.ts` — Create — JSONL event persistence under `.lion/runs/`.
- `packages/extensions/src/extensions/lion/events/rule-monitor.ts` — Create — Rule violation detector.
- `packages/extensions/src/extensions/lion/subagents/controller.ts` — Modify — Bridge sub-agent events.
- `packages/extensions/src/extensions/lion/commands.ts` — Modify — Emit lifecycle events.
- `packages/extensions/src/extensions/lion/strategies/linear-pipeline.ts` — Modify — Emit delegation/review/correction events or accept an event sink.

## Expected Outcome

- Lion emits standard events for activation, plan loading, build start/end, task selection, delegation lifecycle, review verdict, corrections, completion, failure, and rule violations.
- Lion stores build run events as JSONL under `.lion/runs/<runId>.events.jsonl`.
- Sub-agent events are wrapped as `lion.subagent.event`.
- Rule monitor flags invalid transitions such as task completion without approval.
- Listener failures do not crash the pipeline.

## Context to Preserve

- `packages/subagents` already has `SubAgentEventBus`; Lion should not force its event types into that bus.
- Lion event bus should mirror the simple typed pub/sub style while using Lion-specific event types.
- Event logs are diagnostics, not the durable source of task truth; checklist remains task status source.

## Constraints

- Do not require event store writes to succeed for the entire build to be considered successful, but do report store write errors.
- Do not lose original sub-agent event payloads when bridging.
- Keep rule monitor deterministic and testable.

## Completion Criteria

- [ ] `LionEventBus` exists and supports typed listeners plus wildcard listeners.
- [ ] `LionEventStore` writes JSONL events by run ID.
- [ ] Core pipeline emits required event types.
- [ ] Sub-agent events are bridged.
- [ ] Rule monitor emits `lion.rule.violation` for invalid completion without approval.
- [ ] Event listener errors are swallowed or isolated with no build crash.

## Validation

```bash
npm run check
```

Recommended focused tests if available:

- Event bus wildcard listener receives events.
- Event store writes valid JSONL.
- Rule monitor detects completion without approval.

## Expected Final Report

- Event schema summary.
- Event storage location.
- Rule monitor checks implemented.
- Validation result.

## Risks or Notes

- Event type sprawl can become hard to maintain. Keep v1 events limited to orchestration-critical transitions.
