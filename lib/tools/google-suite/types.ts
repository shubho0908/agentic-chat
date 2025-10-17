import type { Auth } from 'googleapis';

export interface ToolHandlerContext {
  userId: string;
  oauth2Client: Auth.OAuth2Client;
}
