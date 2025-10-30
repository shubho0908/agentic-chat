import { ChatOpenAI } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { PromptTemplate } from '@langchain/core/prompts';
import type { YouTubeTranscriptSegment, YouTubeChapter } from '@/types/tools';
import { formatTimestamp, parseTimestampToSeconds } from '@/utils/youtube';

export interface VideoAnalysis {
  quickSummary: string;
  keyPoints: Array<{
    point: string;
    timestamp: string;
    timeSeconds: number;
  }>;
  topics: Array<{
    name: string;
    description: string;
    timeRange: string;
  }>;
  entities: Array<{
    type: 'person' | 'product' | 'concept' | 'organization';
    name: string;
    context: string;
  }>;
  actionItems: string[];
  sentiment: {
    overall: 'positive' | 'neutral' | 'negative' | 'mixed';
    score: number;
  };
}

interface VideoAnalysisInput {
  videoId: string;
  title: string;
  channelName?: string;
  duration?: string;
  transcript: YouTubeTranscriptSegment[];
  transcriptText: string;
  chapters?: YouTubeChapter[];
}

interface ChunkAnalysis {
  summary: string;
  keyPoints: string[];
  topics: string[];
  entities: string[];
  timeRange: string;
}

interface ParsedKeyPoint {
  point: string;
  timestamp?: string;
  timeSeconds?: number;
}

interface ParsedTopic {
  name: string;
  description?: string;
  timeRange?: string;
}

interface ParsedEntity {
  type: string;
  name: string;
  context?: string;
}

export async function analyzeVideo(
  video: VideoAnalysisInput,
  apiKey: string,
  model: string,
  onProgress?: (step: string, details?: Record<string, unknown>) => void
): Promise<VideoAnalysis> {
  if (!apiKey || apiKey.trim().length === 0) {
    console.error('[YouTube Analyzer] API key validation failed at entry point');
    throw new Error('OpenAI API key is required but was not provided');
  }

  if (video.transcriptText.length < 8000) {
    onProgress?.('direct_analysis', { reason: 'short_video' });
    return await analyzeDirectly(video, apiKey, model);
  }

  onProgress?.('chunking', { textLength: video.transcriptText.length });
  const chunks = await createSemanticChunks(video.transcript);
  
  onProgress?.('analyzing_chunks', { chunkCount: chunks.length });
  const chunkAnalyses = await analyzeChunksInParallel(chunks, video, apiKey, model);
  
  onProgress?.('synthesizing', { analysisCount: chunkAnalyses.length });
  return await synthesizeAnalyses(chunkAnalyses, video, apiKey, model);
}

async function analyzeDirectly(
  video: VideoAnalysisInput,
  apiKey: string,
  model: string
): Promise<VideoAnalysis> {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('OpenAI API key is required but was not provided');
  }

  const llm = new ChatOpenAI({
    openAIApiKey: apiKey,
    modelName: model,
  });

  const prompt = PromptTemplate.fromTemplate(`
Analyze this YouTube video transcript and provide structured analysis in JSON format.

VIDEO: {title}
CHANNEL: {channel}
DURATION: {duration}

TRANSCRIPT (first 200 segments):
{transcript}

CHAPTERS: {chapters}

Return ONLY valid JSON with:
{{
  "quickSummary": "2-3 sentence summary",
  "keyPoints": [
    {{"point": "insight", "timestamp": "3:45", "timeSeconds": 225}}
  ],
  "topics": [
    {{"name": "Topic", "description": "desc", "timeRange": "2:15-8:30"}}
  ],
  "entities": [
    {{"type": "person|product|concept|organization", "name": "Name", "context": "context"}}
  ],
  "actionItems": ["takeaway 1", "takeaway 2"],
  "sentiment": {{"overall": "positive|neutral|negative|mixed", "score": 0.5}}
}}

Be factual. Extract from transcript only. Return valid JSON.`);

  const chain = prompt.pipe(llm);
  const result = await chain.invoke({
    title: video.title,
    channel: video.channelName || 'Unknown',
    duration: video.duration || 'Unknown',
    transcript: formatTranscriptWithTimestamps(video.transcript.slice(0, 200)),
    chapters: video.chapters?.map(c => `${c.timestamp} - ${c.title}`).join('\n') || 'None',
  });

  return parseAnalysisResult(result.content as string);
}

async function createSemanticChunks(
  transcript: YouTubeTranscriptSegment[]
): Promise<Array<{text: string; startTime: number; endTime: number}>> {
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 4000,
    chunkOverlap: 200,
    separators: ['\n\n', '\n', '. ', '! ', '? ', ', ', ' ', ''],
  });

  const textWithTimestamps = transcript
    .map(seg => `[${formatTimestamp(seg.offset)}] ${seg.text}`)
    .join(' ');

  const docs = await textSplitter.createDocuments([textWithTimestamps]);
  
  return docs.map((doc) => {
    const timeMatches = doc.pageContent.match(/\[(\d+:\d+(?::\d+)?)\]/g);
    const firstTime = timeMatches?.[0]?.replace(/[\[\]]/g, '') || '0:00';
    const lastTime = timeMatches?.[timeMatches.length - 1]?.replace(/[\[\]]/g, '') || '0:00';
    
    return {
      text: doc.pageContent,
      startTime: parseTimestampToSeconds(firstTime),
      endTime: parseTimestampToSeconds(lastTime),
    };
  });
}

async function analyzeChunksInParallel(
  chunks: Array<{text: string; startTime: number; endTime: number}>,
  video: VideoAnalysisInput,
  apiKey: string,
  model: string
): Promise<ChunkAnalysis[]> {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('OpenAI API key is required but was not provided');
  }

  const llm = new ChatOpenAI({
    openAIApiKey: apiKey,
    modelName: model,
  });

  const prompt = PromptTemplate.fromTemplate(`
Analyze this video segment titled "{title}".

TIME RANGE: {timeRange}
SEGMENT: {segment}

Return ONLY valid JSON:
{{
  "summary": "2-3 sentences",
  "keyPoints": ["point1", "point2"],
  "topics": ["topic1", "topic2"],
  "entities": ["entity1", "entity2"]
}}
`);

  const results: ChunkAnalysis[] = [];
  const batchSize = 3;

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (chunk) => {
      try {
        const chain = prompt.pipe(llm);
        const result = await chain.invoke({
          title: video.title,
          timeRange: `${formatTimestamp(chunk.startTime * 1000)} - ${formatTimestamp(chunk.endTime * 1000)}`,
          segment: chunk.text.slice(0, 3000),
        });

        const parsed = JSON.parse(result.content as string);
        return {
          ...parsed,
          timeRange: `${formatTimestamp(chunk.startTime * 1000)} - ${formatTimestamp(chunk.endTime * 1000)}`,
        };
      } catch {
        return {
          summary: 'Error analyzing segment',
          keyPoints: [],
          topics: [],
          entities: [],
          timeRange: `${formatTimestamp(chunk.startTime * 1000)} - ${formatTimestamp(chunk.endTime * 1000)}`,
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
}

async function synthesizeAnalyses(
  chunkAnalyses: ChunkAnalysis[],
  video: VideoAnalysisInput,
  apiKey: string,
  model: string
): Promise<VideoAnalysis> {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('OpenAI API key is required but was not provided');
  }

  const llm = new ChatOpenAI({
    openAIApiKey: apiKey,
    modelName: model,
  });

  const combinedSummaries = chunkAnalyses.map(a => `[${a.timeRange}] ${a.summary}`).join('\n');
  const allKeyPoints = chunkAnalyses.flatMap(a => a.keyPoints);
  const allTopics = Array.from(new Set(chunkAnalyses.flatMap(a => a.topics)));
  const allEntities = Array.from(new Set(chunkAnalyses.flatMap(a => a.entities)));

  const prompt = PromptTemplate.fromTemplate(`
Create comprehensive analysis of "{title}" from segment analyses.

SEGMENTS: {summaries}
KEY POINTS: {keyPoints}
TOPICS: {topics}
ENTITIES: {entities}

Return ONLY valid JSON:
{{
  "quickSummary": "2-3 sentence overall summary",
  "keyPoints": [
    {{"point": "most important insight", "timestamp": "3:45", "timeSeconds": 225}}
  ],
  "topics": [
    {{"name": "Topic", "description": "desc", "timeRange": "2:15-8:30"}}
  ],
  "entities": [
    {{"type": "person|product|concept|organization", "name": "Name", "context": "brief context"}}
  ],
  "actionItems": ["key takeaway 1", "key takeaway 2"],
  "sentiment": {{"overall": "positive|neutral|negative|mixed", "score": 0.5}}
}}

Return valid JSON only.`);

  const chain = prompt.pipe(llm);
  const result = await chain.invoke({
    title: video.title,
    summaries: combinedSummaries,
    keyPoints: allKeyPoints.join('\n'),
    topics: allTopics.join(', '),
    entities: allEntities.join(', '),
  });

  return parseAnalysisResult(result.content as string);
}

function parseAnalysisResult(content: string): VideoAnalysis {
  try {
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
    const parsed = JSON.parse(jsonStr);

    return {
      quickSummary: parsed.quickSummary || 'No summary available',
      keyPoints: (parsed.keyPoints || []).map((kp: string | ParsedKeyPoint) => {
        if (typeof kp === 'string') {
          return { point: kp, timestamp: '0:00', timeSeconds: 0 };
        }
        return {
          point: kp.point || '',
          timestamp: kp.timestamp || '0:00',
          timeSeconds: kp.timeSeconds || 0,
        };
      }),
      topics: (parsed.topics || []).map((t: string | ParsedTopic) => {
        if (typeof t === 'string') {
          return { name: t, description: '', timeRange: 'Unknown' };
        }
        return {
          name: t.name || '',
          description: t.description || '',
          timeRange: t.timeRange || 'Unknown',
        };
      }),
      entities: (parsed.entities || []).map((e: string | ParsedEntity) => {
        if (typeof e === 'string') {
          return { type: 'concept' as const, name: e, context: '' };
        }
        const entityType = e.type as 'person' | 'product' | 'concept' | 'organization';
        return {
          type: ['person', 'product', 'concept', 'organization'].includes(entityType) ? entityType : 'concept',
          name: e.name || '',
          context: e.context || '',
        };
      }),
      actionItems: parsed.actionItems || [],
      sentiment: {
        overall: parsed.sentiment?.overall || 'neutral',
        score: parsed.sentiment?.score || 0,
      },
    };
  } catch {
    return {
      quickSummary: 'Analysis parsing failed',
      keyPoints: [],
      topics: [],
      entities: [],
      actionItems: [],
      sentiment: { overall: 'neutral', score: 0 },
    };
  }
}

function formatTranscriptWithTimestamps(segments: YouTubeTranscriptSegment[]): string {
  return segments
    .map(seg => `[${formatTimestamp(seg.offset)}] ${seg.text}`)
    .join(' ');
}
