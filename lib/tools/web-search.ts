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
    const { query: rawQuery, maxResults = 5, searchDepth = 'advanced', includeAnswer = false } = input;

    if (!client) {
      return TOOL_ERROR_MESSAGES.WEB_SEARCH.NOT_CONFIGURED;
    }

    if (!rawQuery || typeof rawQuery !== 'string' || rawQuery.trim().length === 0) {
      console.error('[Web Search] Invalid query: empty or not a string');
      return TOOL_ERROR_MESSAGES.WEB_SEARCH.SEARCH_FAILED('Query is empty or invalid');
    }

    // Tavily has a query length limit (typically ~400 chars)
    // Truncate long queries while preserving meaning
    const MAX_QUERY_LENGTH = 400;
    let query = rawQuery.trim();
    
    if (query.length > MAX_QUERY_LENGTH) {
      console.warn(`[Web Search] Query too long (${query.length} chars), truncating to ${MAX_QUERY_LENGTH}`);
      query = query.substring(0, MAX_QUERY_LENGTH);
      const lastPeriod = query.lastIndexOf('.');
      const lastSpace = query.lastIndexOf(' ');
      
      if (lastPeriod > MAX_QUERY_LENGTH * 0.7) {
        query = query.substring(0, lastPeriod + 1).trim();
      } else if (lastSpace > MAX_QUERY_LENGTH * 0.7) {
        query = query.substring(0, lastSpace).trim();
      }
      
      query = query.trim();
    }

    const validatedMaxResults = Math.min(Math.max(maxResults, 1), 20);

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
        max_results: validatedMaxResults,
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
      
      if (error && typeof error === 'object') {
        const errorObj = error as Record<string, unknown>;
        if ('response' in errorObj) {
          const response = errorObj.response as Record<string, unknown> | undefined;
          console.error('[Web Search] API Response Status:', response?.status);
          console.error('[Web Search] API Response:', response);
        }
        if ('request' in errorObj) {
          const request = errorObj.request as Record<string, unknown> | undefined;
          console.error('[Web Search] Request details:', {
            url: request?.url,
            method: request?.method,
          });
        }
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      if (errorMessage.includes('400') || errorMessage.includes('Bad Request')) {
        console.error('[Web Search] Query that caused 400:', rawQuery);
        return TOOL_ERROR_MESSAGES.WEB_SEARCH.SEARCH_FAILED('Invalid search query. The query may be too complex or contain unsupported characters.');
      }

      return TOOL_ERROR_MESSAGES.WEB_SEARCH.SEARCH_FAILED(errorMessage);
    }
}
