import type { YouTubeVideo, YouTubeChapter } from '@/types/tools';
import type { VideoAnalysis } from './analyzer';

function formatHeader(video: YouTubeVideo): string {
    let output = `# 📺 ${video.title}\n\n`;
    output += `**Video URL:** ${video.url}\n`;
    
    if (video.channelName) {
      output += `**Channel:** ${video.channelName}\n`;
    }
    
    if (video.duration) {
      output += `**Duration:** ${video.duration}\n`;
    }
    
    output += '\n---\n\n';
    
    return output;
  }

function formatQuickSummary(analysis: VideoAnalysis): string {
    let output = `## 📝 Quick Summary (30-second read)\n\n`;
    output += `${analysis.quickSummary}\n\n`;
    output += '---\n\n';
    return output;
  }

function formatTopics(analysis: VideoAnalysis): string {
    if (!analysis.topics || analysis.topics.length === 0) {
      return '';
    }

    let output = `## 🎯 Main Topics Covered\n\n`;
    
    analysis.topics.forEach((topic, idx) => {
      output += `### ${idx + 1}. ${topic.name}`;
      
      if (topic.timeRange && topic.timeRange !== 'Unknown') {
        output += ` _(${topic.timeRange})_`;
      }
      
      output += '\n';
      
      if (topic.description) {
        output += `${topic.description}\n`;
      }
      
      output += '\n';
    });
    
    output += '---\n\n';
    return output;
  }

function formatKeyPoints(analysis: VideoAnalysis): string {
    if (!analysis.keyPoints || analysis.keyPoints.length === 0) {
      return '';
    }

    let output = `## 💡 Key Points & Insights\n\n`;
    
    analysis.keyPoints.forEach((kp, idx) => {
      output += `${idx + 1}. **${kp.point}**\n`;
    });
    
    output += '\n---\n\n';
    return output;
  }

function formatEntities(analysis: VideoAnalysis): string {
    if (!analysis.entities || analysis.entities.length === 0) {
      return '';
    }

    let output = `## 🏷️ Important Entities Referenced\n\n`;
    
    const byType: Record<string, typeof analysis.entities> = {
      person: [],
      product: [],
      concept: [],
      organization: [],
    };
    
    analysis.entities.forEach(entity => {
      if (byType[entity.type]) {
        byType[entity.type].push(entity);
      }
    });
    
    if (byType.person.length > 0) {
      output += '**People:**\n';
      byType.person.forEach(e => {
        output += `- **${e.name}**${e.context ? `: ${e.context}` : ''}\n`;
      });
      output += '\n';
    }
    
    if (byType.product.length > 0) {
      output += '**Products/Tools:**\n';
      byType.product.forEach(e => {
        output += `- **${e.name}**${e.context ? `: ${e.context}` : ''}\n`;
      });
      output += '\n';
    }
    
    if (byType.concept.length > 0) {
      output += '**Concepts/Ideas:**\n';
      byType.concept.forEach(e => {
        output += `- **${e.name}**${e.context ? `: ${e.context}` : ''}\n`;
      });
      output += '\n';
    }
    
    if (byType.organization.length > 0) {
      output += '**Organizations:**\n';
      byType.organization.forEach(e => {
        output += `- **${e.name}**${e.context ? `: ${e.context}` : ''}\n`;
      });
      output += '\n';
    }
    
    output += '---\n\n';
    return output;
  }

function formatChapters(chapters: YouTubeChapter[]): string {
    let output = `## 📑 Chapter Timeline\n\n`;
    
    chapters.forEach(chapter => {
      output += `- **${chapter.timestamp}** - ${chapter.title}\n`;
    });
    
    output += '\n---\n\n';
    return output;
  }

function formatActionItems(analysis: VideoAnalysis): string {
    if (!analysis.actionItems || analysis.actionItems.length === 0) {
      return '';
    }

    let output = `## ✅ Key Takeaways & Action Items\n\n`;
    
    analysis.actionItems.forEach(item => {
      output += `- ${item}\n`;
    });
    
    output += '\n---\n\n';
    return output;
  }

function formatSentiment(analysis: VideoAnalysis): string {
    const sentimentEmoji: Record<string, string> = {
      positive: '😊',
      neutral: '😐',
      negative: '😟',
      mixed: '🤔',
    };
    
    const emoji = sentimentEmoji[analysis.sentiment.overall] || '😐';
    const percentage = Math.round((analysis.sentiment.score + 1) * 50);
    
    let output = `## ${emoji} Content Tone\n\n`;
    output += `**Overall Sentiment:** ${analysis.sentiment.overall.charAt(0).toUpperCase() + analysis.sentiment.overall.slice(1)}`;
    output += ` (${percentage}% ${analysis.sentiment.overall})\n\n`;
    output += '---\n\n';
    
    return output;
  }

function formatFullTranscript(transcriptText: string): string {
    let output = `## 📄 Full Transcript (For Reference)\n\n`;
    output += '<details>\n';
    output += '<summary>Click to expand transcript</summary>\n\n';
    output += transcriptText.slice(0, 50000); // Limit for token efficiency
    output += '\n</details>\n\n';
    return output;
  }

export function formatVideoForLLM(
  video: YouTubeVideo,
  analysis: VideoAnalysis,
  chapters: YouTubeChapter[],
  transcriptText: string,
  includeFullTranscript: boolean = false
): string {
  let output = formatHeader(video);
  output += formatQuickSummary(analysis);
  output += formatTopics(analysis);
  output += formatKeyPoints(analysis);
  output += formatEntities(analysis);
  
  if (chapters && chapters.length > 0) {
    output += formatChapters(chapters);
  }
  
  output += formatActionItems(analysis);
  output += formatSentiment(analysis);
  
  if (includeFullTranscript && transcriptText) {
    output += formatFullTranscript(transcriptText);
  }

  return output;
}

export function formatVideoError(video: YouTubeVideo, error: string): string {
    let output = `# 📺 ${video.title}\n\n`;
    output += `**Video URL:** ${video.url}\n\n`;
    output += `## ⚠️ Processing Error\n\n`;
    output += `${error}\n\n`;
    output += `The video metadata was retrieved, but transcript analysis failed. `;
    output += `This may be because:\n`;
    output += `- The video doesn't have captions/subtitles available\n`;
    output += `- The video is age-restricted or private\n`;
    output += `- Temporary API issues\n\n`;
    output += `You can still watch the video directly at: ${video.url}\n`;
    return output;
  }

export function formatSearchResults(
    videos: Array<{
      video: YouTubeVideo;
      analysis?: VideoAnalysis;
      error?: string;
    }>,
    query: string,
    totalTime: number
  ): string {
    let output = `# 🔍 YouTube Search Results\n\n`;
    output += `**Query:** "${query}"\n`;
    output += `**Found:** ${videos.length} videos\n`;
    output += `**Analysis Time:** ${(totalTime / 1000).toFixed(1)}s\n\n`;
    output += '---\n\n';

    const successful = videos.filter(v => !v.error);
    const failed = videos.filter(v => v.error);

    if (successful.length > 0) {
      output += `## 📊 Analyzed Videos (${successful.length})\n\n`;
      
      successful.forEach((item, idx) => {
        output += `### ${idx + 1}. [${item.video.title}](${item.video.url})\n`;
        
        if (item.video.channelName) {
          output += `**Channel:** ${item.video.channelName}`;
          if (item.video.duration) {
            output += ` | **Duration:** ${item.video.duration}`;
          }
          output += '\n\n';
        }
        
        if (item.analysis) {
          output += `**Summary:** ${item.analysis.quickSummary}\n\n`;
          
          if (item.analysis.keyPoints.length > 0) {
            output += '**Key Points:**\n';
            item.analysis.keyPoints.slice(0, 3).forEach(kp => {
              output += `- ${kp.point}\n`;
            });
            output += '\n';
          }
        }
        
        output += '---\n\n';
      });
    }

    if (failed.length > 0) {
      output += `## ⚠️ Unable to Analyze (${failed.length})\n\n`;
      failed.forEach((item) => {
        output += `- **${item.video.title}**: ${item.error}\n`;
      });
      output += '\n';
    }

    return output;
}