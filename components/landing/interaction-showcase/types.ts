export type DeviceKind = "desktop" | "tablet" | "phone";
export type SceneKind = "web" | "workspace";

export interface TimelinePosition {
  cycle: number;
  scene: SceneKind;
  sceneIndex: number;
  sceneElapsed: number;
  step: number;
  stepElapsed: number;
}
