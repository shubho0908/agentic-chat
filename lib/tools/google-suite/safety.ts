import { createHash, randomUUID } from 'crypto';
import { getPgPool } from '@/lib/rag/storage/pgvectorClient';
import { logError } from '@/lib/observability';
import { getToolDisplayName } from '@/utils/google/toolNames';

export interface GoogleWorkspacePlannedAction {
  toolName: string;
  args: unknown;
}

interface ApprovalOptions {
  userId?: string;
  now?: number;
}

interface ApprovalRecord {
  userId: string;
  planHash: string;
  expiresAt: number;
  consumedAt?: number;
}

export const DESTRUCTIVE_GOOGLE_WORKSPACE_TOOLS = new Set([
  'gmail_send',
  'gmail_reply',
  'gmail_delete',
  'gmail_modify',
  'drive_create_file',
  'drive_create_folder',
  'drive_delete',
  'drive_move',
  'drive_copy',
  'drive_share',
  'docs_create',
  'docs_append',
  'docs_replace',
  'calendar_create_event',
  'calendar_update_event',
  'calendar_delete_event',
  'sheets_create',
  'sheets_write',
  'sheets_append',
  'sheets_clear',
  'slides_create',
  'slides_add_slide',
]);

const APPROVAL_TOKEN_PREFIX = 'GOOGLE_WORKSPACE_APPROVAL:';
const APPROVAL_TTL_MS = 15 * 60 * 1000;

const inMemoryApprovals = new Map<string, ApprovalRecord>();
let approvalTableInitialized = false;
let approvalTablePromise: Promise<void> | null = null;

function shouldUseDurableApprovalStore(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function createPlanHash(actions: GoogleWorkspacePlannedAction[]): string {
  const normalizedActions = actions.map((action) => ({
    toolName: action.toolName,
    args: action.args,
  }));

  return createHash('sha256')
    .update(stableStringify(normalizedActions))
    .digest('hex');
}

async function ensureApprovalTable(): Promise<void> {
  if (!shouldUseDurableApprovalStore() || approvalTableInitialized) {
    return;
  }

  if (approvalTablePromise) {
    return approvalTablePromise;
  }

  approvalTablePromise = (async () => {
    const pool = getPgPool();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS google_workspace_approval (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        plan_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS google_workspace_approval_user_idx
      ON google_workspace_approval (user_id, expires_at DESC);
    `);

    approvalTableInitialized = true;
  })();

  return approvalTablePromise;
}

function cleanupExpiredInMemoryApprovals(now: number): void {
  for (const [approvalId, record] of inMemoryApprovals.entries()) {
    if (record.expiresAt < now || record.consumedAt) {
      inMemoryApprovals.delete(approvalId);
    }
  }
}

async function createApprovalRecord(
  approvalId: string,
  record: ApprovalRecord
): Promise<void> {
  if (!shouldUseDurableApprovalStore()) {
    cleanupExpiredInMemoryApprovals(record.expiresAt - APPROVAL_TTL_MS);
    inMemoryApprovals.set(approvalId, record);
    return;
  }

  await ensureApprovalTable();
  await getPgPool().query(
    `
      INSERT INTO google_workspace_approval (id, user_id, plan_hash, expires_at)
      VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))
    `,
    [approvalId, record.userId, record.planHash, record.expiresAt]
  );
}

async function consumeApprovalRecord(
  approvalId: string,
  expected: ApprovalRecord,
  now: number
): Promise<boolean> {
  if (!shouldUseDurableApprovalStore()) {
    cleanupExpiredInMemoryApprovals(now);
    const existing = inMemoryApprovals.get(approvalId);

    if (
      !existing ||
      existing.userId !== expected.userId ||
      existing.planHash !== expected.planHash ||
      existing.expiresAt < now ||
      existing.consumedAt
    ) {
      return false;
    }

    existing.consumedAt = now;
    inMemoryApprovals.set(approvalId, existing);
    return true;
  }

  await ensureApprovalTable();
  const result = await getPgPool().query(
    `
      UPDATE google_workspace_approval
      SET consumed_at = NOW()
      WHERE id = $1
        AND user_id = $2
        AND plan_hash = $3
        AND consumed_at IS NULL
        AND expires_at >= NOW()
      RETURNING id
    `,
    [approvalId, expected.userId, expected.planHash]
  );

  return (result.rowCount ?? 0) > 0;
}

function extractApprovalToken(query: string): string | null {
  const match = query.match(/GOOGLE_WORKSPACE_APPROVAL:([A-Za-z0-9-]+)/);
  return match?.[1] ?? null;
}

function summarizeArgs(args: unknown): string {
  if (!args || typeof args !== 'object') {
    return '';
  }

  const preferredKeys = [
    'to',
    'subject',
    'summary',
    'title',
    'email',
    'name',
    'fileId',
    'fileIds',
    'messageId',
    'messageIds',
    'documentId',
    'eventId',
    'spreadsheetId',
    'presentationId',
    'targetFolderId',
    'parentFolderId',
  ];
  const parts = preferredKeys.flatMap((key) => {
    if (!(key in (args as Record<string, unknown>))) {
      return [];
    }

    const value = (args as Record<string, unknown>)[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return [];
      }
      return [`${key}: ${trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed}`];
    }

    if (Array.isArray(value)) {
      const items = value
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim());

      if (items.length === 0) {
        return [];
      }

      const preview = items.slice(0, 3).join(', ');
      const suffix = items.length > 3 ? `, +${items.length - 3} more` : '';
      return [`${key}: [${preview}${suffix}]`];
    }

    return [];
  });

  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

function normalizeApprovalUserId(userId?: string): string {
  return userId?.trim() || 'anonymous';
}

export async function createGoogleWorkspaceApprovalReceipt(
  plannedActions: GoogleWorkspacePlannedAction[],
  options: ApprovalOptions = {}
): Promise<string> {
  const now = options.now ?? Date.now();
  const approvalId = randomUUID();

  await createApprovalRecord(approvalId, {
    userId: normalizeApprovalUserId(options.userId),
    planHash: createPlanHash(plannedActions),
    expiresAt: now + APPROVAL_TTL_MS,
  });

  return approvalId;
}

export async function hasExplicitGoogleWorkspaceApproval(
  query: string,
  plannedActions: GoogleWorkspacePlannedAction[],
  options: ApprovalOptions = {}
): Promise<boolean> {
  if (plannedActions.length === 0) {
    return true;
  }

  const token = extractApprovalToken(query);
  if (!token) {
    return false;
  }

  try {
    return await consumeApprovalRecord(
      token,
      {
        userId: normalizeApprovalUserId(options.userId),
        planHash: createPlanHash(plannedActions),
        expiresAt: options.now ?? Date.now() + APPROVAL_TTL_MS,
      },
      options.now ?? Date.now()
    );
  } catch (error) {
    logError({
      event: 'google_workspace_approval_consume_failed',
      userId: options.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function buildGoogleWorkspaceApprovalBarrierMessage(
  plannedActions: GoogleWorkspacePlannedAction[],
  options: ApprovalOptions = {}
): Promise<string> {
  const uniqueActions = plannedActions.filter(
    (action, index, actions) =>
      index === actions.findIndex(
        (candidate) =>
          candidate.toolName === action.toolName &&
          stableStringify(candidate.args) === stableStringify(action.args)
      )
  );

  try {
    const receipt = await createGoogleWorkspaceApprovalReceipt(uniqueActions, options);

    return [
      'Approval required before I make these Google Workspace changes.',
      '',
      'Planned actions:',
      ...uniqueActions.map(
        (action) => `- ${getToolDisplayName(action.toolName)}${summarizeArgs(action.args)}`
      ),
      '',
      'To approve this exact plan, reply with:',
      `${APPROVAL_TOKEN_PREFIX}${receipt}`,
      '',
      'This approval is stored server-side, is bound to your account, expires shortly, and can only be used once.',
    ].join('\n');
  } catch (error) {
    logError({
      event: 'google_workspace_approval_create_failed',
      userId: options.userId,
      error: error instanceof Error ? error.message : String(error),
    });

    return 'Approval storage is unavailable, so destructive Google Workspace actions are currently blocked.';
  }
}
