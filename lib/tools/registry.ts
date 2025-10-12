import { webSearchTool } from './web-search';

export const toolRegistry = {
  web_search: webSearchTool,
};

export type ToolRegistry = typeof toolRegistry;
