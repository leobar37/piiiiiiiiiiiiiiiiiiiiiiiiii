# Orchestrator Handoff Reference

Use this reference after `/plan-features` creates or refreshes an initiative
overview. The goal is to let a parent session coordinate implementation through
sub-agent handoffs without turning `/plan-features` itself into an
implementation command.

Important: `/plan-features` does not launch implementation sub-agents. It only
outputs the delegation text that the user or parent orchestrator can copy into
the intended execution session. During planning, exploratory or investigative
delegation is allowed when needed; implementation delegation must remain an
explicit handoff in the final output.

Do not end the handoff by asking whether to launch, continue, or delegate the
next feature. The handoff is the deliverable. If there is a recommended next
feature, output the copy-paste prompt for that delegation and stop.

## Session Role

The parent session is an orchestrator. Its responsibility is to carry and
supervise the initiative end to end: select the next work unit, delegate it,
review the result, fold the learnings back into the parent context, and continue
until all features are complete or a real blocker must be escalated.

- read-only during orchestration planning
- coordinates one feature at a time or a safe parallel batch
- prepares precise implementation prompts for sub-agents
- reviews sub-agent results before continuing
- carries context forward until the full initiative is completed or blocked
- decides the next delegation step after each report instead of stopping at the
  first completed feature
- creates correction or investigation delegations when feedback shows drift,
  partial work, or invalidated assumptions
- never edits source files directly in the orchestration-planning phase

## Inputs

The orchestrator should use:

- `.plans/<initiative>-overview/context.md`
- `.plans/<initiative>-overview/living-map.md`
- `.plans/<initiative>-overview/feature-index.md`
- `.plans/<initiative>-overview/dependency-graph.md`
- `.plans/<initiative>-overview/worktrees.md`
- `.plans/<initiative>-overview/features/F-00X-<feature-slug>.md`
- any sub-agent final report returned to the parent session

## Feature Selection

Before prompting a sub-agent:

1. read the dependency graph
2. read the living map for unknowns, prior feedback, and plan adjustments
3. choose the next unblocked feature, investigation, correction, validation, or
   parallel-safe batch
4. prefer foundation dependencies before dependent features
5. avoid assigning two agents to overlapping files unless explicitly safe
6. include prior sub-agent output when it affects the next feature

Prefer agent-sized work units. Do not delegate tiny mechanical edits that are
smaller than the handoff overhead unless they unblock a larger sequence or are a
focused correction.

## Sub-Agent Prompt Shape

Use this structure when delegating implementation:

```text
Goal:
[Implement or validate one specific feature ID and title.]

Context:
- Repo root: [absolute repo path]
- Initiative overview: .plans/<initiative>-overview/
- Living map: .plans/<initiative>-overview/living-map.md
- Feature brief: .plans/<initiative>-overview/features/F-00X-<feature-slug>.md
- Relevant completed feature outputs:
  - [feature ID]: [short summary or none]
- Dependency notes:
  - [dependency constraints from dependency-graph.md]

Planning instruction:
- Before starting, load and follow the relevant internal skill for the delegated
  work. Use `code-review` for review tasks and `planner` for planning tasks.
- Use the planner skill as a reasoning guide to form a coherent approach before
  editing, but do not write a separate detailed plan unless the parent session
  explicitly requests one.
- Keep the plan internal and lightweight: identify the objective, constraints,
  likely files, validation, and risks before implementation.

Objective:
[Concrete implementation objective for this feature.]

Implementation decisions:
1. [decision or constraint from feature brief / parent analysis]
2. [preserve existing behavior]
3. [compatibility constraint]

Likely files:
- [path] - [Create | Modify | Review] - [reason]

Non-goals:
- [explicitly out-of-scope work]

Test expectations:
- [observable behavior]
- [compatibility expectation]
- [regression expectation]

Validation:
Run:
- [exact validator command]
- [exact focused test command]

Expected final report:
- Status: completed | partial | blocked | needs-correction
- Feature ID / Delegation ID
- Files changed
- How the implementation maps to the feature brief
- Deviations from the delegation, if any
- Behaviors preserved
- Validation results
- Any remaining risks or blockers
- Recommended orchestrator action
```

Do not ask the sub-agent to run `/plan` or create another durable plan by
default. The feature brief and handoff should be enough for implementation. Add
a separate planning step only when the feature is still ambiguous, unusually
risky, or too large to implement safely from the brief.

## Output Contract

When `/plan-features` produces a Coordinator Handoff, the response must:

- provide the next recommended delegation as copy-paste text
- include enough context for the user to paste it into the intended
  orchestrator or sub-agent session
- avoid conversational follow-up questions
- avoid offering to launch implementation
- avoid taking action beyond the planning artifacts and handoff text
- stop after the handoff is complete

Incorrect endings:

- "Do you want me to launch F-003 now?"
- "Should I continue with the next feature?"
- "I can start the implementation if you want."

Correct ending:

- "Copy this delegation into the intended execution session."

## Review Loop

After each sub-agent returns:

1. compare the final report against the feature brief
2. verify dependency and compatibility claims
3. compare new facts against `living-map.md`
4. classify the report:
   - `accepted`: result matches the brief and validation is adequate
   - `needs-correction`: useful work landed but drift, gaps, or regressions need
     a targeted correction delegation
   - `blocked`: the agent could not proceed due to missing context, failing
     dependencies, or unavailable tooling
   - `plan-invalidated`: the result proves the current decomposition or
     assumptions are wrong
5. identify whether follow-up work is needed
6. carry forward useful context to the next sub-agent prompt
7. if correction is needed, delegate the correction before moving to dependent
   features
8. stop and escalate only if the result is incomplete, risky, blocked, or needs
   a human decision

## Parent Final Report

When the initiative is complete or blocked, the parent session should report:

- features completed
- features still pending or blocked
- key files changed by sub-agents
- validation summary
- risks carried forward
- recommended next command or review step
