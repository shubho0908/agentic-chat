"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
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
  handleLoad: () => void;
  sandboxUrl: string;
  sandboxAttr: string;
}

export function useSandboxIframe(): UseSandboxIframeResult {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const pendingRef = useRef<string | null>(null);

  const flushPending = useCallback((targetWindow?: Window | null) => {
    const win = targetWindow ?? iframeRef.current?.contentWindow;
    if (!win || pendingRef.current === null) return;

    win.postMessage(
      { type: "render", html: pendingRef.current },
      getSandboxTargetOrigin(),
    );
    pendingRef.current = null;
  }, []);

  const requestReady = useCallback((targetWindow?: Window | null) => {
    const win = targetWindow ?? iframeRef.current?.contentWindow;
    if (!win) return;

    win.postMessage({ type: "sandbox-probe" }, getSandboxTargetOrigin());
  }, []);

  useLayoutEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type !== "sandbox-ready" && e.data?.type !== "sandbox-rendered") return;
      const sourceWindow = e.source as Window | null;
      if (!sourceWindow || sourceWindow !== iframeRef.current?.contentWindow) return;
      if (!SANDBOX_VALID_ORIGINS.has(e.origin)) return;

      setReady(true);
      flushPending(sourceWindow);
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [flushPending]);

  const handleLoad = useCallback(() => {
    requestReady();
  }, [requestReady]);

  const send = useCallback((html: string) => {
    pendingRef.current = html;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;

    if (ready) {
      flushPending(win);
    } else {
      requestReady(win);
    }
  }, [flushPending, ready, requestReady]);

  return { iframeRef, ready, send, handleLoad, sandboxUrl: SANDBOX_URL, sandboxAttr: SANDBOX_ATTR };
}
