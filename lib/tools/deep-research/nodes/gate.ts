import { ChatOpenAI } from '@langchain/openai';
import type { ResearchState } from '../state';
import { RESEARCH_GATE_PROMPT, DIRECT_LLM_PROMPT } from '../prompts';
import type { GateDecision, DirectLLMResponse } from '@/types/deep-research';

export async function gateNode(
  state: ResearchState,
  config: { openaiApiKey: string; model: string; forceDeepResearch?: boolean; abortSignal?: AbortSignal }
): Promise<Partial<ResearchState>> {
  if (config.abortSignal?.aborted) {
    throw new Error('Research aborted by user');
  }
  const llm = new ChatOpenAI({
    model: config.model,
    apiKey: config.openaiApiKey,
  });

  try {
    const response = await llm.invoke([
      { role: 'system', content: RESEARCH_GATE_PROMPT },
      { role: 'user', content: state.originalQuery },
    ]);

    const content = response.content.toString();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      if (config.forceDeepResearch) {
        return {
          gateDecision: {
            shouldResearch: false,
            reason: 'Unable to parse gate decision, treating as generic query',
            confidence: 'low',
          },
          skipped: true,
          directResponse: {
            answer: 'I apologize, but I had trouble understanding your query. Could you please rephrase or provide more details?',
            confidence: 'low',
          },
          finalResponse: 'I apologize, but I had trouble understanding your query. Could you please rephrase or provide more details?',
        };
      }
      
      return {
        gateDecision: {
          shouldResearch: true,
          reason: 'Unable to parse gate decision, defaulting to research',
          confidence: 'low',
        },
        skipped: false,
      };
    }

    const gateDecision: GateDecision = JSON.parse(jsonMatch[0]);
    if (!gateDecision.shouldResearch) {
      const directResponse = await llm.invoke([
        { role: 'system', content: DIRECT_LLM_PROMPT },
        { role: 'user', content: state.originalQuery },
      ]);

      const directContent = directResponse.content.toString();
      const directJsonMatch = directContent.match(/\{[\s\S]*\}/);
      
      let directLLMResponse: DirectLLMResponse;
      if (directJsonMatch) {
        directLLMResponse = JSON.parse(directJsonMatch[0]);
      } else {
        directLLMResponse = {
          answer: directContent,
          confidence: 'medium',
        };
      }

      return {
        gateDecision,
        directResponse: directLLMResponse,
        skipped: true,
        finalResponse: directLLMResponse.answer,
      };
    }

    return {
      gateDecision,
      skipped: false,
    };

  } catch (error) {
    console.error('[Gate Node] ❌ Error:', error);
    return {
      gateDecision: {
        shouldResearch: true,
        reason: 'Gate check failed, proceeding with research for safety',
        confidence: 'low',
      },
      skipped: false,
      error: `Gate check error: ${error}`,
    };
  }
}
