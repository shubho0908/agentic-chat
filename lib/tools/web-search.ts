import { TavilyClient } from 'tavily';
import { z } from 'zod';
import { webSearchParamsSchema } from '@/lib/schemas/web-search.tools';
import { TOOL_ERROR_MESSAGES } from '@/constants/errors';
import type { WebSearchSource, WebSearchProgress } from '@/types/tools';

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

if (!TAVILY_API_KEY) {
  console.warn('[Web Search] TAVILY_API_KEY not configured. Web search tool will be disabled.');
}

const client = TAVILY_API_KEY ? new TavilyClient({ apiKey: TAVILY_API_KEY }) : null;

type WebSearchInput = z.infer<typeof webSearchParamsSchema>;

export async function executeWebSearch(
  input: WebSearchInput,
  onProgress?: (progress: WebSearchProgress) => void,
  abortSignal?: AbortSignal
): Promise<string> {
    const { query, maxResults = 5, searchDepth = 'advanced', includeAnswer = false } = input;

    if (!client) {
      return TOOL_ERROR_MESSAGES.WEB_SEARCH.NOT_CONFIGURED;
    }

    try {
      if (abortSignal?.aborted) {
        throw new Error('Search aborted by user');
      }

      const startTime = Date.now();

      onProgress?.({
        status: 'searching',
        message: `Searching the web...`,
        details: { query },
      });

      const response = await client.search({
        query,
        max_results: Math.max(maxResults, 1),
        search_depth: searchDepth as 'basic' | 'advanced',
        include_answer: includeAnswer,
        include_images: false,
        include_raw_content: false,
      });

      if (abortSignal?.aborted) {
        throw new Error('Search aborted by user');
      }

      const responseTime = Date.now() - startTime;

      if (!response.results || response.results.length === 0) {
        onProgress?.({
          status: 'completed',
          message: 'No results found',
          details: { query, resultsCount: 0, responseTime },
        });
        return TOOL_ERROR_MESSAGES.WEB_SEARCH.NO_RESULTS(query);
      }

      const extractDomain = (url: string): string => {
        try {
          const urlObj = new URL(url);
          return urlObj.hostname.replace('www.', '');
        } catch {
          return 'unknown';
        }
      };

      const sources: WebSearchSource[] = response.results.map((result, index: number) => ({
        position: index + 1,
        title: result.title,
        url: result.url,
        domain: extractDomain(result.url),
        snippet: result.content.substring(0, 150) + (result.content.length > 150 ? '...' : ''),
        score: parseFloat(result.score),
      }));

      onProgress?.({
        status: 'found',
        message: `Found ${response.results.length} sources`,
        details: { 
          query, 
          resultsCount: response.results.length, 
          responseTime,
          sources 
        },
      });

      for (let i = 0; i < sources.length; i++) {
        if (abortSignal?.aborted) {
          throw new Error('Search aborted by user');
        }

        onProgress?.({
          status: 'processing_sources',
          message: `Analyzing source ${i + 1} of ${sources.length}...`,
          details: {
            query,
            resultsCount: sources.length,
            currentSource: sources[i],
            processedCount: i + 1,
            sources,
          },
        });
      }

      const formattedResults = response.results.map((result, index: number) => ({
        position: index + 1,
        title: result.title,
        url: result.url,
        content: result.content,
        score: parseFloat(result.score),
      }));

      const formattedOutput = `
Web Search Results for: "${query}"

${includeAnswer && response.answer ? `Quick Answer:\n${response.answer}\n\n` : ''}
Found ${formattedResults.length} results:

${formattedResults
          .map(
            (result) => `
${result.position}. ${result.title}
   URL: ${result.url}
   Content: ${result.content}
   Relevance Score: ${(result.score * 100).toFixed(1)}%
`
          )
          .join('\n')}
`.trim();

      onProgress?.({
        status: 'completed',
        message: `Analysis complete`,
        details: { 
          query, 
          resultsCount: formattedResults.length, 
          responseTime,
          sources 
        },
      });

      return formattedOutput;
    } catch (error) {
      console.error('[Web Search] Error:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      return TOOL_ERROR_MESSAGES.WEB_SEARCH.SEARCH_FAILED(errorMessage);
    }
}
