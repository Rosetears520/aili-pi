import { NextResponse } from "next/server";
import { readModelsConfig } from "@/lib/models-config-store";
import { translateConfigurationRoute } from "@/server/configuration-route-facade";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(readModelsConfig());
}

export async function PUT(req: Request) {
  return translateConfigurationRoute(req, "models.configure", "replace", (body) => ({ config: body }));
}
