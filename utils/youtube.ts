export function parseDurationToSeconds(isoDuration: string): number {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');
  
  return hours * 3600 + minutes * 60 + seconds;
}

export function formatDuration(isoDuration: string): string {
  const seconds = parseDurationToSeconds(isoDuration);
  if (seconds === 0) return isoDuration;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export function formatTimestamp(offsetMs: number): string {
  const totalSeconds = Math.floor(offsetMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function parseTimestampToSeconds(timestamp: string): number {
  const match = timestamp.match(/(?:(\d+):)?(\d+):(\d+)/);
  if (!match) return 0;
  
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2]);
  const seconds = parseInt(match[3]);
  
  return hours * 3600 + minutes * 60 + seconds;
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
