import type { Message, MessageContentPart } from '@/lib/schemas/chat';
import type OpenAI from 'openai';

type MessageContent = string | MessageContentPart[];

export function extractTextFromMessage(content: MessageContent): string {
  if (typeof content === 'string') {
    return content;
  }
  return content
    .filter((p) => p.type === 'text')
    .map((p) => p.type === 'text' ? p.text : '')
    .join(' ');
}

export function injectContextToMessages(messages: Message[], context: string): Message[] {
  const systemMessageIndex = messages.findIndex((m) => m.role === 'system');
  
  if (systemMessageIndex >= 0) {
    const updatedMessages = [...messages];
    updatedMessages[systemMessageIndex] = {
      ...updatedMessages[systemMessageIndex],
      content: updatedMessages[systemMessageIndex].content + context
    };
    return updatedMessages;
  } else {
    return [
      { role: 'system', content: context },
      ...messages
    ];
  }
}

export function extractConversationHistory(
  messages: Message[],
  options: {
    maxExchanges?: number;
    excludeLastMessage?: boolean;
    includeAllForShortConversations?: boolean;
  } = {}
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const {
    maxExchanges = 5,
    excludeLastMessage = false,
    includeAllForShortConversations = false,
  } = options;

  const relevantMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  
  const messagesToProcess = excludeLastMessage ? messages.slice(0, -1) : messages;
  
  const totalUserMessages = messagesToProcess.filter(
    m => m && m.role === 'user' && extractTextFromMessage(m.content).trim()
  ).length;
  
  const effectiveMaxExchanges = includeAllForShortConversations && totalUserMessages <= 10
    ? totalUserMessages
    : maxExchanges;
  
  let exchangeCount = 0;
  
  for (let i = messagesToProcess.length - 1; i >= 0 && exchangeCount < effectiveMaxExchanges; i--) {
    const msg = messagesToProcess[i];
    
    if (!msg || msg.role === 'system') continue;
    
    const textContent = extractTextFromMessage(msg.content);
    if (!textContent.trim()) continue;
    
    relevantMessages.push({
      role: msg.role as 'user' | 'assistant',
      content: textContent,
    });
    
    if (msg.role === 'user') {
      exchangeCount++;
    }
  }
  
  return relevantMessages.reverse();
}
