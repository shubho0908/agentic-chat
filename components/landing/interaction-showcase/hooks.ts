import type { RefObject } from "react";
import { useCallback, useEffect, useState } from "react";
import { SCENE_ORDER } from "@/components/landing/interaction-showcase/constants";
import {
  getCompletedScenePosition,
  getSceneLoopOffset,
  getTimelinePosition,
} from "@/components/landing/interaction-showcase/timeline";

function useAnimationClock(enabled: boolean) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setElapsed(0);
      return;
    }

    let animationFrame = 0;
    let startTime: number | null = null;

    const updateElapsed = (timestamp: number) => {
      if (startTime === null) {
        startTime = timestamp;
      }

      setElapsed(timestamp - startTime);
      animationFrame = window.requestAnimationFrame(updateElapsed);
    };

    animationFrame = window.requestAnimationFrame(updateElapsed);

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [enabled]);

  return elapsed;
}

export function useShowcaseWidth(targetRef: RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(700);

  useEffect(() => {
    const node = targetRef.current;

    if (!node) {
      return;
    }

    const updateWidth = () => {
      setWidth(node.getBoundingClientRect().width);
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [targetRef]);

  return width;
}

export function useViewportBounds() {
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });

  useEffect(() => {
    const updateViewport = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateViewport();
    window.addEventListener("resize", updateViewport, { passive: true });

    return () => {
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  return viewport;
}

export function useInteractionTimeline(prefersReducedMotion: boolean) {
  const elapsed = useAnimationClock(!prefersReducedMotion);
  const [staticSceneIndex, setStaticSceneIndex] = useState(0);
  const [timelineAnchor, setTimelineAnchor] = useState({
    elapsedAtAnchor: 0,
    timelineElapsed: 0,
  });

  const effectiveElapsed = timelineAnchor.timelineElapsed + (elapsed - timelineAnchor.elapsedAtAnchor);

  const timeline = prefersReducedMotion
    ? getCompletedScenePosition(SCENE_ORDER[staticSceneIndex])
    : getTimelinePosition(effectiveElapsed);

  const navigateScene = useCallback((direction: -1 | 1) => {
    const nextSceneIndex =
      (timeline.sceneIndex + direction + SCENE_ORDER.length) % SCENE_ORDER.length;

    if (prefersReducedMotion) {
      setStaticSceneIndex(nextSceneIndex);
      return;
    }

    setTimelineAnchor({
      elapsedAtAnchor: elapsed,
      timelineElapsed: getSceneLoopOffset(SCENE_ORDER[nextSceneIndex]),
    });
  }, [elapsed, prefersReducedMotion, timeline.sceneIndex]);

  return {
    timeline,
    navigateScene,
  };
}
