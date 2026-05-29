# Oh-My-OpenAgent Analysis — Findings for `packages/subagents`

**Source:** `https://github.com/code-yeongyu/oh-my-openagent/tree/dev`
**Date:** 2026-05-29
**Scope:** Config-driven agent overrides, model assignment strategies, ultrawork mode, and planning architecture.

---

## 1. Config-Driven Agent Overrides

### What they have

`oh-my-openagent` exposes an `agents` key in `oh-my-opencode-config.ts` typed as `AgentOverridesSchema`. Every built-in agent (sisyphus, atlas, prometheus, metis, momus, oracle, librarian, explore, hephaestus, etc.) can be overridden via configuration without touching code.

Supported override fields per agent:

| Field | Purpose |
|---|---|
| `model` | Hard-set model for this agent |
| `fallback_models` | Custom fallback chain if primary fails |
| `category` | Inherit model and settings from a named category |
| `skills` | Inject skill names into the agent prompt |
| `temperature`, `top_p`, `maxTokens` | Inference parameters |
| `thinking` | Anthropic extended thinking config |
| `reasoningEffort` | OpenAI reasoning effort level |
| `textVerbosity` | Output verbosity (low / medium / high) |
| `providerOptions` | Provider-specific passthrough to SDK |
| `ultrawork` | Per-message override model/variant when ultrawork keyword is detected |
| `compaction` | Dedicated model/variant for context compaction |

### Our gap

In `packages/subagents/src/definitions/*.ts` the `model` field is optional and never populated. `session-factory.ts` has `model: undefined // TODO: resolve model from config.model string`. There is currently no external config where a user can map definition names (`analyzer`, `planner`, `executor`, `reviewer`) to specific models.

### Recommendation

Add a `SubAgentOverrides` config schema (JSON or Zod) that maps definition names to override objects, and merge it in `resolveEffectiveConfig()` before building the session.

---

## 2. Model Assignment and Strengths

### Their fallback chains (from `packages/model-core/src/model-requirements.ts`)

| Agent | Primary | Fallback chain |
|---|---|---|
| **sisyphus** (planner / orchestrator) | `claude-opus-4-7` (variant max) | `kimi-k2.6` -> `kimi-k2.5` -> `gpt-5.5` -> `glm-5` |
| **atlas** (orchestrator) | `claude-sonnet-4-6` | `kimi-k2.6` -> `gpt-5.5` -> `minimax-m2.7` |
| **librarian** / **explore** (analysis) | `gpt-5.4-mini-fast` | `qwen3.5-plus` -> `minimax-m2.7-highspeed` -> `claude-haiku-4-5` |
| **prometheus** (review) | `claude-opus-4-7` (max) | `gpt-5.5` (high) -> `glm-5.1` -> `gemini-3.1-pro` |
| **oracle** (architecture) | `gpt-5.5` (high) | `gemini-3.1-pro` (high) -> `claude-opus-4-7` (max) -> `glm-5.1` |

### Requested mapping

#### Orchestrator -> Kimi K2.6

In their chain, `kimi-k2.6` is the #2 fallback for both `sisyphus` and `atlas`. They wrote a **dedicated 8-block prompt architecture** for Kimi K2.x because:

- Kimi was post-trained with **Toggle RL** (~25-30% token reduction) and a **Generative Reward Model** that scores appropriate detail, helpfulness, and strict instruction following.
- It has strong **intent inference** from RL training, so they removed Claude-style "re-verify everything" gates to avoid double-taxing the model.
- Their Kimi-native prompt emphasizes parallel tool usage, aggressive exploration budgets, tiered verification loops (V1/V2/V3), and token economy.

**Strengths for orchestration:** long context, excellent instruction following, fast inference, cost-efficient for high-turn orchestration loops.

#### Analyzer -> DeepSeek Flash

Their repo does not use DeepSeek in built-in fallback chains. However, their `librarian`/`explore` agents (research/analyzer roles) use **fast, cheap models**: `gpt-5.4-mini-fast`, `qwen3.5-plus`, `minimax-m2.7-highspeed`, `claude-haiku-4-5`.

**Why DeepSeek Flash fits the analyzer role:**

- Flash variants are optimized for latency and throughput.
- Analysis is typically read-only with lower reasoning demands than planning or architecture review.
- Using a fast/cheap model for analysis frees budget for the orchestrator (Kimi K2.6) and executor (strong coder model).
- DeepSeek's MoE architecture is particularly efficient for wide-context retrieval tasks (grep, read many files, summarize).

### Recommended mapping for our repo

| Definition | Recommended model | Rationale |
|---|---|---|
| `planner` (orchestrator) | `kimi-k2.6` | Long context, intent inference, parallel delegation, token economy |
| `analyzer` | `deepseek-chat` / flash variant | Fast, cheap, good at retrieval and synthesis |
| `executor` | `claude-sonnet-4` or `gpt-5.5` | Strong coding, tool use, patch application |
| `reviewer` | `claude-opus-4-7` or `gpt-5.5` | High reasoning for catching bugs and logic errors |

---

## 3. Novelties: Ultrawork Mode and Planning

### 3.1 Ultrawork keyword mode

This is not just a prompt append. It is a **keyword-detected mode** (`keyword_detector.ts` supports `ultrawork`, `search`, `analyze`, `team`, `hyperplan`, `hyperplan-ultrawork`). When triggered, it injects the `default.md` prompt with extreme rigor mandates.

Key requirements:

- **100% certainty protocol:** Must not start implementation until fully certain. Must fire `explore` + `librarian` agents in parallel, then consult `oracle` or `artistry` for hard problems.
- **Mandatory Plan Agent:** For any task with 2+ steps, unclear scope, or implementation needed, MUST invoke `task(subagent_type="plan")`. The planner is restricted: can only write `.omo/**/*.md`, can only use research bash commands.
- **Parallel Task Graph:** Plans must include execution waves, dependency matrix, and structured TODOs with category/skills per task.
- **TDD (RED -> GREEN -> SURFACE):** Every production change must have a failing test first, then the fix, then a real-surface artifact (tmux/curl/browser/CLI).
- **Manual QA Mandate:** Types passing is NOT enough. Must run commands, builds, and real user-facing surfaces.
- **Reviewer Gate:** For large tasks (3+ files, 20+ turns, 30+ minutes), must spawn a reviewer agent and get unconditional approval.
- **Durable Notepad:** A temp markdown file that survives context loss, recording plan, scenarios, findings, and learnings.
- **Zero Tolerance:** No partial completion, no mockups, no "you can extend this later."

### 3.2 Planning architecture

Their planner (`sisyphus`) is not a generic subagent. It is the **primary agent** with specialized behavior.

#### Model-specific prompts

They build entirely different prompts per model family:

- `kimi-k2.6`: 8-block architecture, Toggle RL aware, token economy rules, re-entry rule for confirmation turns.
- `claude-opus-4-7`: Thinking budget 32k tokens, heavy on verification and reasoning.
- `gpt-5.5`: `reasoningEffort: "medium"`, structured for OpenAI's reasoning patterns.
- `gemini`: Tool mandate enforcement, lost-in-the-middle mitigation by placing critical instructions before the `<Constraints>` block.

#### Intent gate (every message)

- Step 0: Verbalize intent before classifying.
- Step 1.5: Turn-local intent reset (never carry implementation mode from prior turns).
- Step 2.5: Context-completion gate (only implement when explicit verb + concrete scope + no blocking specialist).

#### Execution loop (7 phases)

EXPLORE -> PLAN -> ROUTE -> EXECUTE_OR_SUPERVISE -> VERIFY -> RETRY -> DONE

Verification is tiered:

- **V1:** Single file, <10 lines, no behavior change -> `lsp_diagnostics` only.
- **V2:** Single domain, <=3 files, behavioral change -> diagnostics + tests + one execution.
- **V3:** Multi-file, cross-cutting, or ANY delegated work -> full rigor (diagnostics, tests, build, manual QA, read every file subagent touched).

#### Delegation prompt structure (6 mandatory sections)

1. TASK: Atomic, specific goal
2. EXPECTED_OUTCOME: Concrete deliverables with success criteria
3. REQUIRED_TOOLS: Explicit tool whitelist
4. MUST_DO: Exhaustive requirements — nothing implicit
5. MUST_NOT_DO: Forbidden actions — anticipate rogue behavior
6. CONTEXT: File paths, existing patterns, constraints

#### Session continuity

Every `task()` exposes a continuation session ID (`ses_...`). Follow-ups MUST use `task(task_id="ses_...")` to preserve context and save 70%+ tokens.

---

## 4. Other Notable Features

| Feature | Description | Adoption Priority |
|---|---|---|
| **Category-based routing** | Agents tagged with categories (`visual-engineering`, `ultrabrain`, `quick`, `writing`) that have their own model fallback chains. | Medium |
| **Per-agent compaction model** | `compaction: { model, variant }` lets heavy agents use a cheap model for context compaction. | High |
| **Keyword detector** | `ultrawork`, `search`, `analyze`, `team`, `hyperplan` trigger mode switches. | Medium |
| **Agent definitions from files** | `agent_definitions` config points to `.md` or `.json` files for custom agents. | Medium |
| **Category config** | `categories` block with model defaults that agents can inherit. | High |

---

## 5. Concrete Next Steps for Our Repo

1. **Add `SubAgentOverrides` config** in `packages/subagents` so definition names map to model overrides without code changes.
2. **Wire `config.model` into `session-factory.ts`** — remove the `model: undefined` TODO at line 73.
3. **Set defaults:** `planner` -> `kimi-k2.6`, `analyzer` -> `deepseek-chat`, `executor` -> strong coder model, `reviewer` -> high-reasoning model.
4. **Adopt the 6-section delegation prompt** in `PLANNER_BUILDER` to match their structured task brief.
5. **Consider a keyword detector** (e.g., `ultrawork`) that injects high-rigor instructions into the main session when detected.
