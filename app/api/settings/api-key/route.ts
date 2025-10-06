import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encryptApiKey, decryptApiKey, maskApiKey } from '@/lib/encryption';
import { headers } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { apiKey } = await request.json();

    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 400 }
      );
    }

    const openaiKeyRegex = /^sk-(proj-|svcacct-)?[A-Za-z0-9_-]{20,}$/;
    if (!openaiKeyRegex.test(apiKey.trim())) {
      return NextResponse.json(
        { error: 'Invalid OpenAI API key format' },
        { status: 400 }
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
      { error: 'Failed to save API key' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
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
      { error: 'Failed to retrieve API key status' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
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
      { error: 'Failed to delete API key' },
      { status: 500 }
    );
  }
}
