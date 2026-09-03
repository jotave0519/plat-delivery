import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Balcão — gestão de delivery",
    short_name: "Balcão",
    description: "Pedidos, cardápio, clientes, estoque e financeiro em um só lugar.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#14161b",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "maskable" },
    ],
  };
}
