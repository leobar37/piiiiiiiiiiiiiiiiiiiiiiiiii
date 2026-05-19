# T4: Summarizer

## Goal
Read SessionManager branch, format recent messages as markdown summary.

## File: `src/summarizer.ts`

```typescript
export interface SummarizerOptions {
  maxMessages?: number   // default 20
  maxTurns?: number      // default 5
  includeTools?: boolean // default true
}

export class SubAgentSummarizer {
  summarize(sessionManager: SessionManager, options?: SummarizerOptions): ConversationSummary
}
```

## Implementation
1. Read `sessionManager.getBranch()` or `sessionManager.getEntries()`
2. Filter to message entries (type === "message")
3. Take last `maxMessages` entries, ensure at least `maxTurns` complete turns
4. Format as markdown:
   - User messages: quoted text
   - Assistant messages: content summary + tool calls
   - Tool results: `→ <toolName>: <status>`
5. Return structured `ConversationSummary`

No LLM call — purely formative operation.

## Validation
- Unit test with mock SessionManager entries
