import { NextResponse } from "next/server";
import { proxyToCoreService } from "@/lib/core-proxy";

export async function GET(req: Request) {
  try {
    const proxied = await proxyToCoreService(req);
    if (proxied) return proxied;

    const { listAllSessions } = await import("@/lib/session-reader");
    const sessions = await listAllSessions();
    return NextResponse.json({ sessions });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
