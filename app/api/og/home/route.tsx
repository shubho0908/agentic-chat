
import { logger } from "@/lib/logger";

import { ImageResponse } from 'next/og';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';

export const runtime = 'edge';

const containerStyle = { height: '100%', width: '100%', display: 'flex', flexDirection: 'column' as const, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: '#0a0a0a', position: 'relative' as const, fontFamily: 'Helvetica, Arial, sans-serif', overflow: 'hidden' as const };
const bgGlowStyle = { position: 'absolute' as const, top: '-50%', left: '-50%', right: '-50%', bottom: '-50%', background: 'radial-gradient(circle at 30% 40%, rgba(139, 92, 246, 0.25) 0%, transparent 50%), radial-gradient(circle at 70% 60%, rgba(59, 130, 246, 0.2) 0%, transparent 50%)', opacity: 0.6 };
const gridStyle = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundImage: 'linear-gradient(rgba(139, 92, 246, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(139, 92, 246, 0.05) 1px, transparent 1px)', backgroundSize: '60px 60px', opacity: 0.3 };
const orbTopStyle = { position: 'absolute' as const, top: '20%', right: '15%', width: '300px', height: '300px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139, 92, 246, 0.4) 0%, transparent 70%)', filter: 'blur(8px)' };
const orbBottomStyle = { position: 'absolute' as const, bottom: '15%', left: '10%', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, transparent 70%)', filter: 'blur(8px)' };
const contentWrapStyle = { display: 'flex', flexDirection: 'column' as const, alignItems: 'center' as const, justifyContent: 'center' as const, zIndex: 1, textAlign: 'center' as const, padding: '80px', gap: '32px' };
const logoWrapStyle = { display: 'flex', alignItems: 'center' as const, justifyContent: 'center' as const, position: 'relative' as const };
const titleStyle = { fontSize: '80px', fontWeight: '800', color: '#ffffff', letterSpacing: '-0.03em', lineHeight: 1.5 };
const subtitleStyle = { fontSize: '32px', color: '#a1a1aa', fontWeight: '500', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center' as const, justifyContent: 'center' as const, gap: '12px' };
const bottomLineStyle = { position: 'absolute' as const, bottom: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent 0%, rgba(139, 92, 246, 0.5) 50%, transparent 100%)' };

export async function GET() {
  try {
    return new ImageResponse(
      (
        <div style={containerStyle}>
          <div style={bgGlowStyle} />
          <div style={gridStyle} />
          <div style={orbTopStyle} />
          <div style={orbBottomStyle} />

          <div style={contentWrapStyle}>
            <div style={logoWrapStyle}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="120" height="120">
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
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '16px' }}>
              <div style={titleStyle}>Agentic Chat</div>
              <div style={subtitleStyle}>Your second brain, supercharged</div>
            </div>

            <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
              <div style={{ padding: '12px 28px', borderRadius: '100px', background: 'rgba(139, 92, 246, 0.15)', border: '2px solid rgba(139, 92, 246, 0.3)', color: '#e4e4e7', fontSize: '20px', fontWeight: '600' }}>Research</div>
              <div style={{ padding: '12px 28px', borderRadius: '100px', background: 'rgba(59, 130, 246, 0.15)', border: '2px solid rgba(59, 130, 246, 0.3)', color: '#e4e4e7', fontSize: '20px', fontWeight: '600' }}>Documents</div>
              <div style={{ padding: '12px 28px', borderRadius: '100px', background: 'rgba(139, 92, 246, 0.15)', border: '2px solid rgba(139, 92, 246, 0.3)', color: '#e4e4e7', fontSize: '20px', fontWeight: '600' }}>Workflows</div>
            </div>
          </div>

          <div style={bottomLineStyle} />
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
    logger.error('Error generating homepage OG image:', e);
    return new Response(API_ERROR_MESSAGES.OG_IMAGE_GENERATION_FAILED, {
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    });
  }
}
