import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tavern POS",
    short_name: "Tavern POS",
    description: "Offline-capable tavern point of sale and dashboard",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#d4af37",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
