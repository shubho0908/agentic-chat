"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { COMPOSIO_TOOLKITS, TOOLKIT_DISPLAY_NAMES, type ComposioToolkit } from "@/lib/tools/composio/config";
import type { ConnectedService } from "@/lib/tools/composio/auth";

function ConnectionsContent() {
  const searchParams = useSearchParams();
  const [services, setServices] = useState<ConnectedService[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/composio/status");
      if (res.ok) {
        const data = await res.json();
        setServices(data.services);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchParams.get("connected") === "true") {
      toast.success("Service connected successfully");
    } else if (searchParams.get("error")) {
      toast.error("Failed to connect service");
    }
  }, [searchParams]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function handleConnect(toolkit: ComposioToolkit) {
    setConnecting(toolkit);
    try {
      const res = await fetch("/api/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit }),
      });
      if (!res.ok) {
        toast.error("Failed to initiate connection");
        return;
      }
      const { redirectUrl } = await res.json();
      globalThis.location.assign(redirectUrl);
    } catch {
      toast.error("Connection error");
    } finally {
      setConnecting(null);
    }
  }

  async function handleDisconnect(connectedAccountId: string) {
    const res = await fetch("/api/composio/status", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectedAccountId }),
    });
    if (res.ok) {
      toast.success("Disconnected");
      setServices((prev) => prev.filter((s) => s.id !== connectedAccountId));
    } else {
      toast.error("Failed to disconnect");
    }
  }

  function getConnectionForToolkit(toolkit: string) {
    return services.find((s) => s.toolkit === toolkit);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Loading connections...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-2">Connected Services</h1>
      <p className="text-muted-foreground mb-6">
        Connect your accounts to enable AI-powered actions across services.
      </p>
      <div className="grid gap-3">
        {COMPOSIO_TOOLKITS.map((toolkit) => {
          const connection = getConnectionForToolkit(toolkit);
          const isConnected = !!connection;
          return (
            <Card key={toolkit}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{TOOLKIT_DISPLAY_NAMES[toolkit]}</CardTitle>
                    <CardDescription className="text-xs">
                      {isConnected ? "Connected" : "Not connected"}
                    </CardDescription>
                  </div>
                  {isConnected ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDisconnect(connection.id)}
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={connecting === toolkit}
                      onClick={() => handleConnect(toolkit)}
                    >
                      {connecting === toolkit ? "Connecting..." : "Connect"}
                    </Button>
                  )}
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default function ConnectionsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    }>
      <ConnectionsContent />
    </Suspense>
  );
}
