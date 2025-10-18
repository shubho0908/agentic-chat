import { RoutingDecision, type MemoryStatus } from '@/types/chat';

const encoder = new TextEncoder();

export function encodeSSEMessage(data: Record<string, unknown>): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

export function encodeMemoryStatus(
  memoryStatusInfo: MemoryStatus,
  activeTool?: string | null
): Uint8Array {
  return encodeSSEMessage({ 
    type: 'memory_status',
    hasMemories: memoryStatusInfo.hasMemories,
    hasDocuments: memoryStatusInfo.hasDocuments,
    memoryCount: memoryStatusInfo.memoryCount,
    documentCount: memoryStatusInfo.documentCount,
    hasImages: memoryStatusInfo.hasImages,
    imageCount: memoryStatusInfo.imageCount,
    routingDecision: memoryStatusInfo.routingDecision,
    skippedMemory: memoryStatusInfo.skippedMemory,
    activeToolName: memoryStatusInfo.routingDecision === RoutingDecision.ToolOnly 
      ? (memoryStatusInfo.activeToolName || activeTool) 
      : undefined
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
  result: string
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

export function shouldSendMemoryStatus(memoryStatusInfo: MemoryStatus): boolean {
  return memoryStatusInfo.hasMemories || 
    memoryStatusInfo.hasDocuments || 
    memoryStatusInfo.hasImages ||
    memoryStatusInfo.routingDecision === RoutingDecision.ToolOnly ||
    memoryStatusInfo.routingDecision === RoutingDecision.MemoryOnly ||
    memoryStatusInfo.routingDecision === RoutingDecision.VisionOnly ||
    memoryStatusInfo.routingDecision === RoutingDecision.DocumentsOnly ||
    memoryStatusInfo.routingDecision === RoutingDecision.Hybrid;
}
