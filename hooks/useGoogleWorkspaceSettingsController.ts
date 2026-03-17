"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { authorizeGoogleWorkspace, useSession } from "@/lib/auth-client";
import { useGoogleSuiteAuth } from "@/hooks/useGoogleSuiteAuth";
import {
  compareGoogleWorkspaceSelections,
  countEnabledGoogleWorkspaceServices,
  DEFAULT_GOOGLE_WORKSPACE_SELECTIONS,
  getGoogleWorkspaceScopesFromSelections,
  resolveGoogleWorkspaceSelections,
  type GoogleWorkspaceServiceId,
  type GoogleWorkspaceServiceSelections,
} from "@/lib/tools/google-suite/access-levels";

function getConnectionTone(status: {
  connected?: boolean;
  workspaceConnected?: boolean;
  hasWorkspaceAccess?: boolean;
  accessLevel?: 'none' | 'partial' | 'full';
}) {
  if (!status.connected) {
    return {
      label: "Google not linked",
      className:
        "border-slate-300/70 bg-slate-500/10 text-slate-700 dark:border-slate-700 dark:text-slate-200",
    };
  }

  if (!status.workspaceConnected) {
    return {
      label: "Workspace disconnected",
      className: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    };
  }

  if (status.hasWorkspaceAccess && status.accessLevel === "full") {
    return {
      label: "Full suite ready",
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    };
  }

  if (status.hasWorkspaceAccess) {
    return {
      label: "Custom access ready",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    };
  }

  return {
    label: "Workspace connected",
    className:
      "border-slate-300/70 bg-slate-500/10 text-slate-700 dark:border-slate-700 dark:text-slate-200",
  };
}

export function useGoogleWorkspaceSettingsController() {
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
  }, [hasStatus, selectionScopeKey]);

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
  }, [refetch]);

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

  const handleGoHome = () => {
    router.push("/");
  };

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
            description:
              "You stayed signed in. Reconnect any app from this page whenever you need it.",
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

  return {
    actionDescription,
    actionLabel,
    comparison,
    connectionTone,
    currentEnabledCount,
    currentSelections,
    handleApply,
    handleGoHome,
    handleLevelChange,
    handleResetSelection,
    isApplying,
    isLoading,
    isPending,
    selectedEnabledCount,
    selectedLevels,
    session,
    status,
    suggestedSelections,
  };
}
