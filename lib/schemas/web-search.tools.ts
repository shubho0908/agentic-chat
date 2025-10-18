import { z } from 'zod';

export const webSearchResultSchema = z.object({
  position: z.number(),
  title: z.string(),
  url: z.string(),
  content: z.string(),
  score: z.number(),
  publishedDate: z.string().optional(),
});

export const webSearchResponseSchema = z.object({
  success: z.boolean(),
  query: z.string(),
  resultsCount: z.number().optional(),
  responseTime: z.string().optional(),
  answer: z.string().optional(),
  results: z.array(webSearchResultSchema).optional(),
  formattedOutput: z.string().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
});

export const searchDepthEnum = z.enum(['basic', 'advanced']);
export type SearchDepth = z.infer<typeof searchDepthEnum>;

export const webSearchParamsSchema = z.object({
  query: z.string().describe('The search query - be specific and clear'),
  maxResults: z
    .number()
    .optional()
    .default(5)
    .describe('Maximum number of results to return. Will be automatically adjusted based on searchDepth if not specified'),
  searchDepth: searchDepthEnum
    .optional()
    .default('basic')
    .describe(`Search depth mode:
- BASIC: Quick search with 3-5 results for fast responses to straightforward queries. Optimized for speed and efficiency. Use when the user needs quick facts, definitions, or simple information.
- ADVANCED: Deep search with 10-15 results for comprehensive research. Provides extensive coverage, multiple perspectives, and detailed analysis. Use when the query is complex, requires thorough investigation, or the user explicitly asks for in-depth information.`),
  includeAnswer: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether to include an AI-generated answer summary'),
});

export function getRecommendedMaxResults(searchDepth: SearchDepth, customMax?: number): number {
  if (customMax !== undefined) {
    return customMax;
  }
  
  return searchDepth === 'advanced' ? 12 : 5;
}
