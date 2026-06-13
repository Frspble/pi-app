import { NextResponse } from "next/server";
import { proxyToCoreService } from "@/lib/core-proxy";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(req.url);
  const leafId = url.searchParams.get("leafId") ?? undefined;

  try {
    const proxied = await proxyToCoreService(req);
    if (proxied) return proxied;

    const [{ SessionManager }, { resolveSessionPath, buildSessionContext }] = await Promise.all([
      import("@earendil-works/pi-coding-agent"),
      import("@/lib/session-reader"),
    ]);
    const filePath = await resolveSessionPath(id);
    if (!filePath) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const sm = SessionManager.open(filePath);
    const context = buildSessionContext(sm.getEntries() as never, leafId);

    return NextResponse.json({ context });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
