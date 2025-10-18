import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getAuthenticatedUser } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import type { GoogleAuthorizationStatus } from '@/types/google-suite';
import { GOOGLE_PROVIDER_ID, SCOPE_GROUPS } from '@/lib/tools/google-suite/scopes';
import { validateGoogleToken } from '@/lib/tools/google-suite/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse<GoogleAuthorizationStatus | { error: string }>> {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const account = await prisma.account.findFirst({
      where: { userId: user.id, providerId: GOOGLE_PROVIDER_ID },
      select: {
        accessToken: true,
        refreshToken: true,
      },
    });

    if (!account) {
      return NextResponse.json<GoogleAuthorizationStatus>({
        authorized: false,
        reason: 'no_google_account',
        message: 'Please sign in with Google first.',
      });
    }

    if (!account.accessToken || !account.refreshToken) {
      return NextResponse.json<GoogleAuthorizationStatus>({
        authorized: false,
        reason: 'no_tokens',
        message: 'Please re-authorize to refresh your Google credentials.',
      });
    }

    const validationResult = await validateGoogleToken(user.id);

    if (!validationResult.isValid) {
      console.warn('[Google Suite Auth Status] Token validation FAILED at Google:', validationResult.error);
      return NextResponse.json<GoogleAuthorizationStatus>({
        authorized: false,
        reason: 'token_invalid',
        message: validationResult.error || 'Your Google authorization has expired or been revoked. Please re-authorize.',
      });
    }

    const grantedScopes = new Set(validationResult.scopes || []);
    const requiredScopes = SCOPE_GROUPS.WORKSPACE;
    const missingScopes = requiredScopes.filter(scope => !grantedScopes.has(scope));

    if (missingScopes.length > 0) {
      console.warn('[Google Suite Auth Status] User missing required scopes from Google:', {
        userId: user.id,
        grantedCount: grantedScopes.size,
        missingCount: missingScopes.length,
        missing: missingScopes,
      });
      return NextResponse.json<GoogleAuthorizationStatus>({
        authorized: false,
        reason: 'permissions_needed',
        message: 'Additional Google Workspace permissions required. Click to grant access to Gmail, Drive, Calendar, Docs, Sheets, and Slides.',
        missingScopes,
      });
    }

    return NextResponse.json<GoogleAuthorizationStatus>({
      authorized: true,
      needsRefresh: validationResult.needsRefresh,
      expiresAt: validationResult.expiresAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error('[Google Suite Auth Status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to check authorization status' },
      { status: 500 }
    );
  }
}
