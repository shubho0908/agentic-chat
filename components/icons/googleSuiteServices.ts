import { GmailIcon, DriveIcon, DocsIcon, CalendarIcon, SheetsIcon, SlidesIcon } from "./googleSuiteIcons";

export const GOOGLE_SUITE_SERVICES = [
  { name: "Gmail", icon: GmailIcon, color: "#EA4335" },
  { name: "Drive", icon: DriveIcon, color: "#4285F4" },
  { name: "Docs", icon: DocsIcon, color: "#4285F4" },
  { name: "Calendar", icon: CalendarIcon, color: "#4285F4" },
  { name: "Sheets", icon: SheetsIcon, color: "#0F9D58" },
  { name: "Slides", icon: SlidesIcon, color: "#F4B400" },
] as const;
