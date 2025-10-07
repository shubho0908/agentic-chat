import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encryptApiKey, decryptApiKey, maskApiKey } from '@/lib/encryption';
import { headers } from 'next/headers';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { VALIDATION_LIMITS } from '@/constants/validation';
import { errorResponse, jsonResponse } from '@/lib/api-utils';

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    
    if (!session?.user) {
      return errorResponse(API_ERROR_MESSAGES.UNAUTHORIZED, undefined, HTTP_STATUS.UNAUTHORIZED);
    }

    const { apiKey } = await request.json();

    if (!apiKey || typeof apiKey !== 'string') {
      return errorResponse(API_ERROR_MESSAGES.INVALID_API_KEY, undefined, HTTP_STATUS.BAD_REQUEST);
    }

    if (apiKey.length > VALIDATION_LIMITS.API_KEY_MAX_LENGTH) {
      return errorResponse(API_ERROR_MESSAGES.PAYLOAD_TOO_LARGE, undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const openaiKeyRegex = /^sk-(proj-|svcacct-)?[A-Za-z0-9_-]{20,}$/;
    if (!openaiKeyRegex.test(apiKey.trim())) {
      return errorResponse(API_ERROR_MESSAGES.INVALID_API_KEY_FORMAT, undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const encrypted = encryptApiKey(apiKey);

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        encryptedApiKey: encrypted,
        apiKeyUpdatedAt: new Date(),
      },
    });

    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(
      API_ERROR_MESSAGES.FAILED_SAVE_API_KEY,
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    
    if (!session?.user) {
      return errorResponse(API_ERROR_MESSAGES.UNAUTHORIZED, undefined, HTTP_STATUS.UNAUTHORIZED);
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { 
        encryptedApiKey: true,
        apiKeyUpdatedAt: true,
      },
    });

    if (!user?.encryptedApiKey) {
      return jsonResponse({ 
        exists: false, 
        maskedKey: null,
        updatedAt: null,
      });
    }

    const decrypted = decryptApiKey(user.encryptedApiKey);
    const masked = maskApiKey(decrypted);

    return jsonResponse({
      exists: true,
      maskedKey: masked,
      updatedAt: user.apiKeyUpdatedAt,
    });
  } catch (error) {
    return errorResponse(
      API_ERROR_MESSAGES.FAILED_RETRIEVE_API_KEY,
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

export async function DELETE() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    
    if (!session?.user) {
      return errorResponse(API_ERROR_MESSAGES.UNAUTHORIZED, undefined, HTTP_STATUS.UNAUTHORIZED);
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        encryptedApiKey: null,
        apiKeyUpdatedAt: null,
      },
    });

    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(
      API_ERROR_MESSAGES.FAILED_DELETE_API_KEY,
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
