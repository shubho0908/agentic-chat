"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/authClient";

import { LoadingScreen } from "./loadingScreen";

const EXIT_MS = 450;

export function AuthLoadingGate({ spinner }: { spinner: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const authenticated = !!session?.user;

  const [held, setHeld] = useState(authenticated);
  const [exiting, setExiting] = useState(false);

  if (authenticated && !held) {
    setHeld(true);
    setExiting(false);
  } else if (!authenticated && held) {
    if (isPending && exiting) setExiting(false);
    else if (!isPending && !exiting) setExiting(true);
  }

  useEffect(() => {
    if (!exiting) return;

    const timer = window.setTimeout(() => {
      setHeld(false);
      setExiting(false);
    }, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [exiting]);

  if (held) return <LoadingScreen exiting={exiting} />;
  if (isPending) return null;

  return <>{spinner}</>;
}
