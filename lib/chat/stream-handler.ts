import type OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionMessageToolCall } from 'openai/resources/chat/completions';
import type { Message } from '@/types/core';
import type { MemoryStatus } from '@/types/chat';
import { parseOpenAIError } from '@/lib/openai-errors';
import { getAllToolDefinitions, TOOL_IDS } from '@/lib/tools/config';
import { executeToolCall } from '@/lib/tools/executor';
import { encodeToolCall, encodeToolProgress, encodeToolResult } from './streaming-helpers';
import {
  encodeMemoryStatus,
  encodeChatChunk,
  encodeError,
  encodeDone,
  shouldSendMemoryStatus,
} from './streaming-helpers';

export interface StreamHandlerOptions {
  memoryStatusInfo: MemoryStatus;
  messages: Message[];
  enhancedMessages: Message[];
  model: string;
  openai: OpenAI;
}

function toOpenAIMessages(messages: Message[]): ChatCompletionMessageParam[] {
  return messages as ChatCompletionMessageParam[];
}

export function createChatStreamHandler(options: StreamHandlerOptions) {
  const { memoryStatusInfo, enhancedMessages, model, openai } = options;

  return {
    async start(controller: ReadableStreamDefaultController) {
      try {
        if (shouldSendMemoryStatus(memoryStatusInfo)) {
          controller.enqueue(encodeMemoryStatus(memoryStatusInfo));
        }
        
        const currentMessages = toOpenAIMessages(enhancedMessages);
        const allTools = getAllToolDefinitions();
        let iterations = 0;
        const maxIterations = 5;
        const maxToolCallsPerIteration = 5;
        const toolCallHistory = new Map<string, number>();
        const toolNameCallCount = new Map<string, number>();
        const maxCallsPerTool: Record<string, number> = {
          [TOOL_IDS.YOUTUBE]: 1,
          [TOOL_IDS.WEB_SEARCH]: 1,
        };
        
        while (iterations < maxIterations) {
          iterations++;
          
          const streamResponse = await openai.chat.completions.create({
            model,
            messages: currentMessages,
            tools: allTools,
            tool_choice: 'auto',
            stream: true,
          });
          
          let currentContent = '';
          const toolCalls: ChatCompletionMessageToolCall[] = [];
          let currentToolCall: { index: number; id: string; type: 'function'; function: { name: string; arguments: string } } | null = null;
          
          for await (const chunk of streamResponse) {
            const delta = chunk.choices[0]?.delta;
            
            if (delta?.content) {
              currentContent += delta.content;
              controller.enqueue(encodeChatChunk(delta.content));
            }
            
            if (delta?.tool_calls) {
              for (const toolCallDelta of delta.tool_calls) {
                if (toolCallDelta.index !== undefined) {
                  if (!currentToolCall || currentToolCall.index !== toolCallDelta.index) {
                    if (currentToolCall) {
                      toolCalls.push(currentToolCall as ChatCompletionMessageToolCall);
                    }
                    
                    currentToolCall = {
                      index: toolCallDelta.index,
                      id: toolCallDelta.id || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                      type: 'function',
                      function: {
                        name: toolCallDelta.function?.name || '',
                        arguments: toolCallDelta.function?.arguments || '',
                      },
                    };
                  } else if (currentToolCall && toolCallDelta.function?.arguments) {
                    currentToolCall.function.arguments += toolCallDelta.function.arguments;
                  }
                }
              }
            }
            
            if (chunk.choices[0]?.finish_reason) {
              if (currentToolCall) {
                toolCalls.push(currentToolCall as ChatCompletionMessageToolCall);
                currentToolCall = null;
              }
            }
          }
          
          if (toolCalls.length === 0) {
            break;
          }
          
          if (toolCalls.length > maxToolCallsPerIteration) {
            console.warn(`[Stream Handler] Too many tool calls (${toolCalls.length}), limiting to ${maxToolCallsPerIteration}`);
            toolCalls.splice(maxToolCallsPerIteration);
          }
          
          currentMessages.push({
            role: 'assistant',
            content: currentContent || null,
            tool_calls: toolCalls,
          });
          
          for (const toolCall of toolCalls) {
            if (toolCall.type !== 'function') continue;
            
            const toolName = toolCall.function.name;
            let args: Record<string, unknown> = {};
            
            try {
              args = JSON.parse(toolCall.function.arguments);
            } catch (error) {
              console.error('[Stream Handler] Failed to parse tool arguments:', error);
            }
            
            const toolKey = `${toolName}:${JSON.stringify(args)}`;
            const exactCallCount = toolCallHistory.get(toolKey) || 0;
            const toolCallCount = toolNameCallCount.get(toolName) || 0;
            const maxForThisTool = maxCallsPerTool[toolName] || 5;
            
            if (exactCallCount >= 2) {
              console.warn(`[Stream Handler] Tool ${toolName} called ${exactCallCount} times with same args, blocking duplicate`);
              const errorMsg = `This tool has already been called with these exact parameters. Using previous results instead.`;
              controller.enqueue(encodeToolResult(toolName, toolCall.id, errorMsg));
              currentMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: errorMsg,
              });
              continue;
            }
            
            if (toolCallCount >= maxForThisTool) {
              console.warn(`[Stream Handler] Tool ${toolName} called ${toolCallCount} times (max: ${maxForThisTool}), blocking further calls`);
              const errorMsg = `The ${toolName} tool has been used ${toolCallCount} times already. Please work with the information already gathered.`;
              controller.enqueue(encodeToolResult(toolName, toolCall.id, errorMsg));
              currentMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: errorMsg,
              });
              continue;
            }
            
            toolCallHistory.set(toolKey, exactCallCount + 1);
            toolNameCallCount.set(toolName, toolCallCount + 1);
            
            controller.enqueue(encodeToolCall(toolName, toolCall.id, args));
            
            const result = await executeToolCall(
              toolName,
              args,
              (progress) => {
                controller.enqueue(encodeToolProgress(
                  toolName,
                  progress.status,
                  progress.message,
                  progress.details
                ));
              }
            );
            
            const resultContent = result.success 
              ? (result.data || 'Tool executed successfully')
              : (result.error || 'Tool execution failed');
            
            controller.enqueue(encodeToolResult(toolName, toolCall.id, resultContent));
            
            currentMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: resultContent,
            });
          }
          
          // Continue the loop to let OpenAI process tool results
        }
        
        if (iterations >= maxIterations) {
          console.warn(`[Stream Handler] Max iterations (${maxIterations}) reached`);
          controller.enqueue(encodeChatChunk('\n\n_[Note: Maximum tool iteration limit reached]_'));
        }
        
        controller.enqueue(encodeDone());
        controller.close();
      } catch (error) {
        const { message } = parseOpenAIError(error);
        
        try {
          controller.enqueue(encodeError(message));
          controller.enqueue(encodeDone());
        } catch {}
        controller.close();
      }
    },
  };
}