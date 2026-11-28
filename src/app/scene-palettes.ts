export const SCENE_IDS = [
  "claude-code",
  "cloud-drift",
  "honu-lagoon",
  "koi-pond",
  "jellyfish",
] as const;
export type SceneId = (typeof SCENE_IDS)[number];

export function isSceneId(value: unknown): value is SceneId {
  return SCENE_IDS.some((id) => id === value);
}

type ScenePalette = Readonly<{
  label: string;
  mode: "light" | "dark";
  background: string;
  canvas: string;
  surface: string;
  selected: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  fill: string;
  glow: string;
  sprite: string;
  detail: string;
}>;

// Mobile interpretations of the five scenes in the reference footage, not screenshots.
export const SCENE_PALETTES = {
  "claude-code": {
    label: "Claude Code",
    mode: "dark",
    background: "#17120F",
    canvas: "#211913",
    surface: "#2E2119",
    selected: "#3A2B22",
    border: "#584237",
    text: "#FFF0E6",
    muted: "#CDB1A2",
    accent: "#F6AE8D",
    fill: "#A3452C",
    glow: "#522D22",
    sprite: "#C6573E",
    detail: "#F3A67C",
  },
  "cloud-drift": {
    label: "Cloud Drift",
    mode: "light",
    background: "#D6ECFA",
    canvas: "#F4FAFF",
    surface: "#E7F3FB",
    selected: "#C4E0F3",
    border: "#A8C9DF",
    text: "#173751",
    muted: "#405F77",
    accent: "#28567F",
    fill: "#2A628F",
    glow: "#8CC6EC",
    sprite: "#FAFDFF",
    detail: "#A6D3F0",
  },
  "honu-lagoon": {
    label: "Honu Lagoon",
    mode: "dark",
    background: "#10373E",
    canvas: "#10313A",
    surface: "#18444C",
    selected: "#25565D",
    border: "#39727A",
    text: "#EAFFFB",
    muted: "#A9D4D0",
    accent: "#9AEEE0",
    fill: "#126A67",
    glow: "#247F81",
    sprite: "#C3B85A",
    detail: "#55B69B",
  },
  "koi-pond": {
    label: "Koi Pond",
    mode: "dark",
    background: "#19362D",
    canvas: "#172C25",
    surface: "#214337",
    selected: "#2D5143",
    border: "#426A58",
    text: "#F5FBED",
    muted: "#BDCEB3",
    accent: "#F8C397",
    fill: "#A64533",
    glow: "#40816B",
    sprite: "#E8AE72",
    detail: "#8BC47A",
  },
  jellyfish: {
    label: "Jellyfish",
    mode: "dark",
    background: "#0C1C37",
    canvas: "#111C33",
    surface: "#1B2947",
    selected: "#29395C",
    border: "#40547D",
    text: "#F5F0FF",
    muted: "#C1C3DF",
    accent: "#DBC4FC",
    fill: "#674695",
    glow: "#244A76",
    sprite: "#A888D5",
    detail: "#E7A6BB",
  },
} as const satisfies Readonly<Record<SceneId, ScenePalette>>;
