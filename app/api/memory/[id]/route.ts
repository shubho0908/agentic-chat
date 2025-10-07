import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { getAuthenticatedUser, jsonResponse, errorResponse } from '@/lib/api-utils';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { deleteMemory, updateMemory } from '@/lib/memory-conversation-context';
import { updateMemorySchema } from '@/lib/schemas/memory';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const { id } = await params;
    const success = await deleteMemory(id);

    if (!success) {
      return errorResponse(
        'Failed to delete memory',
        'Memory not found or could not be deleted',
        HTTP_STATUS.NOT_FOUND
      );
    }

    return jsonResponse({ success: true, message: 'Memory deleted successfully' });
  } catch (error) {
    return errorResponse(
      API_ERROR_MESSAGES.MEMORY_DELETE_FAILED,
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const { id } = await params;
    const body = await request.json();
    const validation = updateMemorySchema.safeParse(body);

    if (!validation.success) {
      return jsonResponse(
        { error: API_ERROR_MESSAGES.INVALID_REQUEST_BODY, details: validation.error.issues },
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const { memory } = validation.data;
    const success = await updateMemory(id, memory, user.id);

    if (!success) {
      return errorResponse(
        'Failed to update memory',
        'Memory not found or could not be updated',
        HTTP_STATUS.NOT_FOUND
      );
    }

    return jsonResponse({ success: true, message: 'Memory updated successfully' });
  } catch (error) {
    return errorResponse(
      API_ERROR_MESSAGES.MEMORY_UPDATE_FAILED,
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
