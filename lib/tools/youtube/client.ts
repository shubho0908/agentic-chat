import { google } from 'googleapis';

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

export const youtubeClient = YOUTUBE_API_KEY 
  ? google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY }) 
  : null;

export function hasYouTubeAPIKey(): boolean {
  return !!YOUTUBE_API_KEY;
}
