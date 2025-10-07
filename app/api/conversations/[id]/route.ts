import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';
import { getAuthenticatedUser, verifyConversationOwnership, paginateResults } from '@/lib/api-utils';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const { id: conversationId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50');
    const cursor = searchParams.get('cursor');

    const { conversation, error: convError } = await verifyConversationOwnership(conversationId, user.id);
    if (convError) return convError;

    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 })
    });

    // Transform role to lowercase for frontend compatibility
    const transformedMessages = messages.map(msg => ({
      ...msg,
      role: msg.role.toLowerCase()
    }));

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        isPublic: conversation.isPublic,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt
      },
      messages: paginateResults(transformedMessages, limit)
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return NextResponse.json(
      { error: API_ERROR_MESSAGES.FAILED_FETCH_CONVERSATION },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
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

    const { id: conversationId } = await params;
    const body = await request.json();
    const { title, isPublic } = body;

    // At least one field must be provided
    if (title === undefined && isPublic === undefined) {
      return NextResponse.json(
        { error: API_ERROR_MESSAGES.INVALID_REQUEST_BODY },
        { status: HTTP_STATUS.BAD_REQUEST }
      );
    }

    // Build update data
    const updateData: { title?: string; isPublic?: boolean } = {};
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        return NextResponse.json(
          { error: API_ERROR_MESSAGES.TITLE_REQUIRED },
          { status: HTTP_STATUS.BAD_REQUEST }
        );
      }
      updateData.title = title.trim();
    }
    if (isPublic !== undefined) {
      if (typeof isPublic !== 'boolean') {
        return NextResponse.json(
          { error: API_ERROR_MESSAGES.INVALID_REQUEST_BODY },
          { status: HTTP_STATUS.BAD_REQUEST }
        );
      }
      updateData.isPublic = isPublic;
    }

    const updatedConversation = await prisma.conversation.update({
      where: {
        id: conversationId,
        userId: user.id
      },
      data: updateData,
      select: {
        id: true,
        title: true,
        isPublic: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return NextResponse.json(updatedConversation);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return NextResponse.json(
        { error: API_ERROR_MESSAGES.CONVERSATION_NOT_FOUND },
        { status: HTTP_STATUS.NOT_FOUND }
      );
    }
    console.error('Error updating conversation:', error);
    return NextResponse.json(
      { error: API_ERROR_MESSAGES.FAILED_UPDATE_CONVERSATION },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const { id: conversationId } = await params;

    const conversation = await prisma.conversation.deleteMany({
      where: {
        id: conversationId,
        userId: user.id
      }
    });

    if (conversation.count === 0) {
      return NextResponse.json(
        { error: API_ERROR_MESSAGES.CONVERSATION_NOT_FOUND },
        { status: HTTP_STATUS.NOT_FOUND }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return NextResponse.json(
      { error: API_ERROR_MESSAGES.FAILED_DELETE_CONVERSATION },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
    );
  }
}
