
import { logger } from "@/lib/logger";

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';

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
            fontFamily: 'Helvetica, Arial, sans-serif',
          }}
        >
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

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
              zIndex: 1,
              width: '100%',
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="80" height="80">
              <defs>
                <linearGradient id="g1" x1="15.72" x2="84.51" y1="2.586" y2="97.11" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#7CC3FF" offset="0" />
                  <stop stopColor="#066BFA" offset="1" />
                </linearGradient>
                <linearGradient id="g2" x1="97.91" x2="1.734" y1="49.67" y2="49.67" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#135DCD" offset="0" />
                  <stop stopColor="#1569DF" stopOpacity="0.3" offset="1" />
                </linearGradient>
              </defs>
              <path fill="url(#g1)" d="m77.6 0.7h-55.2c-11.6 0-20.9 9.6-20.9 21.4v55.2c0 11.7 9.3 21.3 20.9 21.3h55.2c11.4 0 20.7-9.6 20.7-21.3v-55.2c0-11.8-9.3-21.4-20.7-21.4z" />
              <path fill="url(#g2)" d="m77.6 0.7h-55.2c-11.5 0-20.9 9.6-20.9 21.4v55.2c0 11.7 9.4 21.3 20.9 21.3h55.2c11.4 0 20.7-9.6 20.7-21.3v-55.2c0-11.8-9.3-21.4-20.7-21.4zm19.4 76.2c0 10.9-8.3 20.4-19.4 20.8h-55.2c-10.8 0-20.1-9.1-20.1-20.4v-55.2c0-10.9 9-20.6 20.1-20.6h55.2c10.7 0 19.4 9.3 19.4 20.6v54.8z" />
              <path fill="#FFFFFF" d="m67 48.1c-5.2-1.8-7.9-5.1-9-9.4-0.5-2.2-3.7-2.9-4.5 0-0.8 3.9-3.7 7.6-8.5 9.3-2.5 0.7-2.5 4 0 4.5 4.8 1.6 7 4.3 8.4 8.8 0.9 2.5 3.8 2.6 4.5 0.1 1.5-4.3 4.3-7.1 9-8.8 2.3-0.5 2.5-3.6 0.1-4.5z" />
              <path fill="#FFFFFF" d="m67 68.8c-1.8 0.7-6.9 3.6-16.1 4.2-3.3 0.1-7-0.4-10.2-1.6-0.9-0.4-2-0.6-2.8 0-1.9 1-4.8 2.2-7.9 2.9 0.9-1.7 1.8-4.4 1.9-7.4 0-0.5-0.2-1.6-0.7-2-3.9-4.1-7-9.1-7-15.4-0.1-9.8 9.9-22.6 26.4-22.8 5 0 8.8 0.9 12.6 2.2 1.7 0.6 2.7-1.3 1.3-2.2-3.1-2.3-7.8-4-14.5-4.1-13-0.1-30 8.8-30.5 26.1 0 6.9 2.6 12.7 6.8 17.7 1.3 0.9-0.6 5.3-2.6 10-0.7 1.7 0.7 3.1 2.2 3 4.8-0.4 8.8-1.6 12.8-3.4 0.5-0.3 0.9-0.4 1.6-0.1 8.2 2.2 19.6 2.2 28-4.6 1.6-1.2 0.4-3.3-1.3-2.5z" />
            </svg>

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
              Search, memory, and tools
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        headers: {
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        },
      }
    );
  } catch (e: unknown) {
    logger.error('Error generating OG image:', e);
    return new Response(API_ERROR_MESSAGES.OG_IMAGE_GENERATION_FAILED, {
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    });
  }
}
