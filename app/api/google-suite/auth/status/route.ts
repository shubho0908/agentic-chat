import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getAuthenticatedUser } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import type { GoogleAuthorizationStatus } from '@/types/google-suite';
import { GOOGLE_SUITE_PROVIDER_ID, SCOPE_GROUPS } from '@/lib/tools/google-suite/scopes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse<GoogleAuthorizationStatus | { error: string }>> {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) {
      return error;
    }

    const account = await prisma.account.findFirst({
      where: {
        userId: user.id,
        providerId: GOOGLE_SUITE_PROVIDER_ID,
        accessToken: { not: null },
        refreshToken: { not: null },
      },
      select: {
        scope: true,
        accessTokenExpiresAt: true,
      },
    });

    if (!account) {
      return NextResponse.json<GoogleAuthorizationStatus>({
        authorized: false,
        reason: 'no_google_account',
        message: 'No Google account connected. Please authorize Gmail access.',
      });
    }

    const grantedScopes = account.scope?.split(' ') || [];
    
    const requiredScopes = SCOPE_GROUPS.GMAIL;
    const missingScopes = requiredScopes.filter(
      scope => !grantedScopes.includes(scope)
    );

    if (missingScopes.length > 0) {
      return NextResponse.json<GoogleAuthorizationStatus>({
        authorized: false,
        reason: 'missing_scopes',
        message: 'Additional permissions required',
        missingScopes: [...missingScopes],
      });
    }

    const isExpired = account.accessTokenExpiresAt 
      ? new Date(account.accessTokenExpiresAt) < new Date()
      : true;

    return NextResponse.json<GoogleAuthorizationStatus>({
      authorized: true,
      needsRefresh: isExpired,
      expiresAt: account.accessTokenExpiresAt,
    });
  } catch (error) {
    console.error('[Google Suite Auth Status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to check authorization status' },
      { status: 500 }
    );
  }
}
