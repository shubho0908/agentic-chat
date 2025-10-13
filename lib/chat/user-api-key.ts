import { prisma } from '@/lib/prisma';
import { decryptApiKey } from '@/lib/encryption';
import { errorResponse } from '@/lib/api-utils';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';

export async function getUserApiKey(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { encryptedApiKey: true },
  });

  if (!user?.encryptedApiKey) {
    return {
      apiKey: null,
      error: errorResponse(
        API_ERROR_MESSAGES.API_KEY_NOT_CONFIGURED,
        undefined,
        HTTP_STATUS.BAD_REQUEST
      ),
    };
  }

  const apiKey = decryptApiKey(user.encryptedApiKey);

  return { apiKey, error: null };
}
