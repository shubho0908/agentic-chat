import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'utfs.io',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'uploadthing.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'uploadthing-prod.s3.us-west-2.amazonaws.com',
        pathname: '/**',
      },
    ],
  },
  serverExternalPackages: [
    'pdf-parse',
    'mammoth',
    'tiktoken',
    '@langchain/community',
    '@langchain/textsplitters',
    'ffmpeg-static',
  ],
  outputFileTracingIncludes: {
    '/api/chat/completions': [
      './lib/generated/prisma/**/*',
      './node_modules/.prisma/client/**/*',
      './node_modules/@prisma/client/**/*',
      './node_modules/ffmpeg-static/**/*',
    ],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        'pdf-parse': false,
        'mammoth': false,
        'tiktoken': false,
      };
    }

    return config;
  },
};

export default nextConfig;
