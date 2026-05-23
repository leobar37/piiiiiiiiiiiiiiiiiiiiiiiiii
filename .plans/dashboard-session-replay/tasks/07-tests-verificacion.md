# T-007: Tests y verificacion

**Phase**: verify
**Dependencies**: T-006
**Requirements**: NFR-001, NFR-003

## Objective

Run full test suite, verify performance, and ensure no regressions.

## Test Checklist

### Dashboard Tests

- [ ] `test/daemon.test.ts` — 7 tests pass
- [ ] `test/bridge.test.ts` — 12 tests pass
- [ ] `test/router.test.ts` — 6 tests pass
- [ ] New test: `test/session-rebuild.test.ts` — Reconstruction from events
- [ ] New test: `test/persistence.test.ts` — Event persistence

### Lion Extension Tests

- [ ] Build passes
- [ ] No TypeScript errors

### Performance Tests

- [ ] Reconstruct 1000 events in < 1s
- [ ] Write 100 events in < 100ms
- [ ] Memory usage stable after 10k events

### Manual Tests

- [ ] Widget appears in TUI when Lion activates
- [ ] Dashboard URL is clickable
- [ ] Events are persisted to `.lion/dashboard/events.jsonl`
- [ ] Rebuild endpoint returns correct data
- [ ] Frontend hydrates from server
- [ ] Live events merge with historical events
- [ ] Run selector filters correctly

## Verification

- All tests pass
- Build succeeds
- Check passes
- Manual integration test successful
