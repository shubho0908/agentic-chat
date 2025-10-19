import type { YouTubeChapter } from '@/types/tools';

export function extractChapters(description: string): YouTubeChapter[] {
  if (!description) return [];

  const chapters: YouTubeChapter[] = [];
  
  const timestampRegex = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s*[-–—]?\s*(.+?)$/gm;
  
  const matches = description.matchAll(timestampRegex);
  
  for (const match of matches) {
    const hours = match[1] ? parseInt(match[1]) : 0;
    const minutes = parseInt(match[2]);
    const seconds = parseInt(match[3]);
    const title = match[4].trim();
    
    if (title.length < 2 || /^[\d\s:]+$/.test(title)) {
      continue;
    }
    
    const timeSeconds = hours * 3600 + minutes * 60 + seconds;
    const timestamp = hours > 0 
      ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      : `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    chapters.push({
      timestamp,
      timeSeconds,
      title: title.replace(/[–—]/g, '-').trim()
    });
  }
  
  chapters.sort((a, b) => a.timeSeconds - b.timeSeconds);
  
  const uniqueChapters: YouTubeChapter[] = [];
  const seenTimes = new Set<number>();
  
  for (const chapter of chapters) {
    if (!seenTimes.has(chapter.timeSeconds)) {
      seenTimes.add(chapter.timeSeconds);
      uniqueChapters.push(chapter);
    }
  }
  
  return uniqueChapters;
}


