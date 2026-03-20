import { RoutingDecision, type MemoryStatus } from '@/types/chat';

const encoder = new TextEncoder();

function encodeSSEMessage(data: Record<string, unknown>): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

export function encodeMemoryStatus(
  memoryStatusInfo: MemoryStatus,
  activeTool?: string | null
): Uint8Array {
  return encodeSSEMessage({
    type: 'memory_status',
    hasMemories: memoryStatusInfo.hasMemories,
    attemptedMemory: memoryStatusInfo.attemptedMemory,
    hasDocuments: memoryStatusInfo.hasDocuments,
    memoryCount: memoryStatusInfo.memoryCount,
    documentCount: memoryStatusInfo.documentCount,
    hasImages: memoryStatusInfo.hasImages,
    imageCount: memoryStatusInfo.imageCount,
    hasUrls: memoryStatusInfo.hasUrls,
    urlCount: memoryStatusInfo.urlCount,
    routingDecision: memoryStatusInfo.routingDecision,
    skippedMemory: memoryStatusInfo.skippedMemory,
    activeToolName: memoryStatusInfo.routingDecision === RoutingDecision.ToolOnly
      ? (memoryStatusInfo.activeToolName || activeTool)
      : undefined,
    tokenUsage: memoryStatusInfo.tokenUsage
  });
}

export function encodeToolCall(
  toolName: string,
  toolCallId: string,
  args: Record<string, unknown>
): Uint8Array {
  return encodeSSEMessage({ 
    type: 'tool_call',
    toolName,
    toolCallId,
    args
  });
}

export function encodeToolResult(
  toolName: string,
  toolCallId: string,
  result: string | Record<string, unknown> | unknown[]
): Uint8Array {
  return encodeSSEMessage({ 
    type: 'tool_result',
    toolName,
    toolCallId,
    result
  });
}

export function encodeToolProgress(
  toolName: string,
  status: string,
  message: string,
  details?: Record<string, unknown>
): Uint8Array {
  return encodeSSEMessage({ 
    type: 'tool_progress',
    toolName,
    status,
    message,
    details
  });
}

export function encodeChatChunk(content: string): Uint8Array {
  return encodeSSEMessage({ content });
}

export function encodeError(message: string): Uint8Array {
  return encodeSSEMessage({ error: message });
}

export function encodeDone(): Uint8Array {
  return encoder.encode('data: [DONE]\n\n');
}
