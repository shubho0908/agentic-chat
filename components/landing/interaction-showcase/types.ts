export type DeviceKind = "desktop" | "tablet" | "phone";
export type SceneKind = "web" | "research" | "workspace";
export type ProcessState = "completed" | "current" | "pending";

export interface ResearchStep {
  key: string;
  title: string;
  detail: string;
}

export interface TimelinePosition {
  cycle: number;
  scene: SceneKind;
  sceneIndex: number;
  sceneElapsed: number;
  step: number;
  stepElapsed: number;
}
