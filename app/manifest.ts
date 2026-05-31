import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Agentic Chat",
    short_name: "Agentic",
    description: "AI chat app with web search, memory, and tools",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#066BFA",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png" },
    ],
  };
}
