import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { proxyToCoreService } from "@/lib/core-proxy";

export const dynamic = "force-dynamic";

async function getModelsPath(): Promise<string> {
  const { getAgentDir } = await import("@earendil-works/pi-coding-agent");
  return join(getAgentDir(), "models.json");
}

async function readModelsJson(): Promise<Record<string, unknown>> {
  const path = await getModelsPath();
  if (!existsSync(path)) return { providers: {} };
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return { providers: {} };
  }
}

async function writeModelsJson(data: Record<string, unknown>): Promise<void> {
  const path = await getModelsPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}

export async function GET(req: Request) {
  const proxied = await proxyToCoreService(req);
  if (proxied) return proxied;
  return NextResponse.json(await readModelsJson());
}

export async function PUT(req: Request) {
  try {
    const proxied = await proxyToCoreService(req);
    if (proxied) return proxied;
    const body = await req.json() as Record<string, unknown>;
    await writeModelsJson(body);
    // Model registry refreshes on each /api/models request (no local cache to invalidate)
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
