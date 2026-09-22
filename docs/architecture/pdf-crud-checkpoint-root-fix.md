# PDF CRUD and Conversation Checkpoint Root-Fix Architecture

Status: implementation design for `fix/checkpoint-history-root-fixes`
Base: fresh `origin/feat/jev` (remote had no `feat/dev` branch)
Scope: PDF create/edit continuity, conversation branching, context bounds, planner tool availability, and production diagnostics.

## Problem statement

The browser currently sends a visible history window on every turn while LangGraph also persists message state in Postgres. Incoming messages are reconstructed without stable IDs, so LangGraph's `add_messages` reducer cannot recognize messages it already owns. It appends another copy of the client window on every turn. Large `create_pdf` tool-call arguments are therefore replayed, context grows quadratically, the HTTP-side token check measures the wrong list, and eventually the model request fails.

A second failure is independent but compounds this one: planner `DIRECT` classification causes the agent node to bind zero tools. Short edit instructions such as "make the title blue" can therefore lose `create_pdf`. The planner only sees the latest text despite a prompt that assumes conversational context, and malformed planner output defaults to `DIRECT`, the least safe fallback for tool continuity.

Finally, edits and regenerations change the visible message-tree branch in Postgres but reuse `conv-<conversationId>` in LangGraph. Even after normal turns become incremental, a regenerated response could continue from stale checkpoint state belonging to the old branch.

## Invariants

1. A persisted message has one stable identity in the client, API, LangGraph reducer, and checkpoint.
2. After a checkpoint exists, a normal turn submits only the new human message plus server-injected context for that turn. The checkpoint is the history authority.
3. Editing or regenerating forks graph state. It must never append a replacement branch to the original thread.
4. The exact list sent to the model is bounded and budget-checked after system-prompt construction.
5. Trimming never leaves an AI tool call without its matching `ToolMessage`, or a `ToolMessage` without its caller.
6. A pending PDF edit keeps the latest complete `create_pdf` call/result pair that contains the source specification.
7. A follow-up turn never loses tools merely because the planner labels it `DIRECT` or parsing fails.
8. Every orchestrated request has an owned conversation ID. There is no user-wide shared ephemeral checkpoint.

## Request and thread identity

The request gains an optional `branchId`, supplied by edit/regenerate flows from the branch point's stable persisted message ID. Thread IDs are derived as:

- normal branch: `conv-<conversationId>`
- edited/regenerated branch: `conv:<conversationId>:branch:<branchId>`

IDs are encoded before use, and the API verifies conversation ownership before graph execution. First-party orchestrated requests require `conversationId`; callers that cannot persist a conversation must use the non-orchestrated stateless path rather than sharing `user-<id>-ephemeral`.

Normal sends include stable message IDs. `buildMessagesForAPI` preserves IDs for history and accepts the new persisted user message ID. The API-to-LangChain conversion assigns that ID to `HumanMessage`, `AIMessage`, and `SystemMessage`.

## Checkpoint-as-source-of-truth input

Before graph invocation the server asks the compiled graph for the selected thread's state. Messages without client IDs receive deterministic content IDs as a compatibility fallback; first-party calls send persisted IDs.

- Empty checkpoint: seed it with the client bootstrap history. This supports an existing conversation whose graph state has not yet been created.
- Existing checkpoint: compare incoming stable IDs with checkpoint IDs and pass only messages not already stored. For the first-party path this is normally the new human message.
- Branch thread: seed the new thread with the visible branch history and then continue incrementally on that branch.

This design deliberately combines stable-ID dedupe with incremental input. Stable IDs make retries idempotent. Incremental input removes repeated serialization and prevents replay even if a caller sends a wider window.

## Context construction, trimming, and budget enforcement

A dedicated model-context builder runs inside the agent node, after it builds the real system prompt and reconciles dangling calls.

1. Group conversation messages into atomic units. An AI message with tool calls and all immediately associated `ToolMessage`s form one unit.
2. Mark the newest complete `create_pdf` call/result unit as protected when the current user turn is a PDF follow-up/edit.
3. Walk units newest-first under the model input budget, reserving response tokens and always retaining the latest human turn.
4. Add a protected PDF unit even if older, then drop less recent ordinary units to compensate.
5. Reject explicitly if the system prompt + latest user turn + one protected PDF unit cannot fit. Never silently split or truncate JSON tool arguments.
6. Run `checkTokenBudget` against this final `[system, ...trimmed]` list immediately before `llm.invoke`.

The outer API's early check remains only a cheap abuse guard. It is not the authoritative context check.

## Planner behavior

The planner receives a compact transcript of the last several human/assistant turns, not only the latest string. Planner parse or schema failure produces a conservative `TOOL_NEEDED` fallback with tools selected from deterministic intent signals; it does not become `DIRECT`.

`DIRECT` is a planning hint, not permission to unbind all tools. The agent always runs the normal deterministic tool selector. In particular, PDF edit language and prior `create_pdf` state keep `create_pdf` available. This removes the zero-tool short circuit while avoiding an indiscriminate all-tools bind.

## Observability

Structured events include request ID, conversation ID, derived thread ID, branch ID, checkpoint-present flag, incoming/stored/model message counts, estimated input tokens, trim count, protected PDF-pair count, planner fallback reason, and SSE terminal error category. Content and PDF specifications are never logged.

`ORCHESTRATOR_VERBOSE_LOGGING=true` enables scoped production breadcrumbs. Warnings and errors remain on regardless. Budget rejections log a warning before emitting the HTTP-200 SSE error event. Stream failures emit one structured terminal event before closing.

## Lifecycle and deletion

Follow-up work: conversation deletion must also delete all checkpoint namespaces beginning with that conversation's encoded prefix. This requires an explicit checkpointer cleanup operation rather than relying on retention. It is documented separately because the root fixes in this change do not claim to solve checkpoint retention.

Generated PDFs remain append-only artifacts. Editing produces a new version and never mutates an uploaded or generated PDF in place. Artifact deletion/quota/indexing are separate storage lifecycle work and are not disguised as checkpoint fixes.

## Verification strategy

The repeatable integration suite uses the real compiled LangGraph state reducer and a real Postgres `PostgresSaver`, with deterministic fake planner/model/tool nodes so it tests persistence and wiring without spending OpenAI tokens.

It runs:

1. create -> edit -> edit -> edit on one thread; checkpoint IDs stay unique and history grows only by genuinely new messages;
2. oversized PDF specifications across turns; the final model context stays bounded and only the protected latest spec is retained;
3. planner `DIRECT` and malformed planner output; `create_pdf` remains selectable on edit turns;
4. early-message edit/regenerate; a derived branch thread answers from branch history and the original checkpoint is unchanged;
5. retry with the same stable ID; checkpoint count does not increase;
6. tool-pair trimming; no orphan call/result is emitted;
7. missing `conversationId`; orchestrated first-party request is rejected before checkpoint access;
8. SSE budget rejection and model failure; structured warning/error events are emitted.

Where a real external dependency is unavailable, the test must fail or explicitly report `SKIP` with the missing requirement. A mock-only green is not presented as end-to-end proof.

## Rollout

The production `conv-<conversationId>` root namespace is unchanged, so existing checkpoints and historical tool-call state remain readable. The new branch metadata column is additive. Deploy the database migration before the application version; rollback can ignore the nullable column without stranding checkpoints.
