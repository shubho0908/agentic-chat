import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { GOOGLE_SUITE_PROVIDER_ID } from '@/lib/tools/google-suite/scopes';
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

    const userId = state;

    const oauth2Client = createOAuth2Client();

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}?gsuite_auth=error&reason=no_tokens`
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

    const primaryAccount = await prisma.account.findFirst({
      where: { userId, providerId: 'google' },
      select: { accountId: true },
    });

    if (primaryAccount && primaryAccount.accountId !== userInfo.id) {
      console.warn(
        `[Google Suite Callback] Account mismatch for user ${userId}: expected ${primaryAccount.accountId}, got ${userInfo.id}`
      );
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}?gsuite_auth=error&reason=account_mismatch`
      );
    }

    await prisma.account.upsert({
      where: {
        providerId_accountId: {
          providerId: GOOGLE_SUITE_PROVIDER_ID,
          accountId: userInfo.id,
        },
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        accessTokenExpiresAt: expiresAt,
        scope: tokens.scope,
      },
      create: {
        providerId: GOOGLE_SUITE_PROVIDER_ID,
        accountId: userInfo.id,
        userId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        accessTokenExpiresAt: expiresAt,
        scope: tokens.scope,
      },
    });

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}?gsuite_auth=success`
    );
  } catch (error) {
    console.error('[Google Suite Callback] Error:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}?gsuite_auth=error&reason=processing_failed`
    );
  }
}
