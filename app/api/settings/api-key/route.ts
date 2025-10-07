import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encryptApiKey, decryptApiKey, maskApiKey } from '@/lib/encryption';
import { headers } from 'next/headers';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { VALIDATION_LIMITS } from '@/constants/validation';

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    
    if (!session?.user) {
      return NextResponse.json(
        { error: API_ERROR_MESSAGES.UNAUTHORIZED },
        { status: HTTP_STATUS.UNAUTHORIZED }
      );
    }

    const { apiKey } = await request.json();

    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json(
        { error: API_ERROR_MESSAGES.INVALID_API_KEY },
        { status: HTTP_STATUS.BAD_REQUEST }
      );
    }

    if (apiKey.length > VALIDATION_LIMITS.API_KEY_MAX_LENGTH) {
      return NextResponse.json(
        { error: API_ERROR_MESSAGES.PAYLOAD_TOO_LARGE },
        { status: HTTP_STATUS.BAD_REQUEST }
      );
    }

    const openaiKeyRegex = /^sk-(proj-|svcacct-)?[A-Za-z0-9_-]{20,}$/;
    if (!openaiKeyRegex.test(apiKey.trim())) {
      return NextResponse.json(
        { error: API_ERROR_MESSAGES.INVALID_API_KEY_FORMAT },
        { status: HTTP_STATUS.BAD_REQUEST }
      );
    }

    const encrypted = encryptApiKey(apiKey);

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        encryptedApiKey: encrypted,
        apiKeyUpdatedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: API_ERROR_MESSAGES.FAILED_SAVE_API_KEY },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
    );
  }
}

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    
    if (!session?.user) {
      return NextResponse.json(
        { error: API_ERROR_MESSAGES.UNAUTHORIZED },
        { status: HTTP_STATUS.UNAUTHORIZED }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { 
        encryptedApiKey: true,
        apiKeyUpdatedAt: true,
      },
    });

    if (!user?.encryptedApiKey) {
      return NextResponse.json(
        { 
          exists: false, 
          maskedKey: null,
          updatedAt: null,
        },
        { status: 200 }
      );
    }

    const decrypted = decryptApiKey(user.encryptedApiKey);
    const masked = maskApiKey(decrypted);

    return NextResponse.json({
      exists: true,
      maskedKey: masked,
      updatedAt: user.apiKeyUpdatedAt,
    });
  } catch {
    return NextResponse.json(
      { error: API_ERROR_MESSAGES.FAILED_RETRIEVE_API_KEY },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
    );
  }
}

export async function DELETE() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    
    if (!session?.user) {
      return NextResponse.json(
        { error: API_ERROR_MESSAGES.UNAUTHORIZED },
        { status: HTTP_STATUS.UNAUTHORIZED }
      );
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        encryptedApiKey: null,
        apiKeyUpdatedAt: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: API_ERROR_MESSAGES.FAILED_DELETE_API_KEY },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
    );
  }
}
