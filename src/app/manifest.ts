import type { MetadataRoute } from "next";

/* Generates the PWA manifest served at /manifest.webmanifest. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Oche — Compteur de Fléchettes",
    short_name: "Oche",
    description:
      "Compteur de scores de fléchettes hors-ligne : 301/501, Cricket et Cut-Throat.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#141109",
    theme_color: "#141109",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
