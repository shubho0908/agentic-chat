"use client";

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Artifact, ArtifactEvent, ArtifactMetadata, ArtifactVersion } from "@/types/artifact";
import { ArtifactEventType, ArtifactType } from "@/types/artifact";
import {
  artifactMetadataToArtifact,
  isArtifactType,
  normalizeArtifactMetadata,
} from "@/lib/artifacts/metadata";

const CHUNK_FLUSH_INTERVAL_MS = 150;

interface ArtifactContextValue {
  activeArtifact: Artifact | null;
  artifacts: Map<string, Artifact>;
  panelOpen: boolean;
  openArtifact: (id: string) => void;
  closePanel: () => void;
  handleArtifactEvent: (event: ArtifactEvent) => void;
  hydrateMessageArtifacts: (messageId: string, artifacts: ArtifactMetadata[]) => void;
  openArtifactFromMetadata: (messageId: string, artifact: ArtifactMetadata) => void;
  setVersion: (artifactId: string, version: number) => void;
  getArtifactForMessage: (messageId: string) => Artifact | undefined;
}

const ArtifactContext = createContext<ArtifactContextValue | undefined>(undefined);

export function ArtifactProvider({ children }: { children: ReactNode }) {
  const [artifacts, setArtifacts] = useState<Map<string, Artifact>>(new Map());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const artifactsRef = useRef<Map<string, Artifact>>(artifacts);
  useEffect(() => {
    artifactsRef.current = artifacts;
  }, [artifacts]);

  const bufferRef = useRef<Map<string, string>>(null!);
  if (bufferRef.current === null) bufferRef.current = new Map();
  const messageIndexRef = useRef<Map<string, string>>(null!);
  if (messageIndexRef.current === null) messageIndexRef.current = new Map();
  const pendingFlushRef = useRef<Set<string>>(null!);
  if (pendingFlushRef.current === null) pendingFlushRef.current = new Set();
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPendingChunks = useCallback(() => {
    flushTimerRef.current = null;
    const pending = pendingFlushRef.current;
    if (pending.size === 0) return;

    const idsToFlush = [...pending];
    pending.clear();

    setArtifacts((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const id of idsToFlush) {
        const buf = bufferRef.current.get(id);
        if (buf === undefined) continue;
        const existing = next.get(id);
        if (!existing || existing.content === buf) continue;
        next.set(id, { ...existing, content: buf });
        changed = true;
      }
      return changed ? next : prev;
    });
  }, []);

  const scheduleFlush = useCallback((artifactId: string) => {
    pendingFlushRef.current.add(artifactId);
    if (flushTimerRef.current === null) {
      flushTimerRef.current = setTimeout(flushPendingChunks, CHUNK_FLUSH_INTERVAL_MS);
    }
  }, [flushPendingChunks]);

  useEffect(() => {
    const timerRef = flushTimerRef;
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const handleArtifactEvent = useCallback((event: ArtifactEvent) => {
    switch (event.type) {
      case ArtifactEventType.START: {
        const artifact: Artifact = {
          id: event.artifactId,
          messageId: event.messageId ?? "",
          type: isArtifactType(event.artifactType) ? event.artifactType : ArtifactType.CODE,
          title: event.title ?? "Untitled",
          language: event.language,
          content: "",
          versions: [],
          currentVersion: 0,
          isStreaming: true,
        };
        bufferRef.current.set(event.artifactId, "");
        if (artifact.messageId) {
          messageIndexRef.current.set(artifact.messageId, event.artifactId);
        }
        setArtifacts((prev) => {
          const next = new Map(prev);
          next.set(event.artifactId, artifact);
          return next;
        });
        setActiveId(event.artifactId);
        setPanelOpen(true);
        break;
      }
      case ArtifactEventType.CHUNK: {
        const buf = (bufferRef.current.get(event.artifactId) ?? "") + (event.content ?? "");
        bufferRef.current.set(event.artifactId, buf);
        scheduleFlush(event.artifactId);
        break;
      }
      case ArtifactEventType.END: {
        pendingFlushRef.current.delete(event.artifactId);
        const finalContent = bufferRef.current.get(event.artifactId) ?? "";
        bufferRef.current.delete(event.artifactId);
        setArtifacts((prev) => {
          const existing = prev.get(event.artifactId);
          if (!existing) return prev;
          const version: ArtifactVersion = { content: finalContent, createdAt: Date.now() };
          const next = new Map(prev);
          next.set(event.artifactId, {
            ...existing,
            content: finalContent,
            isStreaming: false,
            versions: [...existing.versions, version],
            currentVersion: existing.versions.length,
          });
          return next;
        });
        break;
      }
    }
  }, [scheduleFlush]);

  const openArtifact = useCallback((id: string) => {
    if (!artifactsRef.current.has(id)) return;
    setActiveId(id);
    setPanelOpen(true);
  }, []);

  const hydrateMessageArtifacts = useCallback((messageId: string, artifactMetadata: ArtifactMetadata[]) => {
    if (!messageId || artifactMetadata.length === 0) return;

    setArtifacts((prev) => {
      let changed = false;
      const next = new Map(prev);

      for (const item of artifactMetadata) {
        const normalized = normalizeArtifactMetadata(item);
        if (!normalized) continue;

        const existing = next.get(normalized.id);
        if (existing?.isStreaming) continue;

        const artifact = artifactMetadataToArtifact(messageId, normalized);
        if (
          existing?.messageId === artifact.messageId &&
          existing?.content === artifact.content &&
          existing?.title === artifact.title &&
          existing?.type === artifact.type
        ) {
          continue;
        }

        next.set(normalized.id, artifact);
        messageIndexRef.current.set(messageId, normalized.id);
        changed = true;
      }

      return changed ? next : prev;
    });
  }, []);

  const openArtifactFromMetadata = useCallback((messageId: string, artifactMetadata: ArtifactMetadata) => {
    const normalized = normalizeArtifactMetadata(artifactMetadata);
    if (!messageId || !normalized) return;

    setArtifacts((prev) => {
      const next = new Map(prev);
      next.set(normalized.id, artifactMetadataToArtifact(messageId, normalized));
      return next;
    });
    messageIndexRef.current.set(messageId, normalized.id);
    setActiveId(normalized.id);
    setPanelOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
  }, []);

  const setVersion = useCallback((artifactId: string, version: number) => {
    setArtifacts((prev) => {
      const existing = prev.get(artifactId);
      if (!existing || version < 0 || version >= existing.versions.length) return prev;
      const next = new Map(prev);
      next.set(artifactId, {
        ...existing,
        currentVersion: version,
        content: existing.versions[version].content,
      });
      return next;
    });
  }, []);

  const getArtifactForMessage = useCallback((messageId: string): Artifact | undefined => {
    const artifactId = messageIndexRef.current.get(messageId);
    if (artifactId) {
      const artifact = artifacts.get(artifactId);
      if (artifact) return artifact;
    }
    for (const artifact of artifacts.values()) {
      if (artifact.messageId === messageId) {
        messageIndexRef.current.set(messageId, artifact.id);
        return artifact;
      }
    }
    return undefined;
  }, [artifacts]);

  const activeArtifact = activeId ? artifacts.get(activeId) ?? null : null;

  const value = useMemo((): ArtifactContextValue => ({
    activeArtifact,
    artifacts,
    panelOpen,
    openArtifact,
    closePanel,
    handleArtifactEvent,
    hydrateMessageArtifacts,
    openArtifactFromMetadata,
    setVersion,
    getArtifactForMessage,
  }), [activeArtifact, artifacts, panelOpen, openArtifact, closePanel, handleArtifactEvent, hydrateMessageArtifacts, openArtifactFromMetadata, setVersion, getArtifactForMessage]);

  return (
    <ArtifactContext.Provider value={value}>
      {children}
    </ArtifactContext.Provider>
  );
}

export function useArtifacts() {
  const context = use(ArtifactContext);
  if (!context) throw new Error("useArtifacts must be used within ArtifactProvider");
  return context;
}
