import type { Metadata } from "next";
import { GoogleWorkspaceSettings } from "@/components/settings/googleWorkspaceSettings";

export const metadata: Metadata = {
  title: "Google Workspace Settings",
  description:
    "Manage Gmail, Drive, Calendar, Docs, Sheets, and Slides permissions for Agentic Chat.",
};

export default function GoogleWorkspaceSettingsPage() {
  return <GoogleWorkspaceSettings />;
}
