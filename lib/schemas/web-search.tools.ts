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

export const webSearchParamsSchema = z.object({
  query: z.string().describe('The search query - be specific and clear'),
  maxResults: z
    .number()
    .optional()
    .default(5)
    .describe('Maximum number of results to return. Choose based on query complexity: 3-5 for simple queries, 5-10 for moderate research, 10+ for comprehensive analysis. Consider requesting more results if user would benefit from having resource links for further reading or verification'),
  searchDepth: z
    .enum(['basic', 'advanced'])
    .optional()
    .default('basic')
    .describe('Search depth: basic for quick results, advanced for comprehensive research'),
  includeAnswer: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether to include an AI-generated answer summary'),
});
