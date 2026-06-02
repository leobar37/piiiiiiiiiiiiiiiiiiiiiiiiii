---
name: subagent-delegation
description: "Prepare copy-paste prompts and durable handoffs for delegating implementation, validation, investigation, or refactor work to another agent. Use when planning an agent handoff, creating subagent prompts, delegating tasks from a plan, splitting work across agents, or generating `.delegations/` files for large instructions. Triggers: subagent, delegation, handoff, delegate to agent, prompt for another agent, agent task, refactor delegation."
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Subagent Delegation Skill

Prepare execution-ready prompts that can be copied into another agent or saved
as durable handoff files under `.delegations/`.

## Scope

Use this skill when the user wants to delegate work to another agent, prepare a
subagent prompt from a plan, split implementation across agents, or turn a
refactor proposal into precise execution instructions.

This skill produces delegation text. It does not launch implementation agents by
default and does not modify application source code unless explicitly asked to
create or update delegation artifacts.

For review-style delegations, the receiving agent should load the `code-review`
skill. For planning-style delegations, use the `planner` skill. For
implementation-style delegations, include the execution rules directly in the
handoff unless a project-specific executor skill is available.

## Core Workflow

1. Identify the work unit being delegated and the intended recipient.
2. Read the relevant source material: user request, plan files, task files,
   feature briefs, existing code, or prior agent reports.
3. Separate verified context from assumptions and unknowns.
4. Decide whether to output the delegation inline or save it in `.delegations/`.
5. Draft a self-contained prompt with objective, context, constraints,
   validation, and expected final report.
6. For refactors, include the final API contract before implementation details.

## When To Save A File

Save to `.delegations/<slug>.md` when the prompt is long, contains detailed API
contracts, covers multiple files or agents, or the user explicitly wants to take
the delegation to another session.

Use the bundled helper when creating a new delegation shell:

```bash
node scripts/delegation-writer.js create <slug> "<Title>"
```

Use `--force` only when intentionally replacing an existing delegation file.

For the file policy, see `references/file-output-policy.md`.

## Delegation Prompt Requirements

Every delegation must include:

- `Goal`: one specific outcome for the receiving agent
- `Required Skill`: the skill the receiving agent must load, such as
  `code-review` for review work or `planner` for planning work
- `Context`: repo root, source plan or task, relevant files, dependency notes
- `Objective`: concrete result expected after execution
- `Scope`: what is included
- `Non-Goals`: what must not be changed
- `Implementation Constraints`: mandatory decisions and behavior to preserve
- `Likely Files`: paths to create, modify, or review, with reasons
- `Validation`: exact commands or manual checks when known
- `Expected Final Report`: fields the receiving agent must return

Use `references/delegation-template.md` for the standard shape.

## Refactor Delegations

When delegating a refactor, include a `Final API Contract` section. It should
define the intended public surface before asking another agent to edit code.

Include whichever are relevant:

- public exports
- function, class, hook, route, component, or CLI signatures
- input and output shapes
- error behavior
- compatibility expectations
- migration notes
- examples of desired usage

If the API cannot be fully specified from current evidence, state the unknowns
instead of inventing a contract.

Use `references/refactor-delegation-template.md` for refactor prompts.

## Quality Rules

- Do not produce vague prompts such as "implement backend" or "clean this up".
- Do not delegate tiny mechanical edits unless they unblock a larger sequence,
  are a focused correction, or the user explicitly asked for that exact split.
- Prefer moderate work units with one coherent outcome, a clear review surface,
  and meaningful validation.
- Do not ask the receiving agent to create another durable plan unless the work
  is still ambiguous or unusually risky.
- Do not prescribe mechanical edits unless they are known constraints.
- Prefer outcome-oriented tasks with concrete validation.
- Include prior subagent outputs when they affect the next delegation.
- Include the orchestrator's current classification when the delegation is a
  correction, investigation, blocked follow-up, or plan-invalidation response.
- Avoid assigning overlapping files to parallel agents unless explicitly safe.
- End with the delegation or saved file path, not with an offer to launch work.

## Output Contract

For inline output, return only the delegation text plus a short instruction such
as: `Copy this delegation into the intended execution session.`

For saved output, report the file path and a short summary of what it contains.

If the work is under-specified enough that a useful delegation would be unsafe,
ask the minimum clarifying question before drafting.
