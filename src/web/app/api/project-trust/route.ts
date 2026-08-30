import { stat } from "fs/promises";
import { resolve } from "path";
import { NextResponse } from "next/server";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { getAllowedFileRoots, isExistingFilePathAllowed } from "@/lib/file-access";
import { getProjectTrustStatus } from "@/lib/project-trust";
import { translateConfigurationRoute } from "@/server/configuration-route-facade";

export const dynamic = "force-dynamic";

async function validateCwd(value: unknown): Promise<
  { cwd: string } | { response: NextResponse }
> {
  if (typeof value !== "string" || !value.trim()) {
    return { response: NextResponse.json({ error: "cwd required" }, { status: 400 }) };
  }

  const cwd = resolve(value);
  try {
    if (!(await stat(cwd)).isDirectory()) {
      return { response: NextResponse.json({ error: "cwd must be a directory" }, { status: 400 }) };
    }
  } catch {
    return { response: NextResponse.json({ error: "Directory does not exist" }, { status: 400 }) };
  }

  const allowedRoots = await getAllowedFileRoots();
  if (!isExistingFilePathAllowed(cwd, allowedRoots)) {
    return { response: NextResponse.json({ error: "Access denied" }, { status: 403 }) };
  }
  return { cwd };
}

export async function GET(req: Request) {
  const result = await validateCwd(new URL(req.url).searchParams.get("cwd"));
  if ("response" in result) return result.response;
  return NextResponse.json(getProjectTrustStatus(result.cwd, getAgentDir()));
}

// Retained URL: translation only. Validation is repeated inside the Runtime-owned service.
export async function POST(req: Request) {
  return translateConfigurationRoute(
    req,
    "project_trust.configure",
    "trust",
    undefined,
    (reason) => reason === "Access denied" ? 403
      : reason === "Directory does not exist" ? 400
        : reason.startsWith("This project has no resources") || reason.startsWith("Wait for the active session") ? 409
          : 500,
  );
}
