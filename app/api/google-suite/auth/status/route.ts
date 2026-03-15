import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getAuthenticatedUser } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import type { GoogleAuthorizationStatus } from '@/types/google-suite';
import { GOOGLE_PROVIDER_ID, getGrantedGoogleScopes, getMissingGoogleWorkspaceScopes } from '@/lib/tools/google-suite/scopes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse<GoogleAuthorizationStatus | { error: string }>> {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const account = await prisma.account.findFirst({
      where: { userId: user.id, providerId: GOOGLE_PROVIDER_ID },
      orderBy: { updatedAt: 'desc' },
      select: {
        accessToken: true,
        refreshToken: true,
        scope: true,
      },
    });

    if (!account) {
      return NextResponse.json<GoogleAuthorizationStatus>({
        authorized: false,
        reason: 'no_google_account',
        message: 'Please sign in with Google to use Google Workspace tools.',
      });
    }

    if (!account.accessToken || !account.refreshToken) {
      return NextResponse.json<GoogleAuthorizationStatus>({
        authorized: false,
        reason: 'no_tokens',
        message: 'Please sign out and sign in again with Google to refresh your credentials.',
      });
    }

    const missingScopes = getMissingGoogleWorkspaceScopes(account.scope);
    const grantedScopes = Array.from(getGrantedGoogleScopes(account.scope));

    if (missingScopes.length > 0) {
      return NextResponse.json<GoogleAuthorizationStatus>({
        authorized: false,
        reason: 'permissions_needed',
        message: 'Grant Google Workspace permissions to use Gmail, Drive, Calendar, Docs, Sheets, and Slides tools.',
        missingScopes,
        grantedScopes,
      });
    }

    return NextResponse.json<GoogleAuthorizationStatus>({
      authorized: true,
      grantedScopes,
    });
  } catch (error) {
    console.error('[Google Suite Auth Status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to check authorization status' },
      { status: 500 }
    );
  }
}
