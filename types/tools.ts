export interface WebSearchImage {
  url: string;
  description?: string;
  searchIndex?: number;
  searchQuery?: string;
}

export interface WebSearchSource {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  score: number;
  position: number;
  searchIndex?: number;
  searchQuery?: string;
}
