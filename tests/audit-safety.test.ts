import test from "node:test";
import assert from "node:assert/strict";

delete process.env.DATABASE_URL;
delete process.env.DIRECT_DATABASE_URL;

import { isPrivateAddress, isTrustedAttachmentUrl } from "@/lib/network/ssrf";
import { redactSharedConversation } from "@/lib/share/redaction";
import {
  buildGoogleWorkspaceApprovalBarrierMessage,
  hasExplicitGoogleWorkspaceApproval,
  DESTRUCTIVE_GOOGLE_WORKSPACE_TOOLS,
  createGoogleWorkspaceApprovalReceipt,
} from "@/lib/tools/google-suite/safety";
import {
  getAvailableGoogleWorkspaceTools,
  isGoogleWorkspaceToolAllowed,
} from "@/lib/tools/google-suite/toolAccess";
import { validateGoogleToolArgs } from "@/lib/tools/google-suite/toolSchemas";
import {
  validateRequestedModel,
  getStageModel,
  getSupportedTemperature,
} from "@/lib/modelPolicy";
import { getRequiredEnv } from "@/lib/env";
import { setObservabilityLogSinkForTests } from "@/lib/observability";
import { injectContextToMessages } from "@/lib/chat/messageHelpers";
import { shouldPersistConversationMemory } from "@/lib/chat/memoryPolicy";
import {
  buildMemoryLookupQueries,
  mediateMemoryIntent,
} from "@/lib/chat/requestMediator";
import {
  GOOGLE_SCOPES,
  GOOGLE_SIGN_IN_SCOPES,
  resolveGoogleWorkspaceScopesForRequest,
} from "@/lib/tools/google-suite/scopes";
import { shouldRetryOrFormat } from "@/lib/tools/deep-research/graph";
import { DEEP_RESEARCH_MAX_ATTEMPTS } from "@/lib/tools/deep-research/constants";
import { getNextPendingTaskIndex } from "@/lib/tools/deep-research/nodes/worker";
import {
  uploadResponsesToAttachments,
  filterDocumentAttachments,
  filterImageAttachments,
} from "@/lib/attachmentUtils";
import { isSupportedForRAG } from "@/lib/rag/utils";
import {
  createRequestId,
  isObservabilityLoggingEnabled,
  logInfo,
  measureLatencyMs,
} from "@/lib/observability";
import {
  calculateTokenUsage,
  countTextTokens,
  truncateTextToTokenLimit,
} from "@/lib/utils/tokenCounter";
import {
  computeNextRetryAt,
  computeRetryBackoffMs,
  isLeaseExpired,
  isRetryableDocumentError,
  shouldRetryJob,
} from "@/lib/orchestration/retryPolicy";
import {
  computeAdaptiveSimilarityThreshold,
  diversifyCandidates,
  extractQueryTerms,
} from "@/lib/rag/retrieval/hybrid";

test("SSRF guard rejects private network addresses", () => {
  assert.equal(isPrivateAddress("127.0.0.1"), true);
  assert.equal(isPrivateAddress("10.0.0.8"), true);
  assert.equal(isPrivateAddress("192.168.1.10"), true);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
});

test("attachment validator trusts uploaded storage hosts only", () => {
  assert.equal(isTrustedAttachmentUrl("https://demo.ufs.sh/f/safe-file"), true);
  assert.equal(isTrustedAttachmentUrl("https://utfs.io/f/safe-file"), true);
  assert.equal(
    isTrustedAttachmentUrl("https://169.254.169.254/latest/meta-data"),
    false,
  );
  assert.equal(
    isTrustedAttachmentUrl("https://internal.example.com/file.pdf"),
    false,
  );
});

test("shared conversation redaction removes metadata and attachments", () => {
  const redacted = redactSharedConversation({
    id: "conv_1",
    title: "Shared",
    isPublic: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    messages: [
      {
        id: "msg_1",
        role: "ASSISTANT",
        content: "hello",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        siblingIndex: 0,
        versions: [
          {
            id: "ver_1",
            role: "ASSISTANT",
            content: "older",
            createdAt: new Date("2026-01-01T00:00:00Z"),
            siblingIndex: 0,
          },
        ],
      },
    ],
  });

  assert.equal(redacted.messages[0].metadata, undefined);
  assert.deepEqual(redacted.messages[0].attachments, []);
  assert.deepEqual(redacted.messages[0].versions[0].attachments, []);
});

test("google workspace destructive actions require explicit approval", async () => {
  assert.equal(DESTRUCTIVE_GOOGLE_WORKSPACE_TOOLS.has("gmail_send"), true);
  const destructivePlan = [
    {
      toolName: "gmail_send",
      args: {
        to: "person@example.com",
        subject: "Hello",
        body: "World",
      },
    },
  ];
  const approvalToken = await createGoogleWorkspaceApprovalReceipt(
    destructivePlan,
    {
      userId: "user_1",
    },
  );

  assert.equal(
    await hasExplicitGoogleWorkspaceApproval(
      "send the email now",
      destructivePlan,
      { userId: "user_1" },
    ),
    false,
  );
  assert.equal(
    await hasExplicitGoogleWorkspaceApproval(
      `Please continue with GOOGLE_WORKSPACE_APPROVAL:${approvalToken}`,
      destructivePlan,
      { userId: "user_1" },
    ),
    true,
  );
  assert.equal(
    await hasExplicitGoogleWorkspaceApproval(
      `Please continue with GOOGLE_WORKSPACE_APPROVAL:${approvalToken}`,
      [
        {
          toolName: "gmail_send",
          args: {
            to: "other@example.com",
            subject: "Hello",
            body: "World",
          },
        },
      ],
      { userId: "user_1" },
    ),
    false,
  );
  assert.equal(
    await hasExplicitGoogleWorkspaceApproval(
      `Please continue with GOOGLE_WORKSPACE_APPROVAL:${approvalToken}`,
      destructivePlan,
      { userId: "user_1" },
    ),
    false,
  );
  assert.equal(
    await hasExplicitGoogleWorkspaceApproval(
      `Please continue with GOOGLE_WORKSPACE_APPROVAL:${approvalToken}`,
      destructivePlan,
      { userId: "user_2" },
    ),
    false,
  );
  assert.match(
    await buildGoogleWorkspaceApprovalBarrierMessage(
      [
        {
          toolName: "gmail_send",
          args: { to: "person@example.com", subject: "Hello", body: "World" },
        },
        {
          toolName: "drive_share",
          args: { fileId: "file_123", email: "person@example.com" },
        },
      ],
      { userId: "user_1" },
    ),
    /Approval required/,
  );
});

test("google workspace only exposes tools allowed by granted scopes", () => {
  const gmailReadTools = getAvailableGoogleWorkspaceTools([
    GOOGLE_SCOPES.GMAIL_READONLY,
  ]);
  const toolNames = gmailReadTools
    .filter((tool) => tool.type === "function")
    .map((tool) => tool.function.name);

  assert.equal(toolNames.includes("gmail_read"), true);
  assert.equal(toolNames.includes("gmail_send"), false);
  assert.equal(toolNames.includes("drive_read_file"), false);
});

test("google workspace narrows exposed tools to request-relevant services when known", () => {
  const driveTools = getAvailableGoogleWorkspaceTools(
    [GOOGLE_SCOPES.DRIVE, GOOGLE_SCOPES.DOCS],
    [GOOGLE_SCOPES.DRIVE],
  );
  const toolNames = driveTools
    .filter((tool) => tool.type === "function")
    .map((tool) => tool.function.name);

  assert.equal(toolNames.includes("drive_search"), true);
  assert.equal(toolNames.includes("docs_create"), false);
});

test("google workspace denies tools without explicit scope mappings", () => {
  assert.equal(
    isGoogleWorkspaceToolAllowed("unknown_google_tool", [GOOGLE_SCOPES.DRIVE]),
    false,
  );
});

test("google workspace schema rejects invalid time zones and allows blank sheet cells", () => {
  assert.throws(
    () =>
      validateGoogleToolArgs("calendar_create_event", {
        summary: "Planning",
        startTime: "2026-01-20T09:00:00Z",
        endTime: "2026-01-20T10:00:00Z",
        timeZone: "Mars/Olympus",
      }),
    /Invalid IANA time zone/,
  );

  const writeArgs = validateGoogleToolArgs("sheets_write", {
    spreadsheetId: "sheet_123",
    range: "Sheet1!A1:B1",
    values: [["hello", ""]],
  });

  assert.deepEqual((writeArgs as { values: string[][] }).values, [
    ["hello", ""],
  ]);
});

test("google workspace keeps Drive discovery tools for Docs-family requests", () => {
  const tools = getAvailableGoogleWorkspaceTools(
    [GOOGLE_SCOPES.DRIVE, GOOGLE_SCOPES.DOCS],
    [GOOGLE_SCOPES.DOCS],
  );
  const toolNames = tools
    .filter((tool) => tool.type === "function")
    .map((tool) => tool.function.name);

  assert.equal(toolNames.includes("docs_create"), true);
  assert.equal(toolNames.includes("drive_search"), true);
});

test("google workspace tool args are validated at dispatch time", () => {
  assert.throws(
    () =>
      validateGoogleToolArgs("gmail_send", {
        to: "person@example.com",
        subject: "Hi",
        body: "Hello",
        unexpected: true,
      }),
    /unrecognized key/i,
  );
});

test("google workspace follows conversation context for ambiguous follow-up requests", () => {
  const resolution = resolveGoogleWorkspaceScopesForRequest(
    "share links of them",
    ["do I have any resume in drive?"],
  );

  assert.equal(resolution.source, "context");
  assert.equal(resolution.requiredScopes.includes(GOOGLE_SCOPES.DRIVE), true);
});

test("google workspace does not escalate unknown follow-ups to every app scope", () => {
  const resolution = resolveGoogleWorkspaceScopesForRequest(
    "share links of them",
  );

  assert.equal(resolution.source, "unknown");
  assert.deepEqual(resolution.requiredScopes, GOOGLE_SIGN_IN_SCOPES);
});

test("google workspace approval barrier includes batch item identifiers", async () => {
  const message = await buildGoogleWorkspaceApprovalBarrierMessage(
    [
      {
        toolName: "drive_delete",
        args: { fileIds: ["file-1", "file-2", "file-3", "file-4"] },
      },
    ],
    {
      userId: "user_1",
    },
  );

  assert.match(message, /fileIds: \[file-1, file-2, file-3, \+1 more\]/);
});

test("deep research exhaustion now formats instead of terminating empty", () => {
  const nextNode = shouldRetryOrFormat({
    evaluationResult: {
      meetsStandards: false,
      confidenceScore: 0.2,
      weaknesses: ["missing citations"],
    },
    currentAttempt: DEEP_RESEARCH_MAX_ATTEMPTS,
  } as never);

  assert.equal(nextNode, "formatter");
});

test("deep research worker retries resume from the next pending task", () => {
  assert.equal(
    getNextPendingTaskIndex([
      {
        id: "1",
        question: "done",
        tools: ["web_search"],
        status: "completed",
        retries: 0,
      },
      {
        id: "2",
        question: "retry",
        tools: ["web_search"],
        status: "pending",
        retries: 1,
      },
      {
        id: "3",
        question: "later",
        tools: ["web_search"],
        status: "pending",
        retries: 0,
      },
    ]),
    1,
  );

  assert.equal(
    getNextPendingTaskIndex([
      {
        id: "1",
        question: "done",
        tools: ["web_search"],
        status: "completed",
        retries: 0,
      },
      {
        id: "2",
        question: "failed",
        tools: ["web_search"],
        status: "failed",
        retries: 2,
      },
    ]),
    2,
  );
});

test("orchestration retry policy uses bounded exponential backoff", () => {
  assert.equal(computeRetryBackoffMs(1), 2000);
  assert.equal(computeRetryBackoffMs(2), 4000);
  assert.equal(computeRetryBackoffMs(8), 60000);
});

test("orchestration retry decision respects retryability and max attempts", () => {
  assert.equal(
    shouldRetryJob({ attempts: 1, maxAttempts: 3, retryable: true }),
    true,
  );
  assert.equal(
    shouldRetryJob({ attempts: 3, maxAttempts: 3, retryable: true }),
    false,
  );
  assert.equal(
    shouldRetryJob({ attempts: 1, maxAttempts: 3, retryable: false }),
    false,
  );
});

test("orchestration next retry timestamp is deterministic from now + backoff", () => {
  const next = computeNextRetryAt(2, Date.parse("2026-01-01T00:00:00.000Z"));
  assert.equal(next.toISOString(), "2026-01-01T00:00:04.000Z");
});

test("orchestration lease expiration helper handles null and stale leases", () => {
  const now = Date.parse("2026-01-01T00:00:10.000Z");
  assert.equal(isLeaseExpired(null, now), false);
  assert.equal(isLeaseExpired("2026-01-01T00:00:11.000Z", now), false);
  assert.equal(isLeaseExpired("2026-01-01T00:00:09.999Z", now), true);
});

test("document error retryability keeps permanent failures out of retry loop", () => {
  assert.equal(
    isRetryableDocumentError("Unsupported file type for RAG: image/png"),
    false,
  );
  assert.equal(isRetryableDocumentError("Unauthorized"), false);
  assert.equal(isRetryableDocumentError("Attachment not found"), false);
  assert.equal(
    isRetryableDocumentError("Request timeout - upstream unavailable"),
    true,
  );
});

test("server model policy rejects unknown models and downshifts orchestration stages", () => {
  assert.equal(validateRequestedModel("gpt-5.4"), "gpt-5.4");
  assert.equal(validateRequestedModel("not-a-real-model"), null);
  assert.equal(getStageModel("gpt-5.4", "research_gate"), "gpt-5.4-nano");
  assert.equal(getStageModel("gpt-5.4", "research_formatter"), "gpt-5.4-mini");
  assert.equal(getSupportedTemperature("gpt-5.4", 0.1), undefined);
  assert.equal(getSupportedTemperature("gpt-5-mini", 0), undefined);
  assert.equal(getSupportedTemperature("gpt-4.1", 0.1), 0.1);
});

test("token counter includes reserve in percentage and bounds suffix-only truncation", () => {
  const truncated = truncateTextToTokenLimit(
    "alpha beta gamma",
    "gpt-5-mini",
    2,
    "very long suffix",
  );
  assert.equal(countTextTokens(truncated, "gpt-5-mini") <= 2, true);

  const usage = calculateTokenUsage(
    [{ role: "user", content: "hello world" }],
    "gpt-5-mini",
  );
  assert.equal(usage.percentage <= 100, true);
  assert.equal(usage.remaining >= 0, true);
});

test("untrusted context is no longer injected into the system role", () => {
  const messages = injectContextToMessages(
    [
      { role: "system", content: "System rules" },
      { role: "user", content: "Question" },
    ],
    "Untrusted tool output",
  );

  assert.equal(messages[0].role, "system");
  assert.match(String(messages[1].content), /reference_context/);
  assert.equal(messages[2].role, "user");
});

test("upload attachments infer a document MIME type from filename when upload metadata is missing", () => {
  const [attachment] = uploadResponsesToAttachments([
    {
      url: "https://demo.ufs.sh/f/resume",
      name: "resume.pdf",
      size: 1234,
    },
  ]);

  assert.equal(attachment.fileType, "application/pdf");
  assert.equal(isSupportedForRAG(attachment.fileType), true);
});

test("attachment classification keeps document files out of the image path", () => {
  const attachments = uploadResponsesToAttachments([
    {
      url: "https://demo.ufs.sh/f/resume",
      name: "resume.pdf",
      size: 1234,
    },
    {
      url: "https://demo.ufs.sh/f/photo",
      name: "photo.png",
      size: 5678,
      type: "image/png",
    },
  ]);

  assert.equal(
    filterDocumentAttachments(attachments)
      .map((file) => file.fileName)
      .includes("resume.pdf"),
    true,
  );
  assert.equal(
    filterImageAttachments(attachments)
      .map((file) => file.fileName)
      .includes("resume.pdf"),
    false,
  );
  assert.equal(
    filterImageAttachments(attachments)
      .map((file) => file.fileName)
      .includes("photo.png"),
    true,
  );
});

test("explicit recall prompts always trigger memory mediation without AI fallback", async () => {
  await assert.doesNotReject(async () => {
    const rememberDecision = await mediateMemoryIntent({
      messageText: "hey buddy, u remember me?",
    });
    const nameDecision = await mediateMemoryIntent({
      messageText: "do u know my name?",
    });
    const projectDecision = await mediateMemoryIntent({
      messageText: "what's my latest project?",
    });

    assert.equal(rememberDecision.shouldQuery, true);
    assert.equal(nameDecision.shouldQuery, true);
    assert.equal(projectDecision.shouldQuery, true);
  });
});

test("conversation recap prompts also trigger memory mediation", async () => {
  const askedTodayDecision = await mediateMemoryIntent({
    messageText: "what did i ask u today?",
  });
  const talkedBeforeDecision = await mediateMemoryIntent({
    messageText: "have we talked before?",
  });
  const mentionDecision = await mediateMemoryIntent({
    messageText: "did i mention my startup to you earlier?",
  });

  assert.equal(askedTodayDecision.shouldQuery, true);
  assert.equal(talkedBeforeDecision.shouldQuery, true);
  assert.equal(mentionDecision.shouldQuery, true);
});

test("memory lookup queries expand identity questions into targeted recall searches", () => {
  const queries = buildMemoryLookupQueries(
    "do u know my name?",
    "user: My name is Shubho\nassistant: Nice to meet you, Shubho.",
  );

  assert.match(queries[0], /do you know my name/i);
  assert.ok(
    queries.some((query) =>
      /preferred name|nickname|what assistant should call user/i.test(query),
    ),
  );
  assert.ok(queries.some((query) => /recent conversation recap/i.test(query)));
});

test("memory lookup queries expand recap questions into recent-conversation searches", () => {
  const queries = buildMemoryLookupQueries(
    "what did i ask u today?",
    "user: Help me plan interviews.\nassistant: Sure, let us structure them.",
  );

  assert.match(queries[0], /what did i ask you today/i);
  assert.ok(
    queries.some((query) =>
      /prior questions requests and facts|previous chats/i.test(query),
    ),
  );
  assert.ok(queries.some((query) => /recent conversation recap/i.test(query)));
});

test("personal identity facts remain eligible for memory persistence", () => {
  const shouldPersist = shouldPersistConversationMemory({
    userMessage: "My name is Shubho and I am building an agentic chat app.",
    assistantMessage:
      "Nice to meet you, Shubho. I will remember that you are building an agentic chat app.",
  });

  assert.equal(shouldPersist, true);
});

test("observability request IDs preserve the provided prefix", () => {
  const requestId = createRequestId("upload");
  assert.match(requestId, /^upload_/);
});

test("observability latency helper never returns negative durations", () => {
  assert.equal(measureLatencyMs(1000, 1500), 500);
  assert.equal(measureLatencyMs(1500, 1000), 0);
});

test("observability logger is enabled only in development", () => {
  assert.equal(isObservabilityLoggingEnabled("production"), false);
  assert.equal(isObservabilityLoggingEnabled("test"), false);
  assert.equal(isObservabilityLoggingEnabled("development"), true);

  const writes: string[] = [];
  setObservabilityLogSinkForTests((_level, serialized) => {
    writes.push(serialized);
  });

  try {
    logInfo({ event: "prod_should_not_log" }, "production");
    assert.equal(writes.length, 0);

    logInfo({ event: "dev_should_log" }, "development");
    assert.equal(writes.length, 1);
    assert.match(writes[0], /dev_should_log/);
  } finally {
    setObservabilityLogSinkForTests(null);
  }
});

test("environment warnings stay silent outside development", () => {
  const originalEnv = process.env.NODE_ENV;
  const env = process.env as Record<string, string | undefined>;
  const writes: string[] = [];
  setObservabilityLogSinkForTests((_level, serialized) => {
    writes.push(serialized);
  });

  try {
    env.NODE_ENV = "production";
    assert.equal(
      getRequiredEnv("TEST_ENV_ONLY_PROD", {
        fallback: "prod-fallback",
        description: "Test env only production",
      }),
      "prod-fallback",
    );
    assert.equal(writes.length, 0);

    env.NODE_ENV = "development";
    assert.equal(
      getRequiredEnv("TEST_ENV_ONLY_DEV", {
        fallback: "dev-fallback",
        description: "Test env only development",
      }),
      "dev-fallback",
    );
    assert.equal(writes.length, 1);
    assert.match(writes[0], /Test env only development/);
  } finally {
    if (originalEnv === undefined) {
      delete env.NODE_ENV;
    } else {
      env.NODE_ENV = originalEnv;
    }
    setObservabilityLogSinkForTests(null);
  }
});

test("hybrid retrieval query terms remove stop words and short tokens", () => {
  const terms = extractQueryTerms(
    "What are the Q4 revenue trends for ACME and how did EBITDA change in 2025?",
    8,
  );

  assert.deepEqual(terms, [
    "q4",
    "revenue",
    "trends",
    "acme",
    "did",
    "ebitda",
    "change",
    "2025",
  ]);
});

test("hybrid retrieval adaptive threshold relaxes when semantic pool is sparse", () => {
  const denseThreshold = computeAdaptiveSimilarityThreshold({
    baseThreshold: 0.7,
    minThreshold: 0.35,
    candidateCount: 20,
    limit: 5,
  });
  const sparseThreshold = computeAdaptiveSimilarityThreshold({
    baseThreshold: 0.7,
    minThreshold: 0.35,
    candidateCount: 2,
    limit: 6,
  });

  assert.equal(denseThreshold, 0.7);
  assert.ok(sparseThreshold < denseThreshold);
  assert.ok(sparseThreshold >= 0.35);
});

test("hybrid retrieval diversification preserves attachment coverage and caps dominance", () => {
  const candidates = [
    {
      content: "A-1",
      score: 0.98,
      metadata: { attachmentId: "A", fileName: "alpha.pdf", page: 1 },
    },
    {
      content: "A-2",
      score: 0.96,
      metadata: { attachmentId: "A", fileName: "alpha.pdf", page: 2 },
    },
    {
      content: "A-3",
      score: 0.94,
      metadata: { attachmentId: "A", fileName: "alpha.pdf", page: 3 },
    },
    {
      content: "B-1",
      score: 0.78,
      metadata: { attachmentId: "B", fileName: "beta.pdf", page: 1 },
    },
    {
      content: "C-1",
      score: 0.72,
      metadata: { attachmentId: "C", fileName: "gamma.pdf", page: 1 },
    },
  ];

  const diversified = diversifyCandidates(candidates, {
    limit: 4,
    maxPerAttachment: 2,
    minPerAttachment: 1,
  });

  assert.equal(diversified.length, 4);
  assert.equal(
    diversified.filter((item) => item.metadata.attachmentId === "A").length,
    2,
  );
  assert.ok(diversified.some((item) => item.metadata.attachmentId === "B"));
  assert.ok(diversified.some((item) => item.metadata.attachmentId === "C"));
});
