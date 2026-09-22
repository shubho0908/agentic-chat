import { AIMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { calculateTokenUsage } from "@/lib/utils/tokenCounter";
import type { Message } from "@/lib/schemas/chat";

interface MessageUnit { messages: BaseMessage[]; pdf: boolean; latestHuman: boolean }

function text(message: BaseMessage): string {
  return typeof message.content === "string" ? message.content : JSON.stringify(message.content);
}
function calls(message: BaseMessage) {
  return message instanceof AIMessage ? message.tool_calls ?? [] : [];
}
function budgetContent(message: BaseMessage): string {
  const toolCalls = calls(message);
  return toolCalls.length
    ? JSON.stringify({ content: message.content, tool_calls: toolCalls })
    : text(message);
}
function asBudgetMessages(messages: BaseMessage[]): Message[] {
  return messages.map((message) => ({
    role: message.type === "system" ? "system" : message.type === "ai" ? "assistant" : "user",
    content: budgetContent(message),
  } as Message));
}
function units(messages: BaseMessage[]): MessageUnit[] {
  const result: MessageUnit[] = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const toolCalls = calls(message);
    if (toolCalls.length) {
      const ids = new Set(toolCalls.flatMap((call) => call.id ? [call.id] : []));
      const grouped = [message];
      while (i + 1 < messages.length && messages[i + 1] instanceof ToolMessage && ids.has((messages[i + 1] as ToolMessage).tool_call_id)) grouped.push(messages[++i]);
      result.push({ messages: grouped, pdf: toolCalls.some((call) => call.name === "create_pdf"), latestHuman: false });
    } else if (!(message instanceof ToolMessage)) {
      result.push({ messages: [message], pdf: false, latestHuman: message.type === "human" });
    }
  }
  const lastHuman = result.map((u) => u.latestHuman).lastIndexOf(true);
  result.forEach((u, i) => { u.latestHuman = i === lastHuman; });
  return result;
}
function isPdfFollowUp(messages: BaseMessage[]): boolean {
  const latest = [...messages].reverse().find((message) => message.type === "human");
  return !!latest && /\b(pdf|document|page|title|font|colour|color|layout|edit|change|replace|add|remove)\b/i.test(text(latest));
}
export function buildBoundedModelContext(system: BaseMessage, conversation: BaseMessage[], model: string, maxInputTokens?: number): { messages: BaseMessage[]; trimmed: number; protectedPdfPairs: number } {
  const grouped = units(conversation);
  const protectedIndex = isPdfFollowUp(conversation) ? grouped.map((unit) => unit.pdf).lastIndexOf(true) : -1;
  const required = new Set(grouped.flatMap((unit, index) => (unit.latestHuman || index === protectedIndex) ? [index] : []));
  const base = calculateTokenUsage(asBudgetMessages([system]), model);
  const capacity = Math.min(base.limit - base.responseReserve, maxInputTokens ?? Number.POSITIVE_INFINITY);
  const unitCosts = grouped.map((unit) => calculateTokenUsage(asBudgetMessages(unit.messages), model).used - 3);
  let used = base.used;
  for (const index of required) used += unitCosts[index];
  if (used > capacity) throw new Error("Required conversation context exceeds the model token budget.");
  const selected = new Set(required);
  for (let index = grouped.length - 1; index >= 0; index--) {
    if (selected.has(index)) continue;
    if (used + unitCosts[index] > capacity) continue;
    selected.add(index);
    used += unitCosts[index];
  }
  const kept = grouped.flatMap((unit, index) => selected.has(index) ? unit.messages : []);
  return { messages: [system, ...kept], trimmed: conversation.length - kept.length, protectedPdfPairs: protectedIndex >= 0 ? 1 : 0 };
}
