import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getAuthenticatedUser } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import type { GoogleAuthorizationStatus } from '@/types/google-suite';
import { GOOGLE_PROVIDER_ID } from '@/lib/tools/google-suite/scopes';

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

    return NextResponse.json<GoogleAuthorizationStatus>({
      authorized: true,
    });
  } catch (error) {
    console.error('[Google Suite Auth Status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to check authorization status' },
      { status: 500 }
    );
  }
}
