import { ChatOpenAI } from '@langchain/openai';
import type { SearchDepth } from '@/lib/schemas/web-search.tools';
import type { SearchResultWithSources } from '@/types/tools';

export interface PlannedSearch {
  query: string;
  rationale: string;
  expectedResultCount: number;
  priority: 'high' | 'medium' | 'low';
}

export interface SearchPlan {
  originalQuery: string;
  queryType: 'factual' | 'comparative' | 'analytical' | 'exploratory' | 'how-to' | 'current-events';
  complexity: 'simple' | 'moderate' | 'complex';
  recommendedSearches: PlannedSearch[];
  totalResultsNeeded: number;
  reasoning: string;
}

export interface MultiSearchSource {
  position: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  score: number;
  searchIndex: number;
  searchQuery: string;
}

export interface MultiSearchResult {
  formattedOutput: string;
  allSources: MultiSearchSource[];
}

const SEARCH_PLANNER_PROMPT = `You are an expert search strategist that analyzes queries and creates optimal search plans.

**YOUR MISSION:** Analyze the user's query and determine the most effective search strategy to gather comprehensive, relevant information.

**QUERY ANALYSIS DIMENSIONS:**

1. **Query Type:**
   - **factual**: Single fact lookup ("What is X?", "Who invented Y?", "When did Z happen?")
   - **comparative**: Comparing multiple things ("X vs Y", "Differences between A and B")
   - **analytical**: Deep analysis needed ("How does X work?", "Why does Y happen?", "Impact of Z")
   - **exploratory**: Broad research ("Tell me about X", "Research Y", "Comprehensive overview of Z")
   - **how-to**: Practical guidance ("How to do X", "Steps to achieve Y", "Tutorial for Z")
   - **current-events**: Recent news, trends, updates ("Latest X", "Recent Y", "Current state of Z")

2. **Complexity Levels:**
   - **simple**: Single-dimension, straightforward answer (1-2 searches, 5-8 results total)
   - **moderate**: Multi-faceted, needs several perspectives (2-3 searches, 10-15 results total)
   - **complex**: Comprehensive research with multiple angles (3-5 searches, 18-25 results total)

3. **Search Strategy:**
   - **Direct**: Single search with the original query (for simple factual queries)
   - **Decomposed**: Break into 2-3 focused sub-queries (for comparative/analytical queries)
   - **Multi-angle**: 3-5 searches covering different perspectives (for exploratory/complex queries)

**CRITICAL RULES:**

1. **Optimize for Relevance over Volume:**
   - More results ≠ better results
   - Target the MINIMUM searches needed for comprehensive coverage
   - Each search should have a DISTINCT purpose
   - Avoid redundant or overlapping searches

2. **Result Count Guidelines:**
   - Simple factual: 5-8 results total (1-2 searches)
   - Moderate complexity: 10-15 results total (2-3 searches)
   - High complexity: 18-25 results total (3-5 searches)
   - NEVER exceed 25 total results (API limits and relevance degradation)

3. **Query Decomposition Strategy:**
   - For comparisons: Search each item separately if needed
   - For analysis: Break into core aspects (definition, mechanism, impact, examples)
   - For how-to: Steps, best practices, common pitfalls, alternatives
   - For exploration: Overview, deep-dive aspects, current state, future trends

4. **Priority Assignment:**
   - **high**: Critical for answering the core query
   - **medium**: Enriches understanding with important context
   - **low**: Nice-to-have for comprehensive coverage

**EXAMPLES:**

Example 1 - Simple Factual Query:
Input: "What is React?"
Analysis: {
  "queryType": "factual",
  "complexity": "simple",
  "recommendedSearches": [
    {
      "query": "What is React JavaScript library",
      "rationale": "Direct answer to definition and core purpose",
      "expectedResultCount": 7,
      "priority": "high"
    }
  ],
  "totalResultsNeeded": 7,
  "reasoning": "Simple factual query needs single focused search with 7 quality sources covering definition, purpose, and basic usage."
}

Example 2 - Comparative Query:
Input: "React vs Vue performance and use cases"
Analysis: {
  "queryType": "comparative",
  "complexity": "moderate",
  "recommendedSearches": [
    {
      "query": "React vs Vue performance benchmarks comparison",
      "rationale": "Direct performance comparison with data",
      "expectedResultCount": 6,
      "priority": "high"
    },
    {
      "query": "React use cases real world applications when to use",
      "rationale": "Understand React's optimal scenarios",
      "expectedResultCount": 4,
      "priority": "medium"
    },
    {
      "query": "Vue use cases real world applications when to use",
      "rationale": "Understand Vue's optimal scenarios",
      "expectedResultCount": 4,
      "priority": "medium"
    }
  ],
  "totalResultsNeeded": 14,
  "reasoning": "Comparative query needs focused searches on performance data plus separate use case research for each framework to avoid bias and get comprehensive coverage."
}

Example 3 - Complex Analytical Query:
Input: "How does OAuth 2.0 work and what are security best practices"
Analysis: {
  "queryType": "analytical",
  "complexity": "complex",
  "recommendedSearches": [
    {
      "query": "OAuth 2.0 flow authorization process explained",
      "rationale": "Core mechanism and workflow understanding",
      "expectedResultCount": 6,
      "priority": "high"
    },
    {
      "query": "OAuth 2.0 grant types comparison when to use",
      "rationale": "Different OAuth patterns and their use cases",
      "expectedResultCount": 5,
      "priority": "high"
    },
    {
      "query": "OAuth 2.0 security vulnerabilities best practices",
      "rationale": "Security considerations and hardening",
      "expectedResultCount": 6,
      "priority": "high"
    },
    {
      "query": "OAuth 2.0 implementation examples common mistakes",
      "rationale": "Practical guidance and pitfall avoidance",
      "expectedResultCount": 5,
      "priority": "medium"
    }
  ],
  "totalResultsNeeded": 22,
  "reasoning": "Complex technical query requiring multi-angle approach: mechanism understanding, pattern selection, security hardening, and practical implementation guidance. Four focused searches provide comprehensive coverage without redundancy."
}

Example 4 - Current Events Query:
Input: "Latest developments in AI regulation"
Analysis: {
  "queryType": "current-events",
  "complexity": "moderate",
  "recommendedSearches": [
    {
      "query": "AI regulation 2025 latest news updates",
      "rationale": "Most recent regulatory developments",
      "expectedResultCount": 8,
      "priority": "high"
    },
    {
      "query": "EU AI Act implementation status current state",
      "rationale": "Specific major regulation progress",
      "expectedResultCount": 5,
      "priority": "medium"
    }
  ],
  "totalResultsNeeded": 13,
  "reasoning": "Current events query needs recent sources. Primary search for latest news, secondary for specific major development. Total 13 results captures breadth without overwhelming."
}

**OUTPUT FORMAT:**

Respond with ONLY a valid JSON object matching this structure:
{
  "queryType": "factual" | "comparative" | "analytical" | "exploratory" | "how-to" | "current-events",
  "complexity": "simple" | "moderate" | "complex",
  "recommendedSearches": [
    {
      "query": "specific optimized search query",
      "rationale": "why this search matters (one sentence)",
      "expectedResultCount": number (5-8 for main searches, 3-5 for supplementary),
      "priority": "high" | "medium" | "low"
    }
  ],
  "totalResultsNeeded": number (sum of expectedResultCount, max 25),
  "reasoning": "brief explanation of search strategy (1-2 sentences)"
}

**VALIDATION:**
- Ensure totalResultsNeeded = sum of all expectedResultCount
- Ensure totalResultsNeeded ≤ 25
- Ensure recommendedSearches.length ≤ 5
- Each query should be distinct and non-overlapping`;

export async function createSearchPlan(
  query: string,
  searchDepth: SearchDepth,
  openaiApiKey: string,
  model: string = 'gpt-4o-mini'
): Promise<SearchPlan> {
  if (searchDepth === 'basic') {
    return {
      originalQuery: query,
      queryType: 'factual',
      complexity: 'simple',
      recommendedSearches: [
        {
          query,
          rationale: 'Direct search optimized for quick factual response',
          expectedResultCount: 6,
          priority: 'high',
        },
      ],
      totalResultsNeeded: 6,
      reasoning: 'Basic search mode: single focused query for efficiency',
    };
  }

  const createFallbackPlan = (): SearchPlan => {
    return {
      originalQuery: query,
      queryType: 'exploratory',
      complexity: 'moderate',
      recommendedSearches: [
        {
          query,
          rationale: 'Direct search of the original query',
          expectedResultCount: 12,
          priority: 'high',
        },
      ],
      totalResultsNeeded: 12,
      reasoning: 'Fallback: Single direct search due to planning error',
    };
  };

  try {
    const llm = new ChatOpenAI({
      model,
      apiKey: openaiApiKey,
    });

    const response = await llm.invoke([
      { role: 'system', content: SEARCH_PLANNER_PROMPT },
      {
        role: 'user',
        content: `Analyze this query and create an optimal search plan:\n\n"${query}"\n\nSearch depth: ${searchDepth}\n\nProvide the search plan as JSON.`,
      },
    ]);

    const rawContent = Array.isArray(response.content)
      ? response.content
          .filter(
            (part): part is { type: 'text'; text: string } =>
              part && part.type === 'text' && 'text' in part && typeof part.text === 'string'
          )
          .map((part) => part.text)
          .join('\n')
      : String(response.content ?? '');

    if (!rawContent.trim()) {
      console.warn('[Search Planner] Empty LLM response, using fallback');
      return createFallbackPlan();
    }

    const parsed = JSON.parse(rawContent);

    if (
      !parsed.queryType ||
      !parsed.complexity ||
      !Array.isArray(parsed.recommendedSearches) ||
      parsed.recommendedSearches.length === 0
    ) {
      console.warn('[Search Planner] Invalid plan structure, using fallback');
      return createFallbackPlan();
    }

    const totalResults = parsed.recommendedSearches.reduce(
      (sum: number, s: PlannedSearch) => sum + (s.expectedResultCount || 0),
      0
    );

    if (totalResults > 25) {
      console.warn(`[Search Planner] Total results ${totalResults} exceeds limit, capping at 25`);
      const scale = 25 / totalResults;
      parsed.recommendedSearches = parsed.recommendedSearches.map((s: PlannedSearch) => ({
        ...s,
        expectedResultCount: Math.max(3, Math.round(s.expectedResultCount * scale)),
      }));
      parsed.totalResultsNeeded = 25;
    }

    if (parsed.recommendedSearches.length > 5) {
      console.warn(
        `[Search Planner] ${parsed.recommendedSearches.length} searches exceeds limit, keeping top 5`
      );
      parsed.recommendedSearches = parsed.recommendedSearches.slice(0, 5);
      parsed.totalResultsNeeded = parsed.recommendedSearches.reduce(
        (sum: number, s: PlannedSearch) => sum + s.expectedResultCount,
        0
      );
    }

    return {
      originalQuery: query,
      queryType: parsed.queryType,
      complexity: parsed.complexity,
      recommendedSearches: parsed.recommendedSearches,
      totalResultsNeeded: parsed.totalResultsNeeded,
      reasoning: parsed.reasoning || 'LLM-generated search plan',
    };
  } catch (error) {
    console.error('[Search Planner] Error creating search plan:', error);
    return createFallbackPlan();
  }
}

export async function executeMultiSearch(
  searchPlan: SearchPlan,
  executeSearch: (query: string, maxResults: number) => Promise<SearchResultWithSources>,
  onProgress?: (searchIndex: number, total: number, query: string) => void
): Promise<MultiSearchResult> {
  const results: string[] = [];
  const allSources: MultiSearchSource[] = [];

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

  const formattedOutput = `# Intelligent Multi-Search Results\n\n**Original Query:** ${searchPlan.originalQuery}\n**Query Type:** ${searchPlan.queryType}\n**Complexity:** ${searchPlan.complexity}\n**Search Strategy:** ${searchPlan.reasoning}\n**Total Searches:** ${searchPlan.recommendedSearches.length}\n**Unique Sources Found:** ${allSources.length}\n\n${results.join('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n')}`;

  return {
    formattedOutput,
    allSources,
  };
}
