"use client";

import type { ReactNode } from "react";
import { useRef } from "react";
import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from "framer-motion";
import { useInteractionTimeline, useShowcaseWidth, useViewportBounds } from "@/components/landing/interaction-showcase/hooks";
import { DeviceShell } from "@/components/landing/interaction-showcase/primitives";
import {
  DeepResearchScene,
  OrchestrationScene,
  WebSearchScene,
} from "@/components/landing/interaction-showcase/scenes";
import { SCENE_TRANSITION } from "@/components/landing/interaction-showcase/constants";
import { getDeviceKind } from "@/components/landing/interaction-showcase/timeline";
import { SceneKind } from "@/components/landing/interaction-showcase/types";

export function InteractionShowcase() {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const showcaseRef = useRef<HTMLDivElement>(null);
  const showcaseWidth = useShowcaseWidth(showcaseRef);
  const viewport = useViewportBounds();
  const device = getDeviceKind(showcaseWidth, viewport.width, viewport.height);
  const tabletLandscape = viewport.width > viewport.height && viewport.height < 560;
  const { timeline } = useInteractionTimeline(prefersReducedMotion);
  const { cycle, scene, step, sceneElapsed } = timeline;
  const sceneKey = prefersReducedMotion ? scene : `${cycle}-${scene}`;
  const sceneContent: Record<SceneKind, ReactNode> = {
    [SceneKind.WebSearch]: (
      <WebSearchScene
        device={device}
        step={step}
        sceneElapsed={sceneElapsed}
        prefersReducedMotion={prefersReducedMotion}
      />
    ),
    [SceneKind.Orchestration]: (
      <OrchestrationScene
        step={step}
        sceneElapsed={sceneElapsed}
        prefersReducedMotion={prefersReducedMotion}
      />
    ),
    [SceneKind.DeepResearch]: (
      <DeepResearchScene
        step={step}
        sceneElapsed={sceneElapsed}
        prefersReducedMotion={prefersReducedMotion}
      />
    ),
  };

  return (
    <LazyMotion features={domAnimation}>
      <div ref={showcaseRef} className="relative mx-auto w-full max-w-[700px]">
        <DeviceShell
          device={device}
          tabletLandscape={tabletLandscape}
        >
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={sceneKey}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, x: -18, filter: "blur(6px)" }}
              transition={prefersReducedMotion ? { duration: 0 } : SCENE_TRANSITION}
              className="flex min-h-0 flex-1 flex-col"
            >
              {sceneContent[scene]}
            </m.div>
          </AnimatePresence>
        </DeviceShell>
      </div>
    </LazyMotion>
  );
}
