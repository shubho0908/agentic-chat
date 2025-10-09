'use server';

import { prisma } from '@/lib/prisma';
import { RAG_CONFIG } from './config';
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
    maxWaitMs?: number;
    pollInterval?: number;
    useExponentialBackoff?: boolean;
  } = {}
): Promise<string[]> {
  const {
    maxWaitMs = RAG_CONFIG.processing.maxWaitTime,
    pollInterval = RAG_CONFIG.processing.pollInterval,
    useExponentialBackoff = RAG_CONFIG.processing.exponentialBackoff,
  } = options;

  const startTime = Date.now();
  let currentInterval = pollInterval;

  while (Date.now() - startTime < maxWaitMs) {
    const statuses = await getAttachmentStatuses(attachmentIds);
    const partitioned = partitionByStatus(statuses);
    
    const stillProcessing = [...partitioned.processing, ...partitioned.pending];

    if (stillProcessing.length === 0) {
      return extractIds(partitioned.completed);
    }

    await new Promise(resolve => setTimeout(resolve, currentInterval));

    if (useExponentialBackoff) {
      currentInterval = Math.min(
        currentInterval * 1.5,
        RAG_CONFIG.processing.maxBackoffInterval
      );
    }
  }

  const finalStatuses = await getAttachmentStatuses(attachmentIds);
  const finalPartitioned = partitionByStatus(finalStatuses);
  
  return extractIds(finalPartitioned.completed);
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
