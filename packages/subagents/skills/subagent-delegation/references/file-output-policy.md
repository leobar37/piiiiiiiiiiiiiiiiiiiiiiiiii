# Delegation File Output Policy

Use `.delegations/` for durable handoffs that need to survive across sessions or
are too large to keep comfortably inline.

## Inline Output

Return the delegation inline when:

- there is one short work unit
- the prompt fits comfortably in the final response
- no detailed API contract is needed
- the user did not ask for a file

End with:

```text
Copy this delegation into the intended execution session.
```

## File Output

Write `.delegations/<slug>.md` when:

- the user asks for a file or durable handoff
- there are multiple agents or parallel-safe batches
- the prompt includes detailed API contracts
- the delegation references many files, plans, or prior reports
- the receiving agent needs a stable artifact to read later

Use specific kebab-case names:

- `.delegations/refactor-auth-api.md`
- `.delegations/checkout-validation-agent.md`
- `.delegations/extract-planner-handoff.md`

Avoid generic names such as:

- `.delegations/task.md`
- `.delegations/prompt.md`
- `.delegations/new-delegation.md`

## Helper Script

The helper creates a standard shell without generating the intelligent content:

```bash
node scripts/delegation-writer.js create <slug> "<Title>"
```

By default it refuses to overwrite existing files. Use `--force` only when the
caller explicitly intends to replace the file.

After creating the shell, fill in the sections from inspected context. Do not
leave placeholders in the final delegation unless the placeholder represents a
real unresolved unknown.
