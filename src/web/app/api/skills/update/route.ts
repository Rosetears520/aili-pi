import { translateConfigurationRoute } from "@/server/configuration-route-facade";
import { loadSkillsWithInstallInfo } from "@/lib/skills-service";

export const dynamic = "force-dynamic";

/** Retained facade; package execution is owned by the configuration RuntimeHost. */
export async function POST(req: Request) {
  let input: { cwd?: string; package?: string; scope?: "global" | "project" } = {};
  try { input = await req.clone().json() as typeof input; } catch { /* translator owns parse semantics */ }
  const translated = await translateConfigurationRoute(req, "skills.configure", "update");
  if (!translated.ok || !input.cwd || !input.package || !input.scope) return translated;
  const { cwd, package: pkg, scope } = input;
  const refreshed = await loadSkillsWithInstallInfo(cwd);
  const skill = refreshed.skills.find((item) => item.install?.package === pkg && item.install.scope === scope);
  const result = await translated.json() as { output?: string };
  return Response.json({ success: true, skill, output: result.output ?? "" });
}
