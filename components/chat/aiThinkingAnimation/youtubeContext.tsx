import { Youtube, CheckCircle2 } from "lucide-react";
import { VisionContextItem } from "./visionContextItem";
import type { MemoryStatusProps } from "./types";

interface YouTubeVideo {
  title: string;
}

interface YouTubeDetails {
  step?: string;
  videoCount?: number;
  processedCount?: number;
  currentVideo?: YouTubeVideo;
  query?: string;
  resultsCount?: number;
  detectedUrls?: string[];
  videos?: YouTubeVideo[];
}

const YOUTUBE_ICON_CLASS = 'text-red-600 dark:text-red-400';
const YOUTUBE_TEXT_CLASS = 'text-red-700 dark:text-red-300';

function truncateText(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function getStepLabel(step: string | undefined, details: YouTubeDetails | undefined, fallbackMessage?: string): string {
  if (!step || !details) return fallbackMessage || 'YouTube analysis';
  
  switch (step) {
    case 'url_detection': return 'Detecting YouTube URLs...';
    case 'url_detected': return `Found ${details.detectedUrls?.length || 0} video(s)`;
    case 'search_mode': return `Searching: "${truncateText(details.query || '', 30)}"`;
    case 'search_start': return 'Searching YouTube...';
    case 'search_complete': return `Found ${details.resultsCount || 0} video(s)`;
    case 'metadata': return 'Fetching metadata...';
    case 'transcript': return 'Extracting transcript...';
    case 'transcript_method': return 'Extracting transcript...';
    case 'chapters': return 'Extracting chapters...';
    case 'analysis_start': return 'Analyzing video content...';
    case 'video_complete': return 'Video complete';
    case 'complete': return 'Anlysis completed!';
    default: return fallbackMessage || 'YouTube analysis';
  }
}

function shouldShowBranch(hasContent: boolean): "├─" | "└─" {
  return hasContent ? "├─" : "└─";
}

export function YouTubeContext({ memoryStatus }: MemoryStatusProps) {
  const details = memoryStatus.toolProgress?.details as YouTubeDetails | undefined;
  const step = details?.step;
  const videoCount = details?.videoCount || 0;
  const processedCount = details?.processedCount || 0;
  const currentVideo = details?.currentVideo;
  const videos = details?.videos || [];
  
  const hasMultipleVideos = videoCount > 1;
  const showProgress = hasMultipleVideos && processedCount > 0;
  const showCurrentVideo = Boolean(currentVideo?.title);
  const showVideosList = videos.length > 0;
  const isCompleteStep = step === 'complete' || step === 'video_complete';

  const label = getStepLabel(step, details, memoryStatus.toolProgress?.message);
  const StatusIcon = isCompleteStep ? CheckCircle2 : Youtube;

  return (
    <div className="flex flex-col gap-1.5">
      {memoryStatus.hasImages && (
        <VisionContextItem imageCount={memoryStatus.imageCount} />
      )}

      <div className="flex items-center gap-2">
        <span className="text-foreground/40 font-mono text-[10px] select-none">
          {shouldShowBranch(showProgress || showCurrentVideo || showVideosList)}
        </span>
        <StatusIcon className={`w-3.5 h-3.5 flex-shrink-0 ${isCompleteStep ? '' : 'animate-pulse'} ${YOUTUBE_ICON_CLASS}`} />
        <span className={`font-medium text-[11px] ${YOUTUBE_TEXT_CLASS}`}>
          {label}
        </span>
      </div>

      {showProgress && (
        <div className="flex items-center gap-2">
          <span className="text-foreground/40 font-mono text-[10px] select-none">
            {shouldShowBranch(showCurrentVideo || showVideosList)}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 font-mono">
            {Math.min(processedCount + 1, videoCount)}/{videoCount}
          </span>
          {!isCompleteStep && (
            <span className="text-[10px] text-foreground/60">Processing</span>
          )}
        </div>
      )}

      {showCurrentVideo && currentVideo && (
        <div className="flex items-start gap-2">
          <span className="text-foreground/40 font-mono text-[10px] select-none mt-0.5">
            {shouldShowBranch(showVideosList)}
          </span>
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className="text-[10px] text-foreground/50">Current:</span>
            <span 
              className={`text-[11px] font-medium truncate max-w-[240px] ${YOUTUBE_TEXT_CLASS}`}
              title={currentVideo.title}
            >
              {currentVideo.title}
            </span>
          </div>
        </div>
      )}

      {showVideosList && (
        <div className="flex items-start gap-2">
          <span className="text-foreground/40 font-mono text-[10px] select-none mt-0.5">└─</span>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-foreground/50">
              {isCompleteStep ? 'Completed' : 'Videos'}
            </span>
            <div className="flex flex-wrap gap-1 items-center">
              {videos.slice(0, 3).map((video, idx) => (
                <span
                  key={`${video.title}-${idx}`}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-700 dark:text-red-300 truncate max-w-[120px]"
                  title={video.title}
                >
                  {video.title}
                </span>
              ))}
              {videos.length > 3 && (
                <span className="text-[10px] text-foreground/50">
                  +{videos.length - 3} more
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
