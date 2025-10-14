import { Search, Youtube } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

export const TOOL_IDS = {
  WEB_SEARCH: 'web_search',
  YOUTUBE: 'youtube',
} as const;

export type ToolId = typeof TOOL_IDS[keyof typeof TOOL_IDS];

export interface ToolConfig {
  id: ToolId;
  name: string;
  description: string;
  icon: LucideIcon;
  inputPrefix?: string;
  gradientColors: {
    from: string;
    via: string;
    to: string;
  };
  iconColor: string;
  iconColorClass: string;
  functionDefinition: ChatCompletionTool;
}

export const AVAILABLE_TOOLS: Record<ToolId, ToolConfig> = {
  [TOOL_IDS.WEB_SEARCH]: {
    id: TOOL_IDS.WEB_SEARCH,
    name: 'Web Search',
    description: 'Search the internet',
    icon: Search,
    inputPrefix: 'Search the web for: ',
    gradientColors: {
      from: '#22d3ee',
      via: '#3b82f6', 
      to: '#4f46e5',
    },
    iconColor: '#3b82f6',
    iconColorClass: 'text-blue-500',
    functionDefinition: {
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Search the internet for current information, facts, news, articles, documentation, or general web content. Use this for: latest news, technical documentation, blog posts, research papers, product information, company details, artist information, song credits, music releases, album details, or ANY factual questions. This is the DEFAULT tool for factual queries. Only use youtube tool when user specifically wants to WATCH or ANALYZE video transcripts.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query - be specific and clear',
            },
            maxResults: {
              type: 'number',
              description: 'Maximum number of results to return (3-15). Choose based on query complexity: 3-5 for simple queries, 5-10 for moderate research, 10+ for comprehensive analysis',
              default: 5,
            },
            searchDepth: {
              type: 'string',
              enum: ['basic', 'advanced'],
              description: 'Search depth: basic for quick results, advanced for comprehensive research',
              default: 'basic',
            },
            includeAnswer: {
              type: 'boolean',
              description: 'Whether to include an AI-generated answer summary',
              default: false,
            },
          },
          required: ['query'],
        },
      },
    },
  },
  [TOOL_IDS.YOUTUBE]: {
    id: TOOL_IDS.YOUTUBE,
    name: 'YouTube',
    description: 'Analyze YouTube videos',
    icon: Youtube,
    inputPrefix: 'Paste YouTube link: ',
    gradientColors: {
      from: '#FF0000',
      via: '#CC0000',
      to: '#880000',
    },
    iconColor: '#FF0000',
    iconColorClass: 'text-red-500',
    functionDefinition: {
      type: 'function',
      function: {
        name: 'youtube',
        description: 'Extract and analyze YouTube video transcripts, chapters, and metadata. ONLY use when user explicitly wants to: (1) WATCH or find specific videos to watch, (2) GET TRANSCRIPT/captions of videos, (3) ANALYZE video content in depth, (4) Find "top N videos" or "best videos" on a topic. DO NOT use for factual questions about music, artists, songs, or general information - use web_search instead. Keywords that trigger this: "watch video", "video transcript", "analyze video", "top 5 videos", "show me videos", "find videos about", or when YouTube URLs are provided.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query for YouTube videos. Use when no URLs are provided to search YouTube.',
            },
            maxResults: {
              type: 'number',
              description: 'Maximum number of videos to analyze (1-10). Choose based on query: 1-2 for specific videos, 3-5 for moderate analysis, 5-10 for comprehensive research. Default is 1 to avoid unnecessary processing.',
              default: 1,
              minimum: 1,
              maximum: 10,
            },
            urls: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of YouTube URLs to process (max 15). Leave empty to search YouTube based on the query parameter.',
              maxItems: 15,
            },
            includeChapters: {
              type: 'boolean',
              description: 'Whether to extract chapter timestamps',
              default: true,
            },
            includeTimestamps: {
              type: 'boolean',
              description: 'Whether to include timestamps in transcript',
              default: true,
            },
            language: {
              type: 'string',
              description: 'Preferred transcript language (ISO 639-1 code)',
              default: 'en',
            },
          },
          required: [],
        },
      },
    },
  },
};

export function getToolConfig(toolId: ToolId): ToolConfig {
  return AVAILABLE_TOOLS[toolId];
}

export function isValidToolId(id: string): id is ToolId {
  return Object.values(TOOL_IDS).includes(id as ToolId);
}

export function getToolGradientClasses(toolId: ToolId): string {
  const config = getToolConfig(toolId);
  return `from-${config.gradientColors.from} via-${config.gradientColors.via} to-${config.gradientColors.to}`;
}

export function getAllToolDefinitions(): ChatCompletionTool[] {
  return Object.values(AVAILABLE_TOOLS).map(tool => tool.functionDefinition);
}
