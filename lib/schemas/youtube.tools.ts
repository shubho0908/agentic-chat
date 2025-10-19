import { z } from 'zod';

export const youtubeParamsSchema = z.object({
  urls: z.array(z.url()).min(1).max(15).optional().describe('Array of YouTube URLs to process (max 15)'),
  maxResults: z.number().int().min(1).max(15).optional().describe('Maximum number of videos to search and analyze (1-15). Use this when user specifies a count like "find 10 videos"'),
  includeChapters: z.boolean().optional().default(true).describe('Whether to extract chapter timestamps'),
  includeTimestamps: z.boolean().optional().default(true).describe('Whether to include timestamps in transcript'),
  language: z.string().optional().default('en').describe('Preferred transcript language (ISO 639-1 code)'),
});

export type YouTubeParams = z.infer<typeof youtubeParamsSchema>;
