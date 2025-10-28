import { google, type Auth } from 'googleapis';
import { GaxiosError } from 'gaxios';
import { prisma } from '@/lib/prisma';
import { GOOGLE_PROVIDER_ID } from './scopes';

export interface GoogleSuiteClientContext {
  oauth2Client: Auth.OAuth2Client;
  userId: string;
}

export const GOOGLE_AUTH_REVOKED_ERROR = 'GOOGLE_AUTH_REVOKED';

function createOAuth2Client(): Auth.OAuth2Client {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXT_PUBLIC_APP_URL } = process.env;
  
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !NEXT_PUBLIC_APP_URL) {
    throw new Error('Missing Google OAuth credentials in environment variables');
  }
  
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    `${NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
  );
}

export function isAuthRevokedError(error: unknown): boolean {
  const gaxError = error as GaxiosError;
  return (
    gaxError.response?.status === 401 ||
    gaxError.response?.status === 403 ||
    gaxError.response?.data?.error === 'invalid_grant' ||
    gaxError.response?.data?.error === 'invalid_token' ||
    (error as Error).message?.includes('invalid_grant') ||
    (error as Error).message?.includes('revoked')
  );
}

export async function createGoogleSuiteClient(userId: string): Promise<GoogleSuiteClientContext> {
  const account = await prisma.account.findFirst({
    where: { userId, providerId: GOOGLE_PROVIDER_ID },
    select: {
      accessToken: true,
      refreshToken: true,
    },
  });

  if (!account?.accessToken || !account?.refreshToken) {
    throw new Error('Google account not authorized. Please sign in with Google via the Tools menu.');
  }

  const oauth2Client = createOAuth2Client();
  
  oauth2Client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
  });

  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await prisma.account.updateMany({
        where: { userId, providerId: GOOGLE_PROVIDER_ID },
        data: {
          accessToken: tokens.access_token,
          accessTokenExpiresAt: tokens.expiry_date 
            ? new Date(tokens.expiry_date)
            : new Date(Date.now() + 3600 * 1000),
        },
      });
    }
  });

  return { oauth2Client, userId };
}
