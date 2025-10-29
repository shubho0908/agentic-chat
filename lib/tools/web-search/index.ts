import { TavilyClient } from 'tavily';
import { z } from 'zod';
import { webSearchParamsSchema } from '@/lib/schemas/web-search.tools';
import { TOOL_ERROR_MESSAGES } from '@/constants/errors';
import type { WebSearchSource, WebSearchProgress, WebSearchImage } from '@/types/tools';

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
    if (!client) {
      return TOOL_ERROR_MESSAGES.WEB_SEARCH.NOT_CONFIGURED;
    }

    let validatedInput;
    try {
      validatedInput = webSearchParamsSchema.parse(input);
    } catch (error) {
      console.error('[Web Search] Validation error:', error);
      return TOOL_ERROR_MESSAGES.WEB_SEARCH.SEARCH_FAILED('Invalid search parameters');
    }

    const { query: rawQuery, maxResults, searchDepth, includeAnswer, includeImages } = validatedInput;

    if (!rawQuery || rawQuery.trim().length === 0) {
      console.error('[Web Search] Invalid query: empty');
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

    const clampedMaxResults = Math.min(Math.max(maxResults, 1), 20);

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
        max_results: clampedMaxResults,
        search_depth: searchDepth,
        include_answer: includeAnswer,
        include_images: includeImages ?? true,
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

      const images: WebSearchImage[] = response.images 
        ? (Array.isArray(response.images) 
            ? response.images.map((img: string | { url: string; description?: string }) => 
                typeof img === 'string' 
                  ? { url: img } 
                  : { url: img.url, description: img.description }
              )
            : []
          )
        : [];

      onProgress?.({
        status: 'found',
        message: `Found ${response.results.length} sources${images.length > 0 ? ` and ${images.length} images` : ''}`,
        details: { 
          query, 
          resultsCount: response.results.length, 
          responseTime,
          sources,
          images,
          imageCount: images.length,
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

      const imagesSection = images.length > 0 
        ? `\n\nRelevant Images (${images.length} total):\n${images.slice(0, 10).map((img, idx) => `${idx + 1}. ${img.url}${img.description ? ` - ${img.description}` : ''}`).join('\n')}${images.length > 10 ? `\n... and ${images.length - 10} more images` : ''}`
        : '';

      const formattedOutput = `
Web Search Results for: "${query}"

${includeAnswer && response.answer ? `Quick Answer:\n${response.answer}\n\n` : ''}
Found ${formattedResults.length} results${images.length > 0 ? ` and ${images.length} images` : ''}:

${formattedResults
          .map(
            (result) => `
${result.position}. ${result.title}
   URL: ${result.url}
   Content: ${result.content}
   Relevance Score: ${(result.score * 100).toFixed(1)}%
`
          )
          .join('\n')}${imagesSection}
`.trim();

      onProgress?.({
        status: 'completed',
        message: `Analysis complete`,
        details: { 
          query, 
          resultsCount: formattedResults.length, 
          responseTime,
          sources,
          images,
          imageCount: images.length,
        },
      });

      return formattedOutput;
    } catch (error) {
      console.error('[Web Search] Error:', error instanceof Error ? error.message : String(error));
      
      if (error && typeof error === 'object') {
        const errorObj = error as Record<string, unknown>;
        if ('response' in errorObj) {
          const response = errorObj.response as Record<string, unknown> | undefined;
          console.error('[Web Search] API Response Status:', response?.status);
        }
        if ('request' in errorObj) {
          const request = errorObj.request as Record<string, unknown> | undefined;
          console.error('[Web Search] Request method:', request?.method);
        }
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      if (errorMessage.includes('400') || errorMessage.includes('Bad Request')) {
        const safePreview = typeof rawQuery === 'string' ? rawQuery.slice(0, 50) + '...' : '';
        console.warn('[Web Search] 400 Bad Request. Query preview (truncated):', safePreview);
        return TOOL_ERROR_MESSAGES.WEB_SEARCH.SEARCH_FAILED('Invalid search query. The query may be too complex or contain unsupported characters.');
      }

      return TOOL_ERROR_MESSAGES.WEB_SEARCH.SEARCH_FAILED(errorMessage);
    }
}
