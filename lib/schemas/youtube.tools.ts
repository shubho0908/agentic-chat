import { z } from 'zod';

export const youtubeParamsSchema = z.object({
  urls: z.array(z.url()).min(1).max(15).optional().describe('Array of YouTube URLs to process (max 15)'),
  includeChapters: z.boolean().optional().default(true).describe('Whether to extract chapter timestamps'),
  includeTimestamps: z.boolean().optional().default(true).describe('Whether to include timestamps in transcript'),
  language: z.string().optional().default('en').describe('Preferred transcript language (ISO 639-1 code)'),
});

export type YouTubeParams = z.infer<typeof youtubeParamsSchema>;
