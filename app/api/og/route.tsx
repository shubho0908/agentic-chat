import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const title = searchParams.get('title') || 'Agentic Chat';
    const truncatedTitle = title.length > 80 ? title.substring(0, 77) + '...' : title;

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            backgroundColor: '#0a0a0a',
            padding: '80px',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          {/* Gradient Background */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0.05) 100%)',
              opacity: 0.8,
            }}
          />

          {/* Content */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
              zIndex: 1,
              width: '100%',
            }}
          >
            {/* Logo/Icon */}
            <div
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '20px',
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(139, 92, 246, 0.1) 100%)',
                border: '2px solid rgba(139, 92, 246, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '40px',
              }}
            >
              💬
            </div>

            {/* Title */}
            <div
              style={{
                fontSize: '64px',
                fontWeight: '700',
                color: '#ffffff',
                lineHeight: 1.2,
                letterSpacing: '-0.02em',
                maxWidth: '90%',
                wordWrap: 'break-word',
              }}
            >
              {truncatedTitle}
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              zIndex: 1,
            }}
          >
            <div
              style={{
                fontSize: '28px',
                color: '#a1a1aa',
                fontWeight: '500',
              }}
            >
              Agentic Chat
            </div>
            <div
              style={{
                fontSize: '24px',
                color: '#71717a',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              Intelligent Conversations
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (e: unknown) {
    console.error('Error generating OG image:', e);
    return new Response('Failed to generate image', { status: 500 });
  }
}
