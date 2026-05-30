import type { Metadata } from "next";
import { GoogleWorkspaceSettings } from "@/components/settings/googleWorkspaceSettings";
import { createPageMetadata } from "@/lib/seo";
import { appRoutes } from "@/lib/routes";

export const metadata: Metadata = createPageMetadata({
  title: "Google Workspace Settings",
  description:
    "Manage Gmail, Drive, Calendar, Docs, Sheets, and Slides permissions for Agentic Chat.",
  path: appRoutes.googleWorkspaceSettings,
  noIndex: true,
});

export default function GoogleWorkspaceSettingsPage() {
  return <GoogleWorkspaceSettings />;
}
