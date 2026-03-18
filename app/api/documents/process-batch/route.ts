import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { getAuthenticatedUser, jsonResponse, errorResponse } from '@/lib/apiUtils';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { prisma } from '@/lib/prisma';
import { runOrQueueDocumentProcessingJob } from '@/lib/orchestration/documentJobs';

const ProcessBatchSchema = z.object({
  attachmentIds: z.array(z.string().min(1)).min(1).max(5),
});

interface BatchResult {
  attachmentId: string;
  jobId?: string;
  queued?: boolean;
  success: boolean;
  error?: string;
  stats?: {
    chunks: number;
    tokens: number;
  };
}

export async function POST(req: NextRequest) {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const requestBody = await req.json();
    const parsedBody = ProcessBatchSchema.safeParse(requestBody);

    if (!parsedBody.success) {
      return jsonResponse(
        { error: API_ERROR_MESSAGES.INVALID_REQUEST_BODY, details: parsedBody.error.issues },
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const { attachmentIds } = parsedBody.data;

    const attachments = await prisma.attachment.findMany({
      where: { id: { in: attachmentIds } },
      include: {
        message: {
          include: {
            conversation: {
              select: { userId: true },
            },
          },
        },
      },
    });

    if (attachments.length === 0) {
      return jsonResponse(
        { error: 'No attachments found' },
        HTTP_STATUS.NOT_FOUND
      );
    }

    const unauthorizedAttachments = attachments.filter(
      att => att.message.conversation.userId !== user.id
    );

    if (unauthorizedAttachments.length > 0) {
      return jsonResponse(
        { error: 'Unauthorized access to some attachments' },
        HTTP_STATUS.FORBIDDEN
      );
    }

    const results = await Promise.allSettled(
      attachmentIds.map((id) => runOrQueueDocumentProcessingJob(id, user.id))
    );

    const batchResults: BatchResult[] = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return {
          attachmentId: attachmentIds[index],
          jobId: result.value.jobId,
          queued: result.value.queued,
          success: result.value.queued ? true : Boolean(result.value.success),
          error: result.value.error,
          stats: result.value.stats,
        };
      }

      return {
        attachmentId: attachmentIds[index],
        success: false,
        error: result.reason?.message || 'Processing failed',
      };
    });

    const successCount = batchResults.filter(r => r.success).length;
    const failureCount = batchResults.filter(r => !r.success).length;
    const queuedCount = batchResults.filter(r => r.queued).length;

    return jsonResponse({
      success: failureCount === 0,
      message: `Processed ${successCount - queuedCount} documents successfully${queuedCount > 0 ? `, queued ${queuedCount}` : ''}${failureCount > 0 ? `, ${failureCount} failed` : ''}`,
      results: batchResults,
      summary: {
        total: attachmentIds.length,
        successful: successCount - queuedCount,
        queued: queuedCount,
        failed: failureCount,
      },
    }, queuedCount > 0 ? 202 : HTTP_STATUS.OK);
  } catch (error) {
    return errorResponse(
      'Failed to process documents',
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
