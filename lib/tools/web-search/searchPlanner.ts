import type { SearchResultWithSources, MultiSearchImage } from '@/types/tools';


interface SearchPlan {
  originalQuery: string;
  queryType: 'factual' | 'comparative' | 'analytical' | 'exploratory' | 'how-to' | 'current-events';
  complexity: 'simple' | 'moderate' | 'complex';
  recommendedSearches: Array<{
    query: string;
    rationale: string;
    expectedResultCount: number;
    priority: 'high' | 'medium' | 'low';
  }>;
  totalResultsNeeded: number;
  reasoning: string;
}

interface MultiSearchSource {
  position: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  score: number;
  searchIndex: number;
  searchQuery: string;
}

interface MultiSearchResult {
  formattedOutput: string;
  allSources: MultiSearchSource[];
  allImages: MultiSearchImage[];
}

const MAX_PARALLEL_SEARCHES = 3;
import { logger } from "@/lib/logger";
const MIN_RESULTS_PER_SEARCH = 1;
const MAX_RESULTS_PER_SEARCH = 10;

export async function executeMultiSearch(
  searchPlan: SearchPlan,
  executeSearch: (query: string, maxResults: number) => Promise<SearchResultWithSources>,
  onProgress?: (searchIndex: number, total: number, query: string) => void
): Promise<MultiSearchResult> {
  const results: string[] = new Array(searchPlan.recommendedSearches.length).fill('');
  const allSources: MultiSearchSource[] = [];
  const allImages: MultiSearchImage[] = [];
  const sourceUrls = new Set<string>();
  const imageUrls = new Set<string>();

  for (let start = 0; start < searchPlan.recommendedSearches.length; start += MAX_PARALLEL_SEARCHES) {
    const batch = searchPlan.recommendedSearches.slice(start, start + MAX_PARALLEL_SEARCHES);

    const settledBatch = await Promise.allSettled(
      batch.map(async (plannedSearch, batchIndex) => {
        const searchIndex = start + batchIndex;
        onProgress?.(searchIndex + 1, searchPlan.recommendedSearches.length, plannedSearch.query);
        const expectedResultCount = Number.isFinite(plannedSearch.expectedResultCount)
          ? Math.floor(plannedSearch.expectedResultCount)
          : MIN_RESULTS_PER_SEARCH;
        const maxResults = Math.min(
          MAX_RESULTS_PER_SEARCH,
          Math.max(MIN_RESULTS_PER_SEARCH, expectedResultCount)
        );

        const searchResult = await executeSearch(
          plannedSearch.query,
          maxResults
        );

        return { searchIndex, plannedSearch, searchResult };
      })
    );

    settledBatch.forEach((result, batchIndex) => {
      const searchIndex = start + batchIndex;
      const plannedSearch = searchPlan.recommendedSearches[searchIndex];

      if (result.status === 'fulfilled') {
        result.value.searchResult.sources.forEach(source => {
          if (!sourceUrls.has(source.url)) {
            sourceUrls.add(source.url);
            allSources.push({
              ...source,
              position: allSources.length + 1,
              searchIndex: searchIndex + 1,
              searchQuery: plannedSearch.query,
            });
          }
        });

        if (result.value.searchResult.images && result.value.searchResult.images.length > 0) {
          result.value.searchResult.images.forEach(image => {
            if (!imageUrls.has(image.url)) {
              imageUrls.add(image.url);
              allImages.push({
                url: image.url,
                description: image.description,
                searchIndex: searchIndex + 1,
                searchQuery: plannedSearch.query,
              });
            }
          });
        }

        results[searchIndex] =
          `\n## Search ${searchIndex + 1}/${searchPlan.recommendedSearches.length}: "${plannedSearch.query}"\n**Purpose:** ${plannedSearch.rationale}\n\n${result.value.searchResult.output}`;
      } else {
        const errorType =
          result.reason instanceof Error ? result.reason.name : typeof result.reason;
        logger.error(`[Multi-Search] Error in search ${searchIndex + 1}`, { errorType });
        results[searchIndex] =
          `\n## Search ${searchIndex + 1}/${searchPlan.recommendedSearches.length}: "${plannedSearch.query}"\n**Error:** Search failed due to an upstream error.`;
      }
    });
  }

  allSources.forEach((source, index) => {
    source.position = index + 1;
  });

  const imagesSummary = allImages.length > 0 
    ? `\n**Unique Images Found:** ${allImages.length}\n`
    : '';

  const formattedOutput = `# Intelligent Multi-Search Results\n\n**Original Query:** ${searchPlan.originalQuery}\n**Query Type:** ${searchPlan.queryType}\n**Complexity:** ${searchPlan.complexity}\n**Search Strategy:** ${searchPlan.reasoning}\n**Total Searches:** ${searchPlan.recommendedSearches.length}\n**Unique Sources Found:** ${allSources.length}${imagesSummary}\n${results.join('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n')}`;

  return {
    formattedOutput,
    allSources,
    allImages,
  };
}
