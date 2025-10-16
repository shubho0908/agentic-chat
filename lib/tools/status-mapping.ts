type MappedStatus = 'searching' | 'found' | 'processing_sources' | 'completed';

const YOUTUBE_STATUS_MAP: Record<string, MappedStatus> = {
  'detecting': 'searching',
  'extracting': 'processing_sources',
  'processing_chapters': 'processing_sources',
  'completed': 'completed',
};

const DEEP_RESEARCH_STATUS_MAP: Record<string, MappedStatus> = {
  'gate_check': 'searching',
  'routing': 'searching',
  'gate_skip': 'completed',
  'planning': 'found',
  'task_start': 'found',
  'task_progress': 'processing_sources',
  'task_complete': 'processing_sources',
  'aggregating': 'processing_sources',
  'evaluating': 'processing_sources',
  'formatting': 'processing_sources',
  'retrying': 'processing_sources',
  'completed': 'completed',
};

export function mapYouTubeStatus(
  status: string,
  details?: { step?: string; processedCount?: number; videoCount?: number }
): MappedStatus {
  if (status === 'extracting') {
    const hasVideos = (details?.videoCount ?? 0) > 0;
    const notStartedProcessing = (details?.processedCount ?? 0) === 0;
    
    if (details?.step === 'search_complete' || (hasVideos && notStartedProcessing)) {
      return 'found';
    }
  }
  
  return YOUTUBE_STATUS_MAP[status] || 'searching';
}

export function mapDeepResearchStatus(status: string): MappedStatus {
  return DEEP_RESEARCH_STATUS_MAP[status] || 'searching';
}
