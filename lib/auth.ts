import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { ALL_GOOGLE_SUITE_SCOPES } from "./tools/google-suite/scopes";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: false,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      scope: ALL_GOOGLE_SUITE_SCOPES,
      accessType: "offline",
      prompt: "consent",
    },
  },
  trustedOrigins: [process.env.NEXT_PUBLIC_APP_URL as string],
});

export type Session = typeof auth.$Infer.Session;
