# T-007: Tests y verificacion

**Phase**: verify
**Dependencies**: T-004, T-006
**Requirements**: NFR-001, NFR-004

## Objective

Run full test suite, verify no breaking changes, and ensure everything works end-to-end.

## Test Checklist

### Dashboard Tests

- [ ] `test/daemon.test.ts` — 7 tests pass
- [ ] `test/bridge.test.ts` — 11 tests pass
- [ ] `test/router.test.ts` — 5 tests pass
- [ ] New test: `test/lion-bridge.test.ts` — LionDashboardBridge enrichment

### Lion Extension Tests

- [ ] `test/lion/workflow.test.ts` — All tests pass (or updated if breaking)
- [ ] No runtime emission of `lion.subagent.event` remains in `createLionSubAgentController`
- [ ] `LionEvents.subagentEvent` remains parseable for historical event logs unless a separate removal audit is completed

### Integration Tests

- [ ] Start dashboard, verify no duplicate events
- [ ] Start Lion run, verify events have metadata
- [ ] Verify state snapshot updates correctly
- [ ] Stop dashboard, verify clean shutdown
- [ ] Create multiple controllers in one run, verify each controller is registered once
- [ ] Verify `lion.subagent.event` is not forwarded alongside enriched `subagent` events
- [ ] Verify `.events.jsonl` persistence either preserves expected subagent visibility or documents intentional removal

### Build Verification

- [ ] `cd packages/dashboard && bun run build:all` succeeds
- [ ] `cd packages/extensions && bun run build` succeeds
- [ ] `bun run check` from repo root passes

## Breaking Changes Audit

| Change | Breaking? | Mitigation |
|---|---|---|
| Remove `lion.subagent.event` emission | Potentially | Only after bridge registration exists; keep definition for historical logs; audit persistence |
| Remove SubAgentEventBus direct bridge | No | T-001 keeps events arriving via LionEventBus temporarily; T-002 restores direct subagent flow through enriched bridge |
| Add metadata to DashboardEventPayload | No | Optional fields, backward compatible |
| Add lion state to DashboardState | No | New field, existing code ignores it |

## Documentation

Update `packages/dashboard/README.md` (or create one) with:
- How to start the dashboard from Lion
- Architecture overview
- Event enrichment schema

## Verification

- All tests pass
- Build succeeds
- Check passes
- Manual integration test successful
