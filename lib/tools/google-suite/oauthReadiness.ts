interface GoogleWorkspaceOAuthReadiness {
  ready: boolean;
  message?: string;
}

function parseEnvList(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function getGoogleWorkspaceOAuthReadiness(
  email?: string | null
): GoogleWorkspaceOAuthReadiness {
  const isVerified = process.env.GOOGLE_WORKSPACE_OAUTH_READY === "true";

  if (isVerified) {
    return { ready: true };
  }

  const allowedTestUsers = new Set(parseEnvList(process.env.GOOGLE_WORKSPACE_TEST_USERS));
  const normalizedEmail = email?.trim().toLowerCase();

  if (normalizedEmail && allowedTestUsers.has(normalizedEmail)) {
    return { ready: true };
  }

  if (allowedTestUsers.size > 0) {
    return {
      ready: false,
      message:
        "Google Workspace OAuth is still in unverified mode. Add this account as a Google Cloud OAuth test user before requesting Gmail, Drive, Calendar, Docs, Sheets, or Slides access.",
    };
  }

  return {
    ready: false,
    message:
      "Google Workspace OAuth is not marked ready yet. Verify the Google OAuth consent screen or configure Google Cloud OAuth test users before enabling Workspace access.",
  };
}
