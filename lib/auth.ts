import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { GOOGLE_SIGN_IN_SCOPES } from "./tools/google-suite/scopes";
import { appBaseUrl, trustedOrigins } from "./appUrl";
import { getRequiredEnv } from "./env";

export const auth = betterAuth({
  baseURL: appBaseUrl,
  secret: getRequiredEnv("BETTER_AUTH_SECRET", {
    fallback: "build-only-non-production-better-auth-secret",
    description: "Better Auth secret",
  }),
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: false,
  },
  socialProviders: {
    google: {
      clientId: getRequiredEnv("GOOGLE_CLIENT_ID", {
        fallback: "missing-google-client-id",
        description: "Google OAuth client ID",
      }),
      clientSecret: getRequiredEnv("GOOGLE_CLIENT_SECRET", {
        fallback: "missing-google-client-secret",
        description: "Google OAuth client secret",
      }),
      scope: GOOGLE_SIGN_IN_SCOPES,
      accessType: "offline",
      prompt: "select_account",
    },
  },
  trustedOrigins,
});

export type Session = typeof auth.$Infer.Session;
