import { proxyToCoreService } from "@/lib/core-proxy";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const proxied = await proxyToCoreService(req);
  if (proxied) return proxied;

  const { getRpcRuntimeState } = await import("@/lib/rpc-manager");
  return Response.json(getRpcRuntimeState());
}
