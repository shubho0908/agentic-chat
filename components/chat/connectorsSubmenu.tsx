"use client";

import { Loader } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdownMenu";
import { COMPOSIO_TOOLKITS, TOOLKIT_DISPLAY_NAMES, type ComposioToolkit } from "@/lib/tools/composio/config";
import { useComposioConnectors } from "@/hooks/useComposioConnectors";
import { cn } from "@/lib/utils";
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

interface ConnectorsSubmenuContentProps {
  onActionComplete?: () => void;
}

export function ConnectorsSubmenuContent({ onActionComplete }: ConnectorsSubmenuContentProps) {
  const { services, connectMutation, disconnectMutation } = useComposioConnectors({ onActionComplete });

  return (
    <>
      <div className="px-2 py-1.5 mb-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Integrated Apps
        </p>
      </div>
      {COMPOSIO_TOOLKITS.map((toolkit) => {
        const connection = services.find((s) => s.toolkit === toolkit);
        const isConnected = !!connection;
        const isLoading = connectMutation.isPending && connectMutation.variables === toolkit;
        const Icon = TOOLKIT_ICONS[toolkit];

        return (
          <DropdownMenuItem
            key={toolkit}
            className="gap-3 py-2.5 rounded-lg cursor-pointer"
            onSelect={(e) => {
              e.preventDefault();
              if (isConnected) disconnectMutation.mutate(connection.id);
              else connectMutation.mutate(toolkit);
            }}
            disabled={isLoading}
          >
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/40 bg-background">
                <Icon className="size-4" />
              </span>
              <span className="font-medium text-sm truncate">
                {TOOLKIT_DISPLAY_NAMES[toolkit]}
              </span>
            </div>
            <span
              className={cn(
                "shrink-0 inline-flex items-center justify-center h-6 px-2.5 rounded-md text-[11px] font-semibold transition-all duration-100",
                "border border-black/10 dark:border-white/10",
                "shadow-[0_1px_2px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.15)]",
                "active:shadow-[inset_0_1px_3px_rgba(0,0,0,0.2)] active:translate-y-px",
                isLoading && "opacity-60",
                isConnected
                  ? "bg-gradient-to-b from-secondary to-secondary/90 text-secondary-foreground"
                  : "bg-gradient-to-b from-primary to-primary/90 text-primary-foreground"
              )}
            >
              {isLoading ? (
                <Loader className="size-3 animate-spin" />
              ) : isConnected ? (
                "Disconnect"
              ) : (
                "Connect"
              )}
            </span>
          </DropdownMenuItem>
        );
      })}
    </>
  );
}
