"use client";

import { Loader } from "lucide-react";
import { COMPOSIO_TOOLKITS, TOOLKIT_DISPLAY_NAMES, type ComposioToolkit } from "@/lib/tools/composio/config";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useComposioConnectors } from "@/hooks/useComposioConnectors";
import {
  GmailIcon,
  GoogleCalendarIcon,
  GoogleDocsIcon,
  GoogleSheetsIcon,
  GoogleDriveIcon,
  SlackIcon,
  GitHubIcon,
  TodoistIcon,
  NotionIcon,
  LinearIcon,
} from "./connectorIcons";
import type { FC, SVGProps } from "react";

const TOOLKIT_ICONS: Record<ComposioToolkit, FC<SVGProps<SVGSVGElement>>> = {
  gmail: GmailIcon,
  googlecalendar: GoogleCalendarIcon,
  googledrive: GoogleDriveIcon,
  googledocs: GoogleDocsIcon,
  googlesheets: GoogleSheetsIcon,
  slack: SlackIcon,
  notion: NotionIcon,
  github: GitHubIcon,
  linear: LinearIcon,
  todoist: TodoistIcon,
};

const TOOLKIT_DESCRIPTIONS: Record<ComposioToolkit, string> = {
  gmail: "Email",
  googlecalendar: "Calendar",
  googledrive: "Files",
  googledocs: "Documents",
  googlesheets: "Spreadsheets",
  slack: "Messaging",
  notion: "Notes & Docs",
  github: "Code & PRs",
  linear: "Issues",
  todoist: "Tasks",
};

export function ConnectorsDrawerContent() {
  const { services, connectMutation, disconnectMutation } = useComposioConnectors();

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {COMPOSIO_TOOLKITS.map((toolkit) => {
        const connection = services.find((s) => s.toolkit === toolkit);
        const isConnected = !!connection;
        const isLoading = connectMutation.isPending && connectMutation.variables === toolkit;
        const Icon = TOOLKIT_ICONS[toolkit];

        return (
          <div
            key={toolkit}
            className={cn(
              "relative flex flex-col items-center gap-2.5 p-3.5 rounded-xl border transition-all duration-200",
              isConnected
                ? "border-primary/20 bg-primary/5"
                : "border-border/50 bg-card"
            )}
          >
            {isConnected && (
              <div className="absolute top-2.5 right-2.5 size-1.5 rounded-full bg-primary" />
            )}

            <div className={cn(
              "flex size-10 items-center justify-center rounded-lg",
              isConnected
                ? "bg-primary/10"
                : "bg-muted/40"
            )}>
              <Icon className="size-5" />
            </div>

            <div className="flex flex-col items-center gap-0.5 min-w-0 w-full">
              <span className="font-medium text-xs truncate w-full text-center">
                {TOOLKIT_DISPLAY_NAMES[toolkit]}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {TOOLKIT_DESCRIPTIONS[toolkit]}
              </span>
            </div>

            <Button
              size="sm"
              disabled={isLoading}
              onClick={() =>
                isConnected
                  ? disconnectMutation.mutate(connection.id)
                  : connectMutation.mutate(toolkit)
              }
              className={cn(
                "w-full h-7 text-[11px] font-semibold rounded-lg",
                "border border-black/10 dark:border-white/10",
                "shadow-[0_1px_2px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.15)]",
                "active:shadow-[inset_0_1px_3px_rgba(0,0,0,0.2)] active:translate-y-px",
                "transition-all duration-100",
                isConnected
                  ? "bg-gradient-to-b from-secondary to-secondary/90 text-secondary-foreground hover:from-secondary/90 hover:to-secondary/80"
                  : "bg-gradient-to-b from-primary to-primary/90 text-primary-foreground hover:from-primary/90 hover:to-primary/80"
              )}
            >
              {isLoading ? (
                <Loader className="size-3 animate-spin" />
              ) : isConnected ? (
                "Disconnect"
              ) : (
                "Connect"
              )}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
