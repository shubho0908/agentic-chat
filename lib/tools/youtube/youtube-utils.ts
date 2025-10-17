export function formatViewCount(count: number): string {
  if (count >= 1000000000) return `${(count / 1000000000).toFixed(1)}B`;
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

export function formatDuration(isoDuration: string): string {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return isoDuration;

  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatTimestamp(offsetMs: number): string {
  const minutes = Math.floor(offsetMs / 60000);
  const seconds = Math.floor((offsetMs % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function calculateRecencyScore(publishedAt: string): number {
  try {
    const publishDate = new Date(publishedAt);
    const daysSincePublish = (Date.now() - publishDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSincePublish <= 7) return 1.0;
    if (daysSincePublish <= 30) return 0.8;
    if (daysSincePublish <= 365) return 0.5;
    return 0.3;
  } catch {
    return 0.5;
  }
}

export function createFallbackMetadata(videoId: string, url: string) {
  return {
    id: videoId,
    title: `Video ${videoId}`,
    url
  };
}
