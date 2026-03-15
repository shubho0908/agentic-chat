import { google, type Auth } from 'googleapis';
import { GaxiosError } from 'gaxios';
import { decodeJwt } from 'jose';
import { prisma } from '@/lib/prisma';
import { TOOL_ERROR_MESSAGES } from '@/constants/errors';
import { GOOGLE_PROVIDER_ID, GOOGLE_SIGN_IN_SCOPES } from './scopes';
import { appBaseUrl } from '@/lib/appUrl';

interface GoogleSuiteClientContext {
  oauth2Client: Auth.OAuth2Client;
  userId: string;
}

interface SynchronizedGoogleAccount {
  id: string;
  accountId: string;
  userId: string;
  accessToken: string | null;
  refreshToken: string | null;
  scope: string | null;
  grantedScopes: string[];
}

export const GOOGLE_ACCOUNT_MISMATCH_ERROR = 'GOOGLE_ACCOUNT_MISMATCH';
export const GOOGLE_ACCOUNT_LINKED_ERROR = 'GOOGLE_ACCOUNT_LINKED';

interface CodedGoogleWorkspaceError extends Error {
  code?: string;
}

export function createGoogleOAuth2Client(redirectUri = `${appBaseUrl}/api/auth/callback/google`): Auth.OAuth2Client {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !redirectUri) {
    throw new Error(TOOL_ERROR_MESSAGES.GOOGLE_SUITE.MISSING_OAUTH_CREDENTIALS);
  }
  
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

function createGoogleWorkspaceAuthError(code: string, message: string): Error {
  const error = new Error(message) as CodedGoogleWorkspaceError;
  error.name = code;
  error.code = code;
  return error;
}

export function getGoogleWorkspaceAuthErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const codedError = error as CodedGoogleWorkspaceError;

  if (typeof codedError.code === 'string') {
    return codedError.code;
  }

  return typeof codedError.name === 'string' ? codedError.name : null;
}

function normalizeGrantedScopes(scopes: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(scopes).map((scope) => scope.trim()).filter(Boolean))).sort();
}

function parseScopeValue(scope?: string | null): string[] {
  if (!scope) {
    return [];
  }

  return scope.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean);
}

function getJwtSubject(idToken?: string | null): string | null {
  if (!idToken) {
    return null;
  }

  try {
    const payload = decodeJwt(idToken);
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

async function resolveGoogleGrantedScopes(
  oauth2Client: Auth.OAuth2Client,
  accessToken: string,
  fallbackScope?: string | null
): Promise<string[]> {
  try {
    const tokenInfo = await oauth2Client.getTokenInfo(accessToken);
    return normalizeGrantedScopes(tokenInfo.scopes ?? []);
  } catch (error) {
    if (isAuthRevokedError(error)) {
      throw error;
    }

    console.warn('[Google Suite] Failed to resolve token info, falling back to stored scopes:', error);
    return normalizeGrantedScopes(parseScopeValue(fallbackScope));
  }
}

export async function synchronizeGoogleAccount(userId: string): Promise<SynchronizedGoogleAccount | null> {
  const account = await prisma.account.findFirst({
    where: { userId, providerId: GOOGLE_PROVIDER_ID },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      accountId: true,
      userId: true,
      accessToken: true,
      refreshToken: true,
      scope: true,
      idToken: true,
      accessTokenExpiresAt: true,
      refreshTokenExpiresAt: true,
    },
  });

  if (!account) {
    return null;
  }

  const oauth2Client = createGoogleOAuth2Client();
  let accessToken = account.accessToken;
  let refreshToken = account.refreshToken;
  let grantedScopes = normalizeGrantedScopes(parseScopeValue(account.scope));

  if (accessToken) {
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken ?? undefined,
    });

    try {
      grantedScopes = await resolveGoogleGrantedScopes(oauth2Client, accessToken, account.scope);
    } catch (error) {
      if (!refreshToken || isAuthRevokedError(error)) {
        throw error;
      }
    }
  }

  const hasOnlyStoredScopes = grantedScopes.length === 0 && Boolean(account.scope);
  const needsRefresh =
    !accessToken ||
    grantedScopes.length === 0 ||
    hasOnlyStoredScopes;

  if (refreshToken && needsRefresh) {
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const refreshed = await oauth2Client.refreshAccessToken();
    const credentials = refreshed.credentials;

    accessToken = credentials.access_token ?? accessToken;
    refreshToken = credentials.refresh_token ?? refreshToken;

    if (accessToken) {
      oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken ?? undefined,
      });

      const liveScopes = await resolveGoogleGrantedScopes(
        oauth2Client,
        accessToken,
        credentials.scope ?? account.scope
      );

      if (liveScopes.length > 0) {
        grantedScopes = liveScopes;
      }
    }

    await prisma.account.update({
      where: { id: account.id },
      data: {
        accessToken: accessToken ?? null,
        refreshToken: refreshToken ?? null,
        accessTokenExpiresAt: credentials.expiry_date
          ? new Date(credentials.expiry_date)
          : account.accessTokenExpiresAt,
        refreshTokenExpiresAt: account.refreshTokenExpiresAt,
        scope: normalizeGrantedScopes([
          ...grantedScopes,
          ...parseScopeValue(credentials.scope),
        ]).join(','),
        idToken: credentials.id_token ?? account.idToken,
      },
    });
  } else {
    const normalizedScope = grantedScopes.join(',');

    if ((account.scope ?? '') !== normalizedScope && normalizedScope) {
      await prisma.account.update({
        where: { id: account.id },
        data: { scope: normalizedScope },
      });
    }
  }

  return {
    id: account.id,
    accountId: account.accountId || getJwtSubject(account.idToken) || '',
    userId: account.userId,
    accessToken,
    refreshToken,
    scope: grantedScopes.join(','),
    grantedScopes,
  };
}

export async function persistGoogleWorkspaceGrant(params: {
  userId: string;
  redirectUri: string;
  code: string;
}): Promise<SynchronizedGoogleAccount> {
  const { userId, redirectUri, code } = params;
  const oauth2Client = createGoogleOAuth2Client(redirectUri);
  const existingAccount = await prisma.account.findFirst({
    where: { userId, providerId: GOOGLE_PROVIDER_ID },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      accountId: true,
      refreshToken: true,
      idToken: true,
      accessTokenExpiresAt: true,
      refreshTokenExpiresAt: true,
    },
  });

  const tokenResponse = await oauth2Client.getToken(code);
  const credentials = tokenResponse.tokens;
  const accessToken = credentials.access_token ?? null;
  const refreshToken = credentials.refresh_token ?? existingAccount?.refreshToken ?? null;

  if (!accessToken) {
    throw new Error('Google did not return an access token');
  }

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken ?? undefined,
  });

  const grantedScopes = normalizeGrantedScopes([
    ...parseScopeValue(credentials.scope),
    ...await resolveGoogleGrantedScopes(oauth2Client, accessToken, credentials.scope),
  ]);
  const incomingAccountId =
    getJwtSubject(credentials.id_token) ||
    getJwtSubject(existingAccount?.idToken) ||
    '';

  if (
    existingAccount?.accountId &&
    incomingAccountId &&
    existingAccount.accountId !== incomingAccountId
  ) {
    throw createGoogleWorkspaceAuthError(
      GOOGLE_ACCOUNT_MISMATCH_ERROR,
      'Google Workspace reconnect must use the same Google account.'
    );
  }

  if (incomingAccountId) {
    const linkedAccount = await prisma.account.findFirst({
      where: {
        providerId: GOOGLE_PROVIDER_ID,
        accountId: incomingAccountId,
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (linkedAccount && linkedAccount.userId !== userId) {
      throw createGoogleWorkspaceAuthError(
        GOOGLE_ACCOUNT_LINKED_ERROR,
        'That Google account is already linked to another user.'
      );
    }
  }

  const accountId =
    incomingAccountId ||
    existingAccount?.accountId ||
    '';

  if (!accountId) {
    throw new Error('Unable to determine Google account identifier');
  }

  const data = {
    userId,
    providerId: GOOGLE_PROVIDER_ID,
    accountId,
    accessToken,
    refreshToken,
    idToken: credentials.id_token ?? existingAccount?.idToken ?? null,
    accessTokenExpiresAt: credentials.expiry_date
      ? new Date(credentials.expiry_date)
      : existingAccount?.accessTokenExpiresAt ?? null,
    refreshTokenExpiresAt: existingAccount?.refreshTokenExpiresAt ?? null,
    scope: grantedScopes.join(','),
  };

  if (existingAccount?.id) {
    await prisma.account.update({
      where: { id: existingAccount.id },
      data,
    });
  } else {
    await prisma.account.create({ data });
  }

  return {
    id: existingAccount?.id ?? '',
    accountId,
    userId,
    accessToken,
    refreshToken,
    scope: grantedScopes.join(','),
    grantedScopes,
  };
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
  const account = await synchronizeGoogleAccount(userId);

  if (!account?.accessToken || !account?.refreshToken) {
    throw new Error(TOOL_ERROR_MESSAGES.GOOGLE_SUITE.AUTH_REQUIRED_MENU);
  }

  const oauth2Client = createGoogleOAuth2Client();
  
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
          ...(tokens.scope
            ? { scope: normalizeGrantedScopes(parseScopeValue(tokens.scope)).join(',') }
            : {}),
        },
      });
    }
  });

  return { oauth2Client, userId };
}

export async function revokeGoogleWorkspaceAccess(userId: string): Promise<void> {
  const account = await prisma.account.findFirst({
    where: { userId, providerId: GOOGLE_PROVIDER_ID },
    orderBy: { updatedAt: 'desc' },
    select: {
      accessToken: true,
      refreshToken: true,
    },
  });

  if (!account) {
    return;
  }

  const oauth2Client = createGoogleOAuth2Client();
  const tokensToRevoke = [account.refreshToken, account.accessToken].filter(Boolean) as string[];

  for (const token of tokensToRevoke) {
    try {
      await oauth2Client.revokeToken(token);
    } catch (error) {
      console.warn('[Google Suite] Failed to revoke token:', error);
    }
  }

  await prisma.account.updateMany({
    where: { userId, providerId: GOOGLE_PROVIDER_ID },
    data: {
      accessToken: null,
      refreshToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      scope: GOOGLE_SIGN_IN_SCOPES.join(','),
    },
  });
}
