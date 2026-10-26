import type { MetadataRoute } from "next";

// Base PWA : les icônes et le service worker seront ajoutés dans une étape ultérieure.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WifiAfrik",
    short_name: "WifiAfrik",
    description: "Forfaits eSIM pour l'Afrique francophone.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
  };
}
