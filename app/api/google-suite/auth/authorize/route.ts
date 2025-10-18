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

    // Generate cryptographic nonce for CSRF protection
    const nonce = randomBytes(32).toString('hex');
    
    // Combine nonce and user ID for state parameter
    const state = `${nonce}:${user.id}`;

    const oauth2Client = createOAuth2Client();

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ALL_GOOGLE_SUITE_SCOPES,
      prompt: 'consent',
      state,
    });

    const response = NextResponse.json<GoogleAuthorizationUrl>({ authUrl });
    
    // Store nonce in secure, HttpOnly cookie with short TTL (10 minutes)
    response.cookies.set('gsuite_oauth_state', nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
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
