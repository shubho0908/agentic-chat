import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getAuthenticatedUser } from '@/lib/apiUtils';
import { prisma } from '@/lib/prisma';
import type { GoogleAuthorizationStatus } from '@/types/googleSuite';
import {

  GOOGLE_PROVIDER_ID,
  getGrantedGoogleScopes,
  getMissingGoogleWorkspaceScopes,
  hasAnyGoogleWorkspaceScopes,
} from '@/lib/tools/google-suite/scopes';
import { getGoogleWorkspaceOAuthReadiness } from '@/lib/tools/google-suite/oauthReadiness';
import { logger } from "@/lib/logger";
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse<GoogleAuthorizationStatus | { error: string }>> {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const account = await prisma.account.findFirst({
      where: { userId: user.id, providerId: GOOGLE_PROVIDER_ID },
      orderBy: { updatedAt: 'desc' },
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
    const scope = account.scope;
    const workspaceConnected = Boolean(account.accessToken && account.refreshToken);
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

    if (!account.accessToken || !account.refreshToken) {
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
    logger.error('[Google Suite Auth Status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to check authorization status' },
      { status: 500 }
    );
  }
}
