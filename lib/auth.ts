import { randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { GOOGLE_SIGN_IN_SCOPES } from "./tools/google-suite/scopes";
import { appBaseUrl, trustedOrigins } from "./appUrl";
import { getRequiredEnv } from "./env";

const DEVELOPMENT_AUTH_SECRET =
  !process.env.BETTER_AUTH_SECRET && process.env.NODE_ENV !== "production"
    ? randomBytes(32).toString("hex")
    : undefined;

export const auth = betterAuth({
  baseURL: appBaseUrl,
  secret: getRequiredEnv("BETTER_AUTH_SECRET", {
    fallback: DEVELOPMENT_AUTH_SECRET,
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
        fallback: process.env.NODE_ENV !== "production" ? "missing-google-client-id" : undefined,
        description: "Google OAuth client ID",
      }),
      clientSecret: getRequiredEnv("GOOGLE_CLIENT_SECRET", {
        fallback: process.env.NODE_ENV !== "production" ? "missing-google-client-secret" : undefined,
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
