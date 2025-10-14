import { z } from 'zod';

export const youtubeParamsSchema = z.object({
  query: z.string().optional().describe('Search query for YouTube videos. Use when no URLs are provided to search YouTube.'),
  maxResults: z.number().min(1).max(10).optional().default(1).describe('Maximum number of videos to analyze (1-10)'),
  urls: z.array(z.url()).min(1).max(15).optional().describe('Array of YouTube URLs to process (max 15)'),
  includeChapters: z.boolean().optional().default(true).describe('Whether to extract chapter timestamps'),
  includeTimestamps: z.boolean().optional().default(true).describe('Whether to include timestamps in transcript'),
  language: z.string().optional().default('en').describe('Preferred transcript language (ISO 639-1 code)'),
});

export type YouTubeParams = z.infer<typeof youtubeParamsSchema>;
