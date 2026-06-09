import { getRpcRuntimeState } from "@/lib/rpc-manager";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(getRpcRuntimeState());
}
