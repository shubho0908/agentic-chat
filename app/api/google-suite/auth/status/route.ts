import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getAuthenticatedUser } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import type { GoogleAuthorizationStatus } from '@/types/google-suite';
import {
  GOOGLE_PROVIDER_ID,
  getGrantedGoogleScopes,
  getMissingGoogleWorkspaceScopes,
  hasAnyGoogleWorkspaceScopes,
} from '@/lib/tools/google-suite/scopes';
import { getGoogleWorkspaceOAuthReadiness } from '@/lib/tools/google-suite/oauth-readiness';
import { isAuthRevokedError, synchronizeGoogleAccount } from '@/lib/tools/google-suite/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse<GoogleAuthorizationStatus | { error: string }>> {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const account = await prisma.account.findFirst({
      where: { userId: user.id, providerId: GOOGLE_PROVIDER_ID },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, scope: true },
    });

    if (!account) {
      const oauthReadiness = getGoogleWorkspaceOAuthReadiness(user.email);

      return NextResponse.json<GoogleAuthorizationStatus>({
        authorized: false,
        connected: false,
        workspaceConnected: false,
        oauthConsentReady: oauthReadiness.ready,
        oauthConsentMessage: oauthReadiness.message,
        reason: 'no_google_account',
        message: 'Please sign in with Google to use Google Workspace tools.',
      });
    }

    const oauthReadiness = getGoogleWorkspaceOAuthReadiness(user.email);
    let synchronizedAccount;

    try {
      synchronizedAccount = await synchronizeGoogleAccount(user.id);
    } catch (syncError) {
      if (isAuthRevokedError(syncError)) {
        await prisma.account.update({
          where: { id: account.id },
          data: {
            accessToken: null,
            refreshToken: null,
            accessTokenExpiresAt: null,
            refreshTokenExpiresAt: null,
          },
        });

        return NextResponse.json<GoogleAuthorizationStatus>({
          authorized: false,
          connected: true,
          workspaceConnected: false,
          oauthConsentReady: oauthReadiness.ready,
          oauthConsentMessage: oauthReadiness.message,
          reason: 'token_invalid',
          message: 'Google Workspace access expired or was revoked. Reconnect the apps you want in Settings.',
          grantedScopes: [],
          configuredScopes: Array.from(getGrantedGoogleScopes(account.scope)),
          missingScopes: getMissingGoogleWorkspaceScopes(null),
        });
      }

      throw syncError;
    }

    const scope = synchronizedAccount?.scope ?? null;
    const workspaceConnected = Boolean(
      synchronizedAccount?.accessToken && synchronizedAccount?.refreshToken
    );
    const configuredScopes = Array.from(getGrantedGoogleScopes(scope));
    const grantedScopes = workspaceConnected ? configuredScopes : [];
    const missingScopes = workspaceConnected
      ? getMissingGoogleWorkspaceScopes(scope)
      : getMissingGoogleWorkspaceScopes(null);
    const hasWorkspaceScopes = hasAnyGoogleWorkspaceScopes(scope);
    const accessLevel = !workspaceConnected || !hasWorkspaceScopes
      ? 'none'
      : missingScopes.length > 0
        ? 'partial'
        : 'full';

    if (!synchronizedAccount?.accessToken || !synchronizedAccount?.refreshToken) {
      return NextResponse.json<GoogleAuthorizationStatus>({
        authorized: false,
        connected: true,
        workspaceConnected: false,
        hasWorkspaceAccess: hasWorkspaceScopes,
        accessLevel: 'none',
        oauthConsentReady: oauthReadiness.ready,
        oauthConsentMessage: oauthReadiness.message,
        reason: 'no_tokens',
        message: hasWorkspaceScopes
          ? 'Reconnect Google Workspace access in Settings to keep using your selected tools.'
          : 'Choose Google Workspace permissions in Settings before using Gmail, Drive, Calendar, Docs, Sheets, or Slides.',
        grantedScopes,
        configuredScopes,
        missingScopes,
      });
    }

    if (!hasWorkspaceScopes) {
      return NextResponse.json<GoogleAuthorizationStatus>({
        authorized: false,
        connected: true,
        workspaceConnected,
        hasWorkspaceAccess: false,
        accessLevel,
        oauthConsentReady: oauthReadiness.ready,
        oauthConsentMessage: oauthReadiness.message,
        reason: 'permissions_needed',
        message: 'Choose Google Workspace permissions in Settings before using Gmail, Drive, Calendar, Docs, Sheets, or Slides.',
        missingScopes,
        grantedScopes,
        configuredScopes,
      });
    }

    return NextResponse.json<GoogleAuthorizationStatus>({
      authorized: true,
      connected: true,
      workspaceConnected,
      hasWorkspaceAccess: true,
      accessLevel,
      oauthConsentReady: oauthReadiness.ready,
      oauthConsentMessage: oauthReadiness.message,
      message:
        accessLevel === 'full'
          ? 'Google Workspace access is ready for all supported apps.'
          : 'Google Workspace access is ready for the apps you selected.',
      missingScopes,
      grantedScopes,
      configuredScopes,
    });
  } catch (error) {
    console.error('[Google Suite Auth Status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to check authorization status' },
      { status: 500 }
    );
  }
}
