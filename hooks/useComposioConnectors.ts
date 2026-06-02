import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ComposioToolkit } from "@/lib/tools/composio/config";
import type { ConnectedService } from "@/lib/tools/composio/auth";

const CONNECTIONS_KEY = ["composio-connections"] as const;

export function useComposioConnectors(opts?: { onActionComplete?: () => void }) {
  const queryClient = useQueryClient();

  const { data: services = [], isLoading } = useQuery<ConnectedService[]>({
    queryKey: CONNECTIONS_KEY,
    queryFn: async () => {
      const res = await fetch("/api/composio/status");
      if (!res.ok) return [];
      return (await res.json()).services;
    },
    staleTime: 5 * 60 * 1000,       // 5 min — status rarely changes without user action
    gcTime: 10 * 60 * 1000,         // 10 min garbage collection
    refetchOnWindowFocus: false,     // no refetch on tab switch
    refetchOnMount: false,           // trust cache if fresh
    refetchOnReconnect: true,        // refetch after network recovery
  });

  const connectMutation = useMutation({
    mutationFn: async (toolkit: ComposioToolkit) => {
      const res = await fetch("/api/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit }),
      });
      if (!res.ok) throw new Error("Failed to connect");
      return (await res.json()).redirectUrl as string;
    },
    onSuccess: (redirectUrl) => {
      queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
      globalThis.location.assign(redirectUrl);
    },
    onError: () => {
      toast.error("Failed to connect");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/composio/status", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectedAccountId: id }),
      });
      if (!res.ok) throw new Error("Failed to disconnect");
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: CONNECTIONS_KEY });
      const previous = queryClient.getQueryData<ConnectedService[]>(CONNECTIONS_KEY);
      queryClient.setQueryData<ConnectedService[]>(CONNECTIONS_KEY, (old) =>
        old?.filter((s) => s.id !== id) ?? []
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      queryClient.setQueryData(CONNECTIONS_KEY, context?.previous);
      toast.error("Failed to disconnect");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
      opts?.onActionComplete?.();
    },
    onSuccess: () => {
      toast.success("Disconnected");
    },
  });

  return { services, isLoading, connectMutation, disconnectMutation };
}
