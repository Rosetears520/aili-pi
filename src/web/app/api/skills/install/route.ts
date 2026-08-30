import { translateConfigurationRoute } from "@/server/configuration-route-facade";

export const dynamic = "force-dynamic";

/** Retained facade; package execution is owned by the configuration RuntimeHost. */
export async function POST(req: Request) {
  return translateConfigurationRoute(req, "skills.configure", "install");
}
