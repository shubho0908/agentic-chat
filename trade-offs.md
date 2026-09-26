# Trade-offs - Agentic Chat

Stack: Next.js / React / Postgres (Neon) / LangGraph / OpenAI / mem0 / UploadThing / Better-Auth / Vercel.

## 0. Backend runs fully on Vercel

- **Choice:** API and AI agent and file processing and PDF generation and background jobs all run as Vercel serverless functions.
- **Cost:** No long running workers. 5 min execution cap. Upload size limits. DB connections spike under load.
- **Gain:** One repo. One deploy. Free preview link per branch. No second server to manage.

## 1. Background jobs via DB and daily cron

- **Choice:** Jobs stored in Postgres and processed once a day by a scheduled function.
- **Cost:** Slow for urgent jobs. No proper retry queue.
- **Gain:** No extra service to pay for or operate.

## 2. In-memory rate limiting

- **Choice:** Request counts kept in the function memory itself.
- **Cost:** Breaks across multiple server instances.
- **Gain:** Free and instant. Works fine while all users are logged in.

## 3. One Postgres for everything

- **Choice:** Chats and files and search vectors and cached answers all in the same database.
- **Cost:** Search cannot scale alone. Changing embedding size later means rewriting tables.
- **Gain:** One backup. One connection. No syncing between databases.

## 4. LangGraph for the agent

- **Choice:** Multi step planner plus agent plus tools loop with saved checkpoints instead of a single AI call.
- **Cost:** Heavier and harder to debug.
- **Gain:** Agent can pause for user approval and resume later even after a restart.

## 5. Custom streaming and no AI SDK

- **Choice:** Own streaming format and chat hook instead of Vercel AI SDK.
- **Cost:** We maintain the protocol ourselves.
- **Gain:** One stream carries text and thinking and tool updates and files and approval prompts together.

## 6. Hybrid search for documents

- **Choice:** Keyword plus vector search combined with an optional reranker.
- **Cost:** Slower and more tuning.
- **Gain:** Finds documents plain vector search misses. Still works when reranker is off.

## 7. External memory with mem0

- **Choice:** Long term memory via mem0 service with a timeout.
- **Cost:** Another vendor and small added latency.
- **Gain:** Remembers users across chats. Chat never hangs if memory is slow.

## 8. UploadThing for files

- **Choice:** Uploads go to UploadThing and not through our server.
- **Cost:** Vendor lock in.
- **Gain:** Big files never hit server size limits. No CDN or virus scan code to own.

## 9. Self-hosted auth

- **Choice:** Better-Auth with Google login and sessions in our DB.
- **Cost:** We own session and security upkeep. No built in MFA.
- **Gain:** Free with no per user bill.

## 10. User API keys (BYOK)

- **Choice:** Keys stored encrypted and decrypted per request with clients cached in memory.
- **Cost:** Keys sit in server memory with no central key audit.
- **Gain:** No added latency on the streaming path.

## 11. API routes over Server Actions

- **Choice:** Standard API endpoints instead of Next.js Server Actions.
- **Cost:** More round trips for simple CRUD.
- **Gain:** Full control over streaming and downloads and public share links.

## 12. Simple client state

- **Choice:** React Query for server data plus local state for messages. No global store.
- **Cost:** Manual handling of optimistic edits.
- **Gain:** No refetch storms and easy to reason about.

## 13. Server rendered PDFs

- **Choice:** PDFs built on the server two at a time and stored and shared as links.
- **Cost:** Server bottleneck under burst load.
- **Gain:** Consistent branded PDFs with preview and download. Browser print cannot do that.

## 14. Optional services fail open

- **Choice:** Search and scrape and rerank and integrations degrade gracefully when keys are missing.
- **Cost:** Harder to test every combination.
- **Gain:** App boots and demos fine with just DB plus auth plus OpenAI.

## 15. Single region

- **Choice:** Heavy functions fixed in one US region near the database.
- **Cost:** Slower for EU and Asia users with no failover.
- **Gain:** Fastest database queries where it matters most.

## 16. Complete-document context capped at 40 chunks

- **Choice:** Full indexed text is assembled only when the selected documents fit `MAX_FULL_CONTEXT_CHUNKS = 40` and `MAX_FULL_CONTEXT_CHARS = 88_000` (lib/rag/retrieval/fullContext.ts), and it must still fit the per-turn token budget (`getContextBudgetTokens(messages, model) - 2000`, lib/contextRouter.ts). Summarize and compare queries (`needsCompleteText`, lib/contextRouter.ts) get no partial-retrieval fallback past the cap: the request refuses instead of answering from chunks that cover only part of the document.
- **Cost:** Whole-document summarize and compare are unavailable past the cap; the user gets a refusal. The refusal text ("please retry or reattach it") is known-misleading for this deterministic case, since retrying and reattaching change nothing.
- **Gain:** Context size stays bounded and predictable: no API overflow errors, no lost-in-the-middle quality loss from oversized windows, stable cost and latency per turn. Q&A retrieval is unaffected; targeted questions still answer from retrieved chunks with citations.

## Revisit first under load

1. Real job worker. 2. Shared rate limiter. 3. Embedding size lock in.
