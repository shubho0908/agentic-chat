import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getAuthenticatedUser, errorResponse } from '@/lib/api-utils';
import { checkDeepResearchUsage } from '@/lib/deep-research-usage';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) {
      return error;
    }

    const usageInfo = await checkDeepResearchUsage(user.id);

    return NextResponse.json(usageInfo, { status: HTTP_STATUS.OK });
  } catch (error) {
    console.error('[Deep Research Usage API] Error:', error);
    return errorResponse(
      API_ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
