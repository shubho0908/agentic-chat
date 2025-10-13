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

export interface ParsedYouTubeVideo {
  videoId: string;
  url: string;
  title: string;
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

export function parseYouTubeResults(result: string): ParsedYouTubeVideo[] {
  const videos: ParsedYouTubeVideo[] = [];
  
  const videoBlocks = result.split(/^##\s+/m).filter(block => block.trim());
  
  for (const block of videoBlocks) {
    const lines = block.split('\n');
    const title = lines[0]?.trim();
    
    const urlMatch = block.match(/\*\*URL:\*\*\s*(https?:\/\/[^\s\n]+)/);
    if (!urlMatch || !title) continue;
    
    const url = urlMatch[1].trim();
    const videoIdMatch = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
    if (!videoIdMatch) continue;
    
    const videoId = videoIdMatch[1];
    
    videos.push({
      videoId,
      url,
      title
    });
  }
  
  return videos;
}
