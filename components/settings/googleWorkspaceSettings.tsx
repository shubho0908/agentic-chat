"use client";

import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Loader,
  Loader2,
  LockKeyhole,
  RefreshCcw,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useSession, authorizeGoogleWorkspace } from "@/lib/auth-client";
import { useGoogleSuiteAuth } from "@/hooks/useGoogleSuiteAuth";
import {
  compareGoogleWorkspaceSelections,
  countEnabledGoogleWorkspaceServices,
  DEFAULT_GOOGLE_WORKSPACE_SELECTIONS,
  getGoogleWorkspaceLevel,
  getGoogleWorkspaceScopesFromSelections,
  GOOGLE_WORKSPACE_SERVICE_CONFIGS,
  resolveGoogleWorkspaceSelections,
  type GoogleWorkspaceServiceId,
  type GoogleWorkspaceServiceSelections,
} from "@/lib/tools/google-suite/access-levels";
import {
  CalendarIcon,
  DocsIcon,
  DriveIcon,
  GmailIcon,
  SheetsIcon,
  SlidesIcon,
} from "@/components/icons/google-suite-icons";
import { ChatHeader } from "@/components/chatHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const SERVICE_ICONS = {
  gmail: GmailIcon,
  drive: DriveIcon,
  calendar: CalendarIcon,
  docs: DocsIcon,
  sheets: SheetsIcon,
  slides: SlidesIcon,
} satisfies Record<GoogleWorkspaceServiceId, ComponentType<SVGProps<SVGSVGElement>>>;

function getConnectionTone(status: {
  connected?: boolean;
  workspaceConnected?: boolean;
  authorized?: boolean;
}) {
  if (!status.connected) {
    return {
      label: "Google not linked",
      className: "border-slate-300/70 bg-slate-500/10 text-slate-700 dark:border-slate-700 dark:text-slate-200",
    };
  }

  if (status.authorized) {
    return {
      label: "Full access ready",
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    };
  }

  if (status.workspaceConnected) {
    return {
      label: "Custom access",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    };
  }

  return {
    label: "Workspace disconnected",
    className: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  };
}

export function GoogleWorkspaceSettings() {
  const { data: session, isPending } = useSession();
  const { status, isLoading, refetch } = useGoogleSuiteAuth({ enabled: !!session });
  const router = useRouter();
  const [selectedLevels, setSelectedLevels] = useState<GoogleWorkspaceServiceSelections>(
    DEFAULT_GOOGLE_WORKSPACE_SELECTIONS
  );
  const [isApplying, setIsApplying] = useState(false);

  const grantedScopes = status?.grantedScopes ?? [];
  const configuredScopes = status?.configuredScopes ?? grantedScopes;
  const currentSelections = resolveGoogleWorkspaceSelections(grantedScopes);
  const suggestedSelections = resolveGoogleWorkspaceSelections(configuredScopes);
  const selectionSource = status?.workspaceConnected ? grantedScopes : configuredScopes;
  const selectionScopeKey = [...selectionSource].sort().join(",");
  const hasStatus = Boolean(status);

  useEffect(() => {
    if (!hasStatus) {
      return;
    }

    setSelectedLevels(
      resolveGoogleWorkspaceSelections(selectionScopeKey ? selectionScopeKey.split(",") : [])
    );
  }, [selectionScopeKey, hasStatus]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const oauthResult = params.get("google_workspace");
    const oauthReason = params.get("reason");

    if (!oauthResult) {
      return;
    }

    void refetch();

    if (oauthResult === "success") {
      toast.success("Google access updated", {
        description: "Your selected Google Workspace permissions are now synced.",
      });
    } else {
      toast.error("Google access update failed", {
        description:
          oauthReason === "account_mismatch"
            ? "Finish the reconnect with the same Google account you originally linked to this workspace."
            : oauthReason === "account_linked"
              ? "That Google account is already linked elsewhere. Reconnect with the original account for this workspace."
              : oauthReason === "persist_failed"
            ? "Google returned successfully, but we could not save the new grant. Please try again."
            : "Google did not finish the Workspace permission update. Please try again.",
      });
    }

    window.history.replaceState(null, "", "/settings/google-workspace");
  }, [refetch, router]);

  const comparison = compareGoogleWorkspaceSelections(currentSelections, selectedLevels);
  const selectedScopes = getGoogleWorkspaceScopesFromSelections(selectedLevels);
  const currentEnabledCount = countEnabledGoogleWorkspaceServices(currentSelections);
  const selectedEnabledCount = countEnabledGoogleWorkspaceServices(selectedLevels);
  const connectionTone = getConnectionTone(status ?? {});

  const actionLabel = !comparison.hasChanges
    ? "Access is up to date"
    : !status?.workspaceConnected && selectedEnabledCount > 0
      ? "Reconnect selected access"
    : comparison.hasRemovals && selectedEnabledCount === 0
      ? "Disconnect Workspace tools"
      : comparison.hasRemovals
        ? "Reconnect with selected access"
        : "Add selected access";

  const actionDescription = !comparison.hasChanges
    ? "Everything already matches your current Google Workspace access."
    : !status?.workspaceConnected && selectedEnabledCount > 0
      ? "Your last Google Workspace selection is preserved locally. Reconnect to make that access live again."
    : comparison.hasRemovals
      ? "We will revoke the current Workspace grant, keep you signed in, then reconnect with only this selection."
      : "Google will ask only for the extra access you just turned on.";

  const handleLevelChange = (serviceId: GoogleWorkspaceServiceId, levelId: string) => {
    setSelectedLevels((current) => ({
      ...current,
      [serviceId]: levelId,
    }));
  };

  const handleResetSelection = () => {
    setSelectedLevels(currentSelections);
  };

  const handleApply = async () => {
    if (!comparison.hasChanges) {
      return;
    }

    setIsApplying(true);

    try {
      if (comparison.hasRemovals) {
        const resetResponse = await fetch("/api/google-suite/auth/reset", {
          method: "POST",
        });

        if (!resetResponse.ok) {
          throw new Error("Failed to reset Google Workspace access");
        }

        if (selectedEnabledCount === 0) {
          await refetch();
          toast.success("Google Workspace disconnected", {
            description: "You stayed signed in. Reconnect any app from this page whenever you need it.",
          });
          setIsApplying(false);
          return;
        }
      }

      toast.info(
        comparison.hasRemovals ? "Reconnect required" : "Opening Google consent",
        {
          description: comparison.hasRemovals
            ? "Continue with Google to apply your smaller, cleaner access set."
            : "Continue with Google to add the new access you selected.",
          duration: 5000,
        }
      );

      await authorizeGoogleWorkspace("/settings/google-workspace", selectedScopes);
      setIsApplying(false);
    } catch (error) {
      console.error("Google Workspace settings error:", error);
      await refetch();
      setIsApplying(false);
      toast.error("Unable to update Google Workspace access", {
        description: "Please try again. Your existing setup was preserved as much as possible.",
      });
    }
  };

  if (isPending || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader className="size-5 animate-spin" />
          <span>Loading workspace settings...</span>
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="flex min-h-screen flex-col">
        <ChatHeader onConfigured={() => {}} onNewChat={() => router.push("/")} />
        <div className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center px-4 pb-10 pt-24">
          <Card className="w-full border-border/60 bg-card shadow-none">
            <CardContent className="space-y-4 p-8 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted text-foreground">
                <LockKeyhole className="size-5" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold">Sign in to manage Google Workspace access</h1>
                <p className="text-sm leading-6 text-muted-foreground">
                  This page lets you choose exactly what Gmail, Drive, Calendar, Docs, Sheets, and
                  Slides access the assistant should keep.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <ChatHeader onConfigured={() => {}} onNewChat={() => router.push("/")} />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 pb-10 pt-24 sm:px-6">
        <Card className="border-border/60 bg-card shadow-none">
          <CardContent className="space-y-5 p-6 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <ShieldCheck className="size-4 text-foreground" />
                  Google Workspace permissions
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold sm:text-3xl">
                    Manage Google access before the assistant uses it
                  </h1>
                  <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                    Pick exactly what Gmail, Drive, Calendar, Docs, Sheets, and Slides access this
                    workspace keeps. Adding access is incremental. Lowering access triggers a clean
                    reconnect so the smaller permission set is real, not cosmetic.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={cn("rounded-full px-3 py-1 text-xs font-medium", connectionTone.className)}>
                  {connectionTone.label}
                </Badge>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">Signed in as</p>
                <p className="mt-2 truncate text-sm font-medium">
                  {session.user.email ?? session.user.name ?? "Google user"}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">Current apps</p>
                <p className="mt-2 text-2xl font-semibold">{currentEnabledCount}</p>
                {!status?.workspaceConnected && countEnabledGoogleWorkspaceServices(suggestedSelections) > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">Currently disconnected</p>
                )}
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">Selected apps</p>
                <p className="mt-2 text-2xl font-semibold">{selectedEnabledCount}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">Change type</p>
                <p className="mt-2 text-sm font-medium">
                  {!comparison.hasChanges
                    ? "No pending changes"
                    : comparison.hasRemovals
                      ? "Reconnect required"
                      : "Incremental add"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-4 md:grid-cols-2">
          {GOOGLE_WORKSPACE_SERVICE_CONFIGS.map((service) => {
            const ServiceIcon = SERVICE_ICONS[service.id];
            const currentLevel = getGoogleWorkspaceLevel(service.id, currentSelections[service.id]);
            const selectedLevel = getGoogleWorkspaceLevel(service.id, selectedLevels[service.id]);
            const isChanged = currentLevel.id !== selectedLevel.id;

            return (
              <Card
                key={service.id}
                className={cn(
                  "overflow-hidden border-border/60 bg-card shadow-none transition-colors",
                  isChanged && "border-primary/30"
                )}
              >
                <CardContent className="space-y-5 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <ServiceIcon className="size-9 shrink-0" />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold">{service.name}</h3>
                          {isChanged && (
                            <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[11px]">
                              Pending
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm leading-6 text-muted-foreground">{service.summary}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Access level
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {service.levels.map((level) => {
                        const isSelected = selectedLevels[service.id] === level.id;

                        return (
                          <button
                            key={level.id}
                            type="button"
                            onClick={() => handleLevelChange(service.id, level.id)}
                            className={cn(
                              "rounded-xl border px-3 py-2 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                              isSelected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border/70 bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                            )}
                          >
                            {level.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Current
                        </p>
                        <p className="mt-1 text-sm font-medium">{currentLevel.label}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          Selected
                        </p>
                        <p className="mt-1 text-sm font-medium">{selectedLevel.label}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {selectedLevel.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          </div>

          <Card className="h-fit border-border/60 bg-card shadow-none">
            <CardContent className="space-y-5 p-6">
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">Apply changes</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  {actionDescription}
                </p>
              </div>

              <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">Action</span>
                  <span className="text-sm font-medium">{actionLabel}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">Added access</span>
                  <span className="text-sm font-medium">{comparison.hasAdditions ? "Yes" : "No"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">Removed access</span>
                  <span className="text-sm font-medium">{comparison.hasRemovals ? "Yes" : "No"}</span>
                </div>
              </div>

              <div className="rounded-xl border border-dashed border-border/70 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted/40">
                    <RefreshCcw className="size-4 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Permission removals reconnect cleanly</p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Lowering access revokes the old Workspace grant first, then reconnects only
                      the access you kept.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <Button
                  onClick={handleApply}
                  disabled={!comparison.hasChanges || isApplying}
                  className="h-10 rounded-xl"
                >
                  {isApplying ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Applying changes...
                    </>
                  ) : comparison.hasRemovals && selectedEnabledCount === 0 ? (
                    <>
                      <Unplug className="size-4" />
                      {actionLabel}
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-4" />
                      {actionLabel}
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleResetSelection}
                  disabled={!comparison.hasChanges || isApplying}
                  className="h-10 rounded-xl"
                >
                  Reset local changes
                </Button>
              </div>

              <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <p className="text-sm font-medium">Need Google-level cleanup too?</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Review or revoke the app directly from your Google Account permissions.
                </p>
                <Button variant="link" asChild className="mt-2 h-auto p-0">
                  <a
                    href="https://myaccount.google.com/permissions"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Google Account permissions
                    <ExternalLink className="size-4" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
