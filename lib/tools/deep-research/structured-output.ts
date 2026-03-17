import type { z } from 'zod';
import { ChatOpenAI } from '@langchain/openai';

type StructuredMessage = Array<{
  role: 'system' | 'user' | 'assistant';
  content: string;
}>;

export async function invokeStructuredOutput<T extends z.ZodTypeAny>(
  llm: ChatOpenAI,
  schema: T,
  name: string,
  messages: StructuredMessage,
  signal?: AbortSignal
): Promise<z.infer<T>> {
  const structuredLlm = llm.withStructuredOutput(schema, {
    name,
    strict: true,
  });

  return structuredLlm.invoke(messages, { signal }) as Promise<z.infer<T>>;
}
