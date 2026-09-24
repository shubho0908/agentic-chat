export enum DeviceKind {
  Desktop = "desktop",
  Tablet = "tablet",
  Phone = "phone",
}

export enum SceneKind {
  WebSearch = "web",
  Orchestration = "orchestration",
  DeepResearch = "deep-research",
}

export enum DeviceOrientation {
  Portrait = "portrait",
  Landscape = "landscape",
}

export interface TimelinePosition {
  cycle: number;
  scene: SceneKind;
  sceneIndex: number;
  sceneElapsed: number;
  step: number;
  stepElapsed: number;
}
