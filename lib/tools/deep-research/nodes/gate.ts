import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import type { ResearchState } from '../state';
import { RESEARCH_GATE_PROMPT, DIRECT_LLM_PROMPT } from '../prompts';
import type { GateDecision, DirectLLMResponse } from '@/types/deep-research';
import { getStageModel } from '@/lib/model-policy';
import { invokeStructuredOutput } from '../structured-output';

const gateDecisionSchema = z.object({
  shouldResearch: z.boolean(),
  reason: z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
});

const directResponseSchema = z.object({
  answer: z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
});

export async function gateNode(
  state: ResearchState,
  config: { openaiApiKey: string; model: string; forceDeepResearch?: boolean; abortSignal?: AbortSignal }
): Promise<Partial<ResearchState>> {
  if (config.abortSignal?.aborted) {
    throw new Error('Research aborted by user');
  }
  const llm = new ChatOpenAI({
    model: getStageModel(config.model, 'research_gate'),
    apiKey: config.openaiApiKey,
  });

  try {
    if (config.forceDeepResearch) {
      return {
        gateDecision: {
          shouldResearch: true,
          reason: 'Deep research was explicitly forced by the caller',
          confidence: 'high',
        },
        skipped: false,
      };
    }

    let gateQuery = state.originalQuery;
    
    if (state.hasDocuments || state.hasImages) {
      const attachmentInfo: string[] = [];
      if (state.hasDocuments) {
        attachmentInfo.push(`${state.attachmentIds?.length || 0} document(s) attached`);
      }
      if (state.hasImages) {
        attachmentInfo.push('image(s) attached');
      }
      
      gateQuery = `${state.originalQuery}\n\n[NOTE: User has ${attachmentInfo.join(' and ')}. Consider that referential queries about attached content may benefit from research for comprehensive analysis.]`;
    }
    
    const gateDecision: GateDecision = await invokeStructuredOutput(
      llm,
      gateDecisionSchema,
      'DeepResearchGateDecision',
      [
        { role: 'system', content: RESEARCH_GATE_PROMPT },
        { role: 'user', content: gateQuery },
      ],
      config.abortSignal
    );

    if (!gateDecision.shouldResearch) {
      let enrichedQuery = state.originalQuery;
      
      if (state.documentContextForPlanning || state.imageContext) {
        enrichedQuery = `${state.originalQuery}\n\n`;
        
        if (state.documentContextForPlanning) {
          enrichedQuery += `**Document Context (from attached files):**\n${state.documentContextForPlanning}\n\n`;
        }
        
        if (state.imageContext) {
          enrichedQuery += `**Image Context (from attached images):**\n${state.imageContext}\n\n`;
        }
      }
      
      const directLLMResponse: DirectLLMResponse = await invokeStructuredOutput(
        llm,
        directResponseSchema,
        'DeepResearchDirectResponse',
        [
          { role: 'system', content: DIRECT_LLM_PROMPT },
          { role: 'user', content: enrichedQuery },
        ],
        config.abortSignal
      );

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
