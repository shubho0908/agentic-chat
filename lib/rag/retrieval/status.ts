'use server';

import { prisma } from '@/lib/prisma';
import { RAG_CONFIG } from '../config';
import type { AttachmentStatus } from './status-helpers';
import { partitionByStatus, extractIds } from './status-helpers';

export async function getAttachmentStatuses(
  attachmentIds: string[]
): Promise<AttachmentStatus[]> {
  return await prisma.attachment.findMany({
    where: {
      id: { in: attachmentIds },
    },
    select: {
      id: true,
      processingStatus: true,
      processingError: true,
    },
  });
}

export async function waitForDocumentProcessing(
  attachmentIds: string[],
  options: {
    pollInterval?: number;
    useExponentialBackoff?: boolean;
  } = {}
): Promise<string[]> {
  const {
    pollInterval = RAG_CONFIG.processing.pollInterval,
    useExponentialBackoff = RAG_CONFIG.processing.exponentialBackoff,
  } = options;

  let currentInterval = pollInterval;
  let previousCompletedCount = 0;

  while (true) {
    const statuses = await getAttachmentStatuses(attachmentIds);
    const partitioned = partitionByStatus(statuses);
    
    const completedIds = extractIds(partitioned.completed);
    const stillProcessing = [...partitioned.processing, ...partitioned.pending];
    const currentCompletedCount = completedIds.length;

    if (currentCompletedCount > previousCompletedCount) {
      previousCompletedCount = currentCompletedCount;
    }

    if (stillProcessing.length === 0) {
      return completedIds;
    }

    await new Promise(resolve => setTimeout(resolve, currentInterval));

    if (useExponentialBackoff) {
      currentInterval = Math.min(
        currentInterval * 1.5,
        RAG_CONFIG.processing.maxBackoffInterval
      );
    }
  }
}

export async function getCompletedAttachmentIds(
  attachmentIds: string[]
): Promise<string[]> {
  const completedAttachments = await prisma.attachment.findMany({
    where: {
      id: { in: attachmentIds },
      processingStatus: 'COMPLETED',
    },
    select: {
      id: true,
    },
  });

  return extractIds(completedAttachments);
}
