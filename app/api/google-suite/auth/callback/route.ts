import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/api-utils';
import { GOOGLE_PROVIDER_ID, ALL_GOOGLE_SUITE_SCOPES } from '@/lib/tools/google-suite/scopes';
import { createOAuth2Client } from '@/lib/tools/google-suite/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}?gsuite_auth=error&reason=${error}`
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}?gsuite_auth=error&reason=missing_params`
      );
    }

    const stateParts = state.split(':');
    if (stateParts.length !== 2) {
      console.error('[Google Suite Callback] Invalid state format');
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}?gsuite_auth=error&reason=invalid_state`
      );
    }

    const [receivedNonce, stateUserId] = stateParts;

    const storedNonce = request.cookies.get('gsuite_oauth_state')?.value;

    if (!storedNonce) {
      console.error('[Google Suite Callback] Missing OAuth state cookie');
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}?gsuite_auth=error&reason=missing_state`
      );
    }

    if (receivedNonce !== storedNonce) {
      console.error('[Google Suite Callback] OAuth state mismatch - possible CSRF attack');
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}?gsuite_auth=error&reason=state_mismatch`
      );
    }

    const { user, error: authError } = await getAuthenticatedUser(await headers());
    if (authError || !user) {
      console.error('[Google Suite Callback] User not authenticated');
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}?gsuite_auth=error&reason=not_authenticated`
      );
    }

    if (user.id !== stateUserId) {
      console.error('[Google Suite Callback] User ID mismatch - authenticated user does not match state');
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}?gsuite_auth=error&reason=user_mismatch`
      );
    }

    const userId = user.id;

    const oauth2Client = createOAuth2Client();

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}?gsuite_auth=error&reason=no_access_token`
      );
    }

    oauth2Client.setCredentials(tokens);
    
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();
    
    if (!userInfo.id) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}?gsuite_auth=error&reason=no_user_info`
      );
    }

    const expiresAt = tokens.expiry_date 
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000);

    const existing = await prisma.account.findFirst({
      where: { userId, providerId: GOOGLE_PROVIDER_ID },
      select: { accountId: true, refreshToken: true },
    });

    if (existing?.accountId && existing.accountId !== userInfo.id) {
      console.warn(`[Google Suite Callback] Account mismatch: expected ${existing.accountId}, got ${userInfo.id}`);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}?gsuite_auth=error&reason=account_mismatch`
      );
    }

    if (!existing && !tokens.refresh_token) {
      console.error('[Google Suite Callback] No refresh token on first authorization');
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}?gsuite_auth=error&reason=no_refresh_token`
      );
    }

    const grantedScopes = new Set(tokens.scope?.split(' ') || []);
    const missingScopes = ALL_GOOGLE_SUITE_SCOPES.filter(scope => !grantedScopes.has(scope));
    
    if (missingScopes.length > 0) {
      console.warn('[Google Suite Callback] Not all required scopes were granted by Google:', {
        userId,
        granted: grantedScopes.size,
        missing: missingScopes.length,
        missingScopes,
      });
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}?gsuite_auth=error&reason=insufficient_permissions`
      );
    }

    await prisma.account.upsert({
      where: {
        providerId_accountId: {
          providerId: GOOGLE_PROVIDER_ID,
          accountId: userInfo.id,
        },
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? existing?.refreshToken,
        accessTokenExpiresAt: expiresAt,
        scope: tokens.scope,
      },
      create: {
        providerId: GOOGLE_PROVIDER_ID,
        accountId: userInfo.id,
        userId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        accessTokenExpiresAt: expiresAt,
        scope: tokens.scope,
      },
    });

    const response = NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}?gsuite_auth=success`
    );
    response.cookies.delete('gsuite_oauth_state');
    
    return response;
  } catch (error) {
    console.error('[Google Suite Callback] Error:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}?gsuite_auth=error&reason=processing_failed`
    );
  }
}
