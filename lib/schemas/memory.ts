import { z } from 'zod';

export const searchMemoriesSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  limit: z.number().min(1).max(50).optional().default(5),
});

export const updateMemorySchema = z.object({
  memory: z.string().min(1, 'Memory text is required').max(1000, 'Memory text is too long'),
});

export type SearchMemoriesRequest = z.infer<typeof searchMemoriesSchema>;
export type UpdateMemoryRequest = z.infer<typeof updateMemorySchema>;
