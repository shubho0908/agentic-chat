import { google, type Auth } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { GOOGLE_SUITE_PROVIDER_ID } from './scopes';

export interface GoogleSuiteClientContext {
  oauth2Client: Auth.OAuth2Client;
  userId: string;
}

export function createOAuth2Client(): Auth.OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/google-suite/auth/callback`
  );
}

async function refreshAccessToken(userId: string, oauth2Client: Auth.OAuth2Client): Promise<void> {
  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    
    const expiresAt = credentials.expiry_date
      ? new Date(credentials.expiry_date)
      : new Date(Date.now() + 3600 * 1000);

    await prisma.account.updateMany({
      where: {
        userId,
        providerId: GOOGLE_SUITE_PROVIDER_ID,
      },
      data: {
        accessToken: credentials.access_token,
        accessTokenExpiresAt: expiresAt,
      },
    });

    oauth2Client.setCredentials(credentials);
  } catch (error) {
    console.error('[Google Suite Client] Token refresh failed:', error);
    throw new Error('Failed to refresh access token. Please re-authorize Google Suite.');
  }
}

export async function createGoogleSuiteClient(userId: string): Promise<GoogleSuiteClientContext> {
  const oauth2Client = createOAuth2Client();

  const account = await prisma.account.findFirst({
    where: {
      userId,
      providerId: GOOGLE_SUITE_PROVIDER_ID,
      accessToken: { not: null },
      refreshToken: { not: null },
    },
    select: {
      accessToken: true,
      refreshToken: true,
      accessTokenExpiresAt: true,
    },
  });

  if (!account?.accessToken || !account?.refreshToken) {
    throw new Error('No valid Google account tokens found. Please authorize Google Suite access via the Tools menu.');
  }

  oauth2Client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
  });

  const isExpired = account.accessTokenExpiresAt
    ? new Date(account.accessTokenExpiresAt) < new Date()
    : true;

  if (isExpired) {
    await refreshAccessToken(userId, oauth2Client);
  }

  return { oauth2Client, userId };
}
