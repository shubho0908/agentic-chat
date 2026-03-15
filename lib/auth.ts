import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { GOOGLE_SIGN_IN_SCOPES } from "./tools/google-suite/scopes";
import { appBaseUrl, trustedOrigins } from "./appUrl";

export const auth = betterAuth({
  baseURL: appBaseUrl,
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
      scope: GOOGLE_SIGN_IN_SCOPES,
      accessType: "offline",
      prompt: "select_account",
    },
  },
  trustedOrigins,
});

export type Session = typeof auth.$Infer.Session;
