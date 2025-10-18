import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { randomBytes } from 'crypto';
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

    const nonce = randomBytes(32).toString('hex');
    
    const state = `${nonce}:${user.id}`;

    const oauth2Client = createOAuth2Client();

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ALL_GOOGLE_SUITE_SCOPES,
      prompt: 'consent',
      include_granted_scopes: true,
      state,
    });

    const response = NextResponse.json<GoogleAuthorizationUrl>({ authUrl });
    
    response.cookies.set('gsuite_oauth_state', nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
      path: '/api/google-suite/auth/callback',
    });

    return response;
  } catch (error) {
    console.error('[Google Suite Authorize] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate authorization URL' },
      { status: 500 }
    );
  }
}
