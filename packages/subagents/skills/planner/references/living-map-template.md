# Living Map Template

Use this structure for `.plans/<initiative-name>-overview/living-map.md` in
`initiative-overview` mode.

```markdown
# [Initiative Title] Living Map

## Current Objective

[Current best understanding of the initiative objective. Note whether it was
explicitly provided or inferred from session context.]

## Verified Knowledge

- [fact confirmed by inspected code, docs, plans, or sub-agent report]

## Assumptions

- [working assumption that is plausible but not fully verified]

## Unknowns / Investigation Needed

| ID | Question | Why It Matters | Suggested Delegation Type | Status |
| --- | --- | --- | --- | --- |
| `U-001` | [unknown] | [impact] | investigation | open |

## Completed Delegations

| Feature ID | Delegation Type | Result | Report Summary | Follow-up |
| --- | --- | --- | --- | --- |
| `F-001` | implementation | accepted | [summary] | none |

## Sub-Agent Feedback Log

- `[date/session if known]` `F-001`: [important facts, deviations, validation
  results, or blockers returned by the sub-agent]

## Plan Adjustments

- [change made because of new evidence, feedback, drift, or invalidated assumptions]

## Next Recommended Delegation

- Feature ID: `F-00X`
- Type: implementation | investigation | validation | correction | integration
- Reason: [why this is the next safest useful work unit]
- Required skill for receiving agent: project-specific executor skill when available
```

Notes:

- Treat this file as the orchestration memory for the initiative.
- Update it when refreshing the overview or incorporating sub-agent reports.
- Keep unknowns explicit; do not invent implementation certainty before
  investigation results exist.
