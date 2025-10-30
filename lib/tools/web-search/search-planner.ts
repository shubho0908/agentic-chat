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

export async function executeMultiSearch(
  searchPlan: SearchPlan,
  executeSearch: (query: string, maxResults: number) => Promise<SearchResultWithSources>,
  onProgress?: (searchIndex: number, total: number, query: string) => void
): Promise<MultiSearchResult> {
  const results: string[] = [];
  const allSources: MultiSearchSource[] = [];
  const allImages: MultiSearchImage[] = [];

  for (let i = 0; i < searchPlan.recommendedSearches.length; i++) {
    const plannedSearch = searchPlan.recommendedSearches[i];

    onProgress?.(i + 1, searchPlan.recommendedSearches.length, plannedSearch.query);

    try {
      const searchResult = await executeSearch(
        plannedSearch.query,
        plannedSearch.expectedResultCount
      );
      
      searchResult.sources.forEach(source => {
        const existingSource = allSources.find(s => s.url === source.url);
        if (!existingSource) {
          allSources.push({
            ...source,
            position: allSources.length + 1,
            searchIndex: i + 1,
            searchQuery: plannedSearch.query,
          });
        }
      });

      if (searchResult.images && searchResult.images.length > 0) {
        searchResult.images.forEach(image => {
          const existingImage = allImages.find(img => img.url === image.url);
          if (!existingImage) {
            allImages.push({
              url: image.url,
              description: image.description,
              searchIndex: i + 1,
              searchQuery: plannedSearch.query,
            });
          }
        });
      }
      
      results.push(
        `\n## Search ${i + 1}/${searchPlan.recommendedSearches.length}: "${plannedSearch.query}"\n**Purpose:** ${plannedSearch.rationale}\n\n${searchResult.output}`
      );
    } catch (error) {
      console.error(`[Multi-Search] Error in search ${i + 1}:`, error);
      results.push(
        `\n## Search ${i + 1}/${searchPlan.recommendedSearches.length}: "${plannedSearch.query}"\n**Error:** Search failed - ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
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
