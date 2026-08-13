import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { id: "/", name: "AILI Pi Workbench", short_name: "AILI Pi", description: "Private workbench for official Pi sessions", start_url: "/", scope: "/", display: "standalone", background_color: "#151719", theme_color: "#151719", categories: ["developer", "productivity"], lang: "en" };
}
