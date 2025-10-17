import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getAuthenticatedUser } from '@/lib/api-utils';
import type { GoogleAuthorizationUrl } from '@/types/google-suite';
import { ALL_GOOGLE_SUITE_SCOPES } from '@/lib/tools/google-suite/scopes';
import { createOAuth2Client } from '@/lib/tools/google-suite/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse<GoogleAuthorizationUrl | { error: string }>> {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) {
      return error;
    }

    const oauth2Client = createOAuth2Client();

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ALL_GOOGLE_SUITE_SCOPES,
      prompt: 'consent',
      state: user.id,
    });

    return NextResponse.json<GoogleAuthorizationUrl>({ authUrl });
  } catch (error) {
    console.error('[Google Suite Authorize] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate authorization URL' },
      { status: 500 }
    );
  }
}
