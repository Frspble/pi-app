import { proxyToCoreService } from "@/lib/core-proxy";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

function readConfiguredContextWindows(agentDir: string): Map<string, number> {
  const result = new Map<string, number>();
  const modelsPath = join(agentDir, "models.json");
  if (!existsSync(modelsPath)) return result;

  try {
    const parsed = JSON.parse(readFileSync(modelsPath, "utf8")) as {
      providers?: Record<string, { models?: Array<{ id?: unknown; contextWindow?: unknown }> }>;
    };
    for (const [provider, config] of Object.entries(parsed.providers ?? {})) {
      for (const model of config.models ?? []) {
        if (typeof model.id === "string" && typeof model.contextWindow === "number") {
          result.set(`${provider}:${model.id}`, model.contextWindow);
        }
      }
    }
  } catch {
    // Registry values are still usable without this optional fallback.
  }
  return result;
}

export async function GET(req: Request) {
  const proxied = await proxyToCoreService(req);
  if (proxied) return proxied;

  const [{ AuthStorage, ModelRegistry, SettingsManager, getAgentDir }, { getSupportedThinkingLevels }] = await Promise.all([
    import("@earendil-works/pi-coding-agent"),
    import("@earendil-works/pi-ai"),
  ]);
  const nameMap = new Map<string, string>();
  let modelList: { id: string; name: string; provider: string; contextWindow?: number }[] = [];
  let defaultModel: { provider: string; modelId: string } | null = null;
  const thinkingLevels: Record<string, string[]> = {};
  const thinkingLevelMaps: Record<string, Record<string, string | null>> = {};

  try {
    const agentDir = getAgentDir();
    const configuredContextWindows = readConfiguredContextWindows(agentDir);
    const authStorage = AuthStorage.create();
    const registry = ModelRegistry.create(authStorage);
    const available = registry.getAvailable();
    modelList = available.map((m: { id: string; name: string; provider: string; contextWindow?: number }) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      ...(typeof m.contextWindow === "number"
        ? { contextWindow: m.contextWindow }
        : configuredContextWindows.has(`${m.provider}:${m.id}`)
          ? { contextWindow: configuredContextWindows.get(`${m.provider}:${m.id}`) }
          : {}),
    }));
    for (const m of available) {
      const key = `${m.provider}:${m.id}`;
      nameMap.set(key, m.name);
      thinkingLevels[key] = getSupportedThinkingLevels(m);
      if (m.thinkingLevelMap) thinkingLevelMaps[key] = m.thinkingLevelMap;
    }

    const settings = SettingsManager.create(process.cwd(), agentDir);
    const provider = settings.getDefaultProvider();
    const modelId = settings.getDefaultModel();
    if (provider) {
      defaultModel = { provider, modelId: modelId ?? available[0]?.id ?? "" };
    }
  } catch { /* return empty */ }

  return Response.json({ models: Object.fromEntries(nameMap), modelList, defaultModel, thinkingLevels, thinkingLevelMaps });
}
