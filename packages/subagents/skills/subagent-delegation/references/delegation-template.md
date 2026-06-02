# Delegation Template

Use this template for implementation, validation, investigation, or review
handoffs that another agent should execute.

```text
Goal:
[Implement, validate, investigate, or review one specific work unit.]

Required Skill:
- Load and follow `code-review` for review work.
- Load and follow `planner` for planning work.
- For implementation, correction, validation, or integration work, include the
  required execution rules in this handoff unless a project-specific executor
  skill is available.

Context:
- Repo root: [absolute repo path]
- Source material: [plan/task/feature brief/user request path or summary]
- Relevant completed outputs: [prior agent report summaries or none]
- Dependency notes: [ordering, blockers, or parallelization constraints]
- Orchestrator classification: [new work | correction | blocked follow-up | plan-invalidated follow-up]

Objective:
[Concrete result expected from the receiving agent.]

Scope:
- [Included responsibility]
- [Included responsibility]

Non-Goals:
- [Explicitly excluded work]
- [Behavior or subsystem not to change]

Implementation Constraints:
- [Mandatory decision, compatibility rule, or preservation requirement]
- [Existing behavior that must remain intact]

Likely Files:
- [path] - [Create | Modify | Review] - [reason]
- [path] - [Create | Modify | Review] - [reason]

Validation:
Run:
- [exact command]
- [exact focused test or build command]

If commands are unknown or unavailable, perform:
- [manual validation or code review check]

Expected Final Report:
- Status: completed | partial | blocked | needs-correction
- Delegation ID / Feature ID
- Files changed
- What was implemented or discovered
- How the result maps to the delegated objective
- Deviations from the delegation, if any
- Behaviors preserved
- Validation results
- Remaining risks, blockers, or follow-up work
- Recommended orchestrator action
```

## Guidance

- Keep the prompt self-contained enough to paste into a fresh agent session.
- Include plan paths such as `.plans/<name>/...` when delegation comes from a
  durable plan.
- Use likely files as orientation, not as a mandatory edit recipe, unless a
  specific file change has already been decided.
- Keep the delegated unit moderate: one coherent outcome with a meaningful
  validation surface, not a tiny collection of mechanical edits.
- Include exact validation commands when known. If not known, state the best
  available manual validation expectations.
- Do not end by asking whether to start. The prompt itself is the deliverable.
