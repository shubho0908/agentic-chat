import {
  LOOP_DURATION,
  RESEARCH_STEPS,
  SCENE_DURATIONS,
  SCENE_ORDER,
  SCENE_TOTALS,
} from "@/components/landing/interaction-showcase/constants";
import type {
  DeviceKind,
  ProcessState,
  SceneKind,
  TimelinePosition,
} from "@/components/landing/interaction-showcase/types";

export function getTimelinePosition(elapsed: number): TimelinePosition {
  if (LOOP_DURATION === 0) {
    return {
      cycle: 0,
      scene: "web",
      sceneIndex: 0,
      sceneElapsed: 0,
      step: 0,
      stepElapsed: 0,
    };
  }

  const cycle = Math.floor(elapsed / LOOP_DURATION);
  let loopCursor = elapsed % LOOP_DURATION;

  for (let sceneIndex = 0; sceneIndex < SCENE_ORDER.length; sceneIndex += 1) {
    const scene = SCENE_ORDER[sceneIndex];
    const sceneDuration = SCENE_TOTALS[scene];

    if (loopCursor < sceneDuration) {
      let sceneCursor = loopCursor;

      for (let stepIndex = 0; stepIndex < SCENE_DURATIONS[scene].length; stepIndex += 1) {
        const stepDuration = SCENE_DURATIONS[scene][stepIndex];

        if (sceneCursor < stepDuration) {
          return {
            cycle,
            scene,
            sceneIndex,
            sceneElapsed: loopCursor,
            step: stepIndex,
            stepElapsed: sceneCursor,
          };
        }

        sceneCursor -= stepDuration;
      }

      const finalStep = SCENE_DURATIONS[scene].length - 1;

      return {
        cycle,
        scene,
        sceneIndex,
        sceneElapsed: loopCursor,
        step: finalStep,
        stepElapsed: SCENE_DURATIONS[scene][finalStep],
      };
    }

    loopCursor -= sceneDuration;
  }

  return {
    cycle: 0,
    scene: "web",
    sceneIndex: 0,
    sceneElapsed: 0,
    step: 0,
    stepElapsed: 0,
  };
}

export function getCompletedScenePosition(scene: SceneKind): TimelinePosition {
  const sceneIndex = SCENE_ORDER.indexOf(scene);
  const finalStep = SCENE_DURATIONS[scene].length - 1;

  return {
    cycle: 0,
    scene,
    sceneIndex,
    sceneElapsed: SCENE_TOTALS[scene],
    step: finalStep,
    stepElapsed: SCENE_DURATIONS[scene][finalStep],
  };
}

export function getStepStart(scene: SceneKind, step: number) {
  return SCENE_DURATIONS[scene]
    .slice(0, step)
    .reduce((sum, duration) => sum + duration, 0);
}

export function getSceneLoopOffset(targetScene: SceneKind) {
  return SCENE_ORDER.slice(0, SCENE_ORDER.indexOf(targetScene)).reduce(
    (sum, scene) => sum + SCENE_TOTALS[scene],
    0,
  );
}

function getRemainingSceneDuration(scene: SceneKind, startStep: number) {
  return SCENE_DURATIONS[scene]
    .slice(startStep)
    .reduce((sum, duration) => sum + duration, 0);
}

export function getResponsiveTypingSpeed({
  scene,
  startStep,
  target,
  preferredSpeed,
  endHold = 420,
}: {
  scene: SceneKind;
  startStep: number;
  target: string;
  preferredSpeed: number;
  endHold?: number;
}) {
  const availableDuration = Math.max(180, getRemainingSceneDuration(scene, startStep) - endHold);
  const maxSafeSpeed = availableDuration / Math.max(target.length, 1);

  return Math.min(preferredSpeed, maxSafeSpeed);
}

export function getTypedText(target: string, sceneElapsed: number, startAt: number, speed: number) {
  if (sceneElapsed < startAt) {
    return "";
  }

  const visibleCharacters = Math.floor((sceneElapsed - startAt) / speed);

  return target.slice(0, Math.min(target.length, visibleCharacters));
}

export function getDeviceKind(
  showcaseWidth: number,
  viewportWidth: number,
  viewportHeight: number,
): DeviceKind {
  if (showcaseWidth >= 620) {
    return "desktop";
  }

  const isCompactLandscape = viewportWidth > viewportHeight && viewportHeight < 560;

  if (isCompactLandscape && showcaseWidth >= 360) {
    return "tablet";
  }

  if (viewportWidth < 640 && showcaseWidth < 410) {
    return "phone";
  }

  if (showcaseWidth >= 410) {
    return "tablet";
  }

  if (viewportWidth >= 640) {
    return "tablet";
  }

  return "phone";
}

export function getSceneTitle(scene: SceneKind) {
  if (scene === "research") {
    return "Deep research";
  }

  if (scene === "workspace") {
    return "Google Workspace";
  }

  return "Web search";
}

export function getResearchStepState(step: number, index: number): ProcessState {
  const stagePointer = step - 1;

  if (stagePointer < index) {
    return "pending";
  }

  if (stagePointer === index && step < RESEARCH_STEPS.length + 1) {
    return "current";
  }

  return "completed";
}
