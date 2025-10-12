export interface ParsedSearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
  position?: number;
  domain?: string;
}

export interface ParsedSearchResults {
  resultsCount: number;
  sources: ParsedSearchResult[];
}

export function parseWebSearchResults(result: string): ParsedSearchResults | null {
  const resultsMatch = result.match(/Found (\d+) results?:/);
  const resultsCount = resultsMatch ? parseInt(resultsMatch[1]) : 0;

  const sources: ParsedSearchResult[] = [];
  
  const resultBlocks = result.split(/\n\d+\.\s+/);
  
  for (let i = 1; i < resultBlocks.length; i++) {
    const block = resultBlocks[i];
    const titleMatch = block.match(/^(.+?)\n/);
    const urlMatch = block.match(/URL:\s*(https?:\/\/[^\n]+)/);
    const contentMatch = block.match(/Content:\s*([\s\S]+?)(?:\n|$)/);
    
    if (titleMatch && urlMatch) {
      const url = urlMatch[1].trim();
      const domain = url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
      
      sources.push({
        title: titleMatch[1].trim(),
        url,
        content: contentMatch ? contentMatch[1].trim() : '',
        domain,
        position: i,
        score: 0.85 - (i - 1) * 0.05,
      });
    }
  }

  return { resultsCount, sources: sources.slice(0, 5) };
}

export function getToolIcon(toolName: string) {
  const iconMap: Record<string, string> = {
    'web_search': 'Search',
  };
  
  return iconMap[toolName] || 'Search';
}

export function formatToolDisplayName(toolName: string): string {
  return toolName.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

export const getToolActivationInstruction = (toolName: string): string => {
  const formattedToolName = toolName.replace('_', ' ');
  return `[TOOL REQUESTED: ${toolName}] Use the ${formattedToolName} tool to answer this query.`;
};
