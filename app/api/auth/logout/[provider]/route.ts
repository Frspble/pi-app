import { proxyToCoreService } from "@/lib/core-proxy";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const proxied = await proxyToCoreService(req);
  if (proxied) return proxied;

  const { AuthStorage } = await import("@earendil-works/pi-coding-agent");
  const authStorage = AuthStorage.create();
  const providers = authStorage.getOAuthProviders();
  if (!providers.find((p) => p.id === provider)) {
    return Response.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
  }
  authStorage.logout(provider);
  return Response.json({ ok: true });
}
