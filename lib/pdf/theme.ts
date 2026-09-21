import { PdfAccent, type PdfAccentValue } from "./document";

export interface PdfTheme {
  accent: string;
  ink: string;
  body: string;
  muted: string;
  faint: string;
  hairline: string;
  surface: string;
  codeSurface: string;
  codeBorder: string;
  watermark: string;
}

const ACCENT_COLORS: Record<PdfAccentValue, string> = {
  [PdfAccent.SLATE]: "#334155",
  [PdfAccent.INDIGO]: "#4F46E5",
  [PdfAccent.EMERALD]: "#047857",
  [PdfAccent.AMBER]: "#B45309",
  [PdfAccent.ROSE]: "#BE123C",
};

export const PdfCalloutVariant = {
  INFO: "info",
  WARNING: "warning",
  SUCCESS: "success",
  DANGER: "danger",
} as const;
export type PdfCalloutVariantValue =
  (typeof PdfCalloutVariant)[keyof typeof PdfCalloutVariant];

export const CALLOUT_COLORS: Record<
  PdfCalloutVariantValue,
  { bar: string; surface: string; title: string }
> = {
  [PdfCalloutVariant.INFO]: { bar: "#2563EB", surface: "#EFF6FF", title: "#1E40AF" },
  [PdfCalloutVariant.WARNING]: { bar: "#D97706", surface: "#FFFBEB", title: "#92400E" },
  [PdfCalloutVariant.SUCCESS]: { bar: "#059669", surface: "#ECFDF5", title: "#065F46" },
  [PdfCalloutVariant.DANGER]: { bar: "#DC2626", surface: "#FEF2F2", title: "#991B1B" },
};

export function resolveTheme(accent?: PdfAccentValue): PdfTheme {
  return {
    accent: ACCENT_COLORS[accent ?? PdfAccent.SLATE],
    ink: "#18181B",
    body: "#27272A",
    muted: "#52525B",
    faint: "#A1A1AA",
    hairline: "#E4E4E7",
    surface: "#F4F4F5",
    codeSurface: "#F6F8FA",
    codeBorder: "#E5E7EB",
    watermark: "#A1A1AA",
  };
}
