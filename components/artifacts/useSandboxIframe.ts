"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  SANDBOX_URL,
  SANDBOX_ATTR,
  SANDBOX_VALID_ORIGINS,
  getSandboxTargetOrigin,
} from "@/lib/sandbox";

interface UseSandboxIframeResult {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  ready: boolean;
  send: (html: string) => void;
  sandboxUrl: string;
  sandboxAttr: string;
}

export function useSandboxIframe(): UseSandboxIframeResult {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const pendingRef = useRef<string | null>(null);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type !== "sandbox-ready") return;
      const sourceWindow = e.source as Window | null;
      if (!sourceWindow || sourceWindow !== iframeRef.current?.contentWindow) return;
      if (!SANDBOX_VALID_ORIGINS.has(e.origin)) return;

      setReady(true);

      if (pendingRef.current !== null) {
        sourceWindow.postMessage(
          { type: "render", html: pendingRef.current },
          getSandboxTargetOrigin(),
        );
        pendingRef.current = null;
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const send = useCallback((html: string) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;

    if (ready) {
      win.postMessage({ type: "render", html }, getSandboxTargetOrigin());
    } else {
      pendingRef.current = html;
    }
  }, [ready]);

  return { iframeRef, ready, send, sandboxUrl: SANDBOX_URL, sandboxAttr: SANDBOX_ATTR };
}
