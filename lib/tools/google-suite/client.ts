import { google, type Auth } from 'googleapis';
import { GaxiosError } from 'gaxios';
import { prisma } from '@/lib/prisma';
import { GOOGLE_PROVIDER_ID } from './scopes';
import { getCachedValidation, setCachedValidation, clearCachedValidation } from './token-cache';

export interface GoogleSuiteClientContext {
  oauth2Client: Auth.OAuth2Client;
  userId: string;
}

export interface TokenValidationResult {
  isValid: boolean;
  error?: string;
  needsRefresh?: boolean;
  scopes?: string[];
  expiresAt?: Date;
}

export const GOOGLE_AUTH_REVOKED_ERROR = 'GOOGLE_AUTH_REVOKED';

const pendingValidations = new Map<string, Promise<TokenValidationResult>>();

export function createOAuth2Client(): Auth.OAuth2Client {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXT_PUBLIC_APP_URL } = process.env;
  
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !NEXT_PUBLIC_APP_URL) {
    throw new Error('Missing Google OAuth credentials in environment variables');
  }
  
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    `${NEXT_PUBLIC_APP_URL}/api/google-suite/auth/callback`
  );
}

async function refreshAccessToken(userId: string, oauth2Client: Auth.OAuth2Client): Promise<void> {
  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    
    await prisma.account.updateMany({
      where: { userId, providerId: GOOGLE_PROVIDER_ID },
      data: {
        accessToken: credentials.access_token,
        accessTokenExpiresAt: credentials.expiry_date
          ? new Date(credentials.expiry_date)
          : new Date(Date.now() + 3600 * 1000),
      },
    });

    oauth2Client.setCredentials(credentials);
    clearCachedValidation(userId);
  } catch (error) {
    const isAuthRevoked = 
      (error as GaxiosError).response?.status === 400 ||
      (error as GaxiosError).response?.status === 401 ||
      (error as GaxiosError).response?.status === 403 ||
      (error as GaxiosError).response?.data?.error === 'invalid_grant' ||
      (error as Error).message?.includes('invalid_grant') ||
      (error as Error).message?.includes('revoked');

    if (isAuthRevoked) {
      console.error('[Google OAuth] Token refresh FAILED - revoked or invalid', {
        userId,
        status: (error as GaxiosError).response?.status,
        errorCode: (error as GaxiosError).response?.data?.error,
      });

      clearCachedValidation(userId);
      throw new Error(GOOGLE_AUTH_REVOKED_ERROR);
    }

    throw error;
  }
}

export async function validateGoogleToken(userId: string): Promise<TokenValidationResult> {
  const cached = getCachedValidation(userId);
  if (cached) {
    return cached;
  }

  const pending = pendingValidations.get(userId);
  if (pending) {
    return pending;
  }

  const validationPromise = (async () => {
    try {
      const account = await prisma.account.findFirst({
        where: { userId, providerId: GOOGLE_PROVIDER_ID },
        select: {
          accessToken: true,
          refreshToken: true,
        },
      });

      if (!account?.accessToken || !account?.refreshToken) {
        const result = {
          isValid: false,
          error: 'No tokens found',
        };
        setCachedValidation(userId, result);
        return result;
      }

      const oauth2Client = createOAuth2Client();
      oauth2Client.setCredentials({
        access_token: account.accessToken,
        refresh_token: account.refreshToken,
      });

      try {
        const tokenInfo = await oauth2Client.getTokenInfo(account.accessToken);
        
        const grantedScopes = tokenInfo.scopes || [];
        
        if (!grantedScopes || grantedScopes.length === 0) {
          console.warn('[Google OAuth] Token has NO scopes granted', { userId });
          const result = {
            isValid: false,
            error: 'No scopes granted',
            scopes: [],
          };
          setCachedValidation(userId, result);
          return result;
        }

        const expiresAt = tokenInfo.expiry_date ? new Date(tokenInfo.expiry_date) : undefined;
        const needsRefresh = tokenInfo.expiry_date ? tokenInfo.expiry_date < Date.now() : false;

        await prisma.account.updateMany({
          where: { userId, providerId: GOOGLE_PROVIDER_ID },
          data: {
            scope: grantedScopes.join(' '),
            accessTokenExpiresAt: expiresAt,
          },
        });

        const result = {
          isValid: true,
          needsRefresh,
          scopes: grantedScopes,
          expiresAt,
        };
        setCachedValidation(userId, result);
        return result;
      } catch (error) {
        const isRevoked = 
          (error as GaxiosError).response?.status === 400 ||
          (error as GaxiosError).response?.status === 401 ||
          (error as GaxiosError).response?.data?.error === 'invalid_token' ||
          (error as Error).message?.includes('invalid');

        if (isRevoked) {
          console.error('[Google OAuth] ✗ Token REJECTED by Google API', {
            userId,
            status: (error as GaxiosError).response?.status,
            errorData: (error as GaxiosError).response?.data,
          });

          const result = {
            isValid: false,
            error: 'Token revoked or invalid',
            scopes: [],
          };
          setCachedValidation(userId, result);
          return result;
        }

        throw error;
      }
    } catch (error) {
      console.error('[Google OAuth] Token validation error:', error);
      const result = {
        isValid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        scopes: [],
      };
      setCachedValidation(userId, result);
      return result;
    } finally {
      pendingValidations.delete(userId);
    }
  })();

  pendingValidations.set(userId, validationPromise);
  return validationPromise;
}

export async function createGoogleSuiteClient(userId: string): Promise<GoogleSuiteClientContext> {
  const oauth2Client = createOAuth2Client();

  const account = await prisma.account.findFirst({
    where: { userId, providerId: GOOGLE_PROVIDER_ID },
    select: {
      accessToken: true,
      refreshToken: true,
      accessTokenExpiresAt: true,
    },
  });

  if (!account?.accessToken || !account?.refreshToken) {
    throw new Error('Google account not authorized. Please grant permissions via the Tools menu.');
  }

  oauth2Client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
  });

  const isExpired = !account.accessTokenExpiresAt || new Date(account.accessTokenExpiresAt) < new Date();
  if (isExpired) {
    await refreshAccessToken(userId, oauth2Client);
  }

  return { oauth2Client, userId };
}

export async function executeWithAuthRetry<T>(
  userId: string,
  operation: (oauth2Client: Auth.OAuth2Client) => Promise<T>
): Promise<T> {
  try {
    const { oauth2Client } = await createGoogleSuiteClient(userId);
    return await operation(oauth2Client);
  } catch (error) {
    const isAuthError = 
      (error as GaxiosError).response?.status === 401 ||
      (error as GaxiosError).response?.status === 403 ||
      (error as GaxiosError).response?.data?.error === 'invalid_grant' ||
      (error as GaxiosError).response?.data?.error_description?.includes('revoked') ||
      (error as Error).message?.includes('invalid_grant') ||
      (error as Error).message?.includes('revoked');
    
    if (isAuthError) {
      console.error('[Google OAuth] ✗ API call FAILED - auth revoked', {
        userId,
        status: (error as GaxiosError).response?.status,
        errorData: (error as GaxiosError).response?.data,
      });
      
      throw new Error(GOOGLE_AUTH_REVOKED_ERROR);
    }
    
    throw error;
  }
}
