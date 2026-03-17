"use client";

export interface ImageModalTheme {
  panel: string;
  mobilePanel: string;
  border: string;
  title: string;
  mutedText: string;
  closeButton: string;
  imageFrame: string;
  loadingOverlay: string;
  loader: string;
  errorCard: string;
  errorIcon: string;
  errorAccent: string;
  errorMutedText: string;
  galleryCard: string;
  emptyState: string;
}

export function getImageModalTheme(resolvedTheme?: string): ImageModalTheme {
  const isLight = resolvedTheme === "light";

  if (isLight) {
    return {
      panel:
        "border-black/10 bg-white/95 text-slate-950 shadow-[0_20px_80px_rgba(15,23,42,0.18)]",
      mobilePanel: "border-black/10 bg-white text-slate-950 shadow-none",
      border: "border-black/10",
      title: "text-slate-950",
      mutedText: "text-slate-600",
      closeButton:
        "text-slate-500 hover:bg-black/5 hover:text-slate-950 focus-visible:ring-black/10",
      imageFrame: "bg-black/[0.03]",
      loadingOverlay: "bg-white/72 backdrop-blur-sm",
      loader: "text-slate-700",
      errorCard: "border-black/10 bg-black/[0.03]",
      errorIcon: "text-slate-400",
      errorAccent: "text-amber-500/90",
      errorMutedText: "text-slate-600",
      galleryCard:
        "border-black/10 bg-black/[0.03] shadow-[0_14px_40px_rgba(15,23,42,0.12)]",
      emptyState: "border-black/10 bg-black/[0.03]",
    };
  }

  return {
    panel:
      "border-white/10 bg-neutral-950/92 text-white shadow-[0_20px_80px_rgba(0,0,0,0.45)]",
    mobilePanel: "border-white/10 bg-neutral-950 text-white shadow-none",
    border: "border-white/10",
    title: "text-white",
    mutedText: "text-white/65",
    closeButton:
      "text-white/70 hover:bg-white/8 hover:text-white focus-visible:ring-white/15",
    imageFrame: "bg-white/[0.03]",
    loadingOverlay: "bg-black/35 backdrop-blur-sm",
    loader: "text-white",
    errorCard: "border-white/10 bg-white/5",
    errorIcon: "text-white/35",
    errorAccent: "text-amber-300/75",
    errorMutedText: "text-white/65",
    galleryCard:
      "border-white/10 bg-white/[0.03] shadow-[0_18px_40px_rgba(0,0,0,0.3)]",
    emptyState: "border-white/10 bg-white/[0.03]",
  };
}
