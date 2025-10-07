import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
  try {
    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0a0a0a',
            position: 'relative',
            fontFamily: 'system-ui, sans-serif',
            overflow: 'hidden',
          }}
        >
          {/* Animated Gradient Background */}
          <div
            style={{
              position: 'absolute',
              top: '-50%',
              left: '-50%',
              right: '-50%',
              bottom: '-50%',
              background: 'radial-gradient(circle at 30% 40%, rgba(139, 92, 246, 0.25) 0%, transparent 50%), radial-gradient(circle at 70% 60%, rgba(59, 130, 246, 0.2) 0%, transparent 50%)',
              opacity: 0.6,
            }}
          />

          {/* Grid Pattern Overlay */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundImage: 'linear-gradient(rgba(139, 92, 246, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(139, 92, 246, 0.05) 1px, transparent 1px)',
              backgroundSize: '60px 60px',
              opacity: 0.3,
            }}
          />

          {/* Gradient Orbs */}
          <div
            style={{
              position: 'absolute',
              top: '20%',
              right: '15%',
              width: '300px',
              height: '300px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(139, 92, 246, 0.4) 0%, transparent 70%)',
              filter: 'blur(60px)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: '15%',
              left: '10%',
              width: '400px',
              height: '400px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, transparent 70%)',
              filter: 'blur(80px)',
            }}
          />

          {/* Main Content */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1,
              textAlign: 'center',
              padding: '80px',
              gap: '32px',
            }}
          >
            {/* Icon with glow effect */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  width: '180px',
                  height: '180px',
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(139, 92, 246, 0.4) 0%, transparent 70%)',
                  filter: 'blur(40px)',
                }}
              />
              <div
                style={{
                  width: '120px',
                  height: '120px',
                  borderRadius: '30px',
                  background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.3) 0%, rgba(59, 130, 246, 0.2) 100%)',
                  border: '3px solid rgba(139, 92, 246, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '64px',
                  boxShadow: '0 0 60px rgba(139, 92, 246, 0.3)',
                }}
              >
                💬
              </div>
            </div>

            {/* Title with gradient text */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              <div
                style={{
                  fontSize: '80px',
                  fontWeight: '800',
                  background: 'linear-gradient(135deg, #ffffff 0%, #e4e4e7 50%, #a1a1aa 100%)',
                  backgroundClip: 'text',
                  color: 'transparent',
                  letterSpacing: '-0.03em',
                  lineHeight: 1.5,
                }}
              >
                Agentic Chat
              </div>
              
              {/* Subtitle */}
              <div
                style={{
                  fontSize: '32px',
                  color: '#a1a1aa',
                  fontWeight: '500',
                  letterSpacing: '-0.01em',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                }}
              >
                Intelligent Conversations
              </div>
            </div>

            {/* Feature Pills */}
            <div
              style={{
                display: 'flex',
                gap: '16px',
                marginTop: '24px',
              }}
            >
              <div
                style={{
                  padding: '12px 28px',
                  borderRadius: '100px',
                  background: 'rgba(139, 92, 246, 0.15)',
                  border: '2px solid rgba(139, 92, 246, 0.3)',
                  color: '#e4e4e7',
                  fontSize: '20px',
                  fontWeight: '600',
                }}
              >
                AI-Powered
              </div>
              <div
                style={{
                  padding: '12px 28px',
                  borderRadius: '100px',
                  background: 'rgba(59, 130, 246, 0.15)',
                  border: '2px solid rgba(59, 130, 246, 0.3)',
                  color: '#e4e4e7',
                  fontSize: '20px',
                  fontWeight: '600',
                }}
              >
                Agentic Workflow
              </div>
              <div
                style={{
                  padding: '12px 28px',
                  borderRadius: '100px',
                  background: 'rgba(139, 92, 246, 0.15)',
                  border: '2px solid rgba(139, 92, 246, 0.3)',
                  color: '#e4e4e7',
                  fontSize: '20px',
                  fontWeight: '600',
                }}
              >
                Memory Enhanced
              </div>
            </div>
          </div>

          {/* Bottom decorative line */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '2px',
              background: 'linear-gradient(90deg, transparent 0%, rgba(139, 92, 246, 0.5) 50%, transparent 100%)',
            }}
          />
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (e: unknown) {
    console.error('Error generating homepage OG image:', e);
    return new Response('Failed to generate image', { status: 500 });
  }
}
