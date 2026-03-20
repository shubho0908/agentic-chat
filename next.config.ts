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
    "pdf-parse",
    "mammoth",
    "tiktoken",
    "@langchain/community",
    "@langchain/textsplitters",
    "@prisma/client",
    "@prisma/engines",
  ],
};

export default nextConfig;
