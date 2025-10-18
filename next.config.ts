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
    '@prisma/client',
    '@prisma/engines',
  ],
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