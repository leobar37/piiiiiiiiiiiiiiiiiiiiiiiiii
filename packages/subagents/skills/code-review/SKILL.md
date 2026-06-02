---
name: code-review
description: "Run evidence-backed code reviews for changed code and related functionality. Use when reviewing uncommitted changes, scoped diffs, feature changes, or delegated review bundles."
allowed-tools: Read, Grep, Glob, Bash
---

# Code Review

Use this skill for read-only code review. Do not edit files.

## Review Priorities

Review in this order:

1. Correctness bugs, data loss, race conditions, broken control flow, and behavior regressions.
2. Security, privacy, authorization, injection, secret handling, and unsafe filesystem or process behavior.
3. Missing or misleading validation, tests, or runtime evidence.
4. Public API, type, schema, config, persistence, and compatibility contract issues.
5. Maintainability, coupling, error handling, observability, and performance risks.
6. Style only when it creates a real maintenance or correctness risk.

## Workflow

1. Identify the reviewed scope and whether it is dirty work, related functionality, or user-provided scope.
2. Inspect the relevant diff or files before drawing conclusions.
3. Follow imports, tests, public exports, and runtime entrypoints only as needed to validate impact.
4. Try to disprove each suspected issue before reporting it. Check the caller, guard, test, schema, config, or runtime path that could make the concern harmless.
5. Classify each point as verified, inferred risk, or unknown.
6. Return findings first, ordered by severity.

## Output Contract

Use this shape:

```text
Findings
- [severity] path:line - Issue, impact, and evidence.

Evidence Checked
- Files, diffs, commands, or tests inspected.

False-Positive Checks
- Why the finding is not explained away by existing guards, tests, callers, config, or intended behavior.

Unknowns / Gaps
- Review gaps or validation that could not be completed.

Verdict
- approved | changes-requested | blocked
```

If there are no findings, say that clearly and still list evidence checked and residual risk.

## Constraints

- Do not edit files.
- Do not ask the user for clarification.
- Do not report a finding until you have checked the most likely false-positive explanation.
- Do not approve work when validation is missing for a risky change.
- Do not report style-only preferences as blocking findings.
- Do not claim tests, builds, or runtime checks passed unless you actually saw evidence.
