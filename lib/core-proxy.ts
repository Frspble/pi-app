import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

interface CoreEndpoint {
  url: string;
  token: string;
}

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function getUserDataCandidates(): string[] {
  if (process.env.PI_CORE_SERVICE_FILE) {
    return [process.env.PI_CORE_SERVICE_FILE];
  }
  if (process.env.PI_APP_USER_DATA_DIR) {
    return [process.env.PI_APP_USER_DATA_DIR];
  }
  if (process.platform === "darwin") {
    return [join(homedir(), "Library", "Application Support", "PiApp")];
  }
  if (process.platform === "win32") {
    return [
      process.env.APPDATA ? join(process.env.APPDATA, "PiApp") : "",
      join(homedir(), "AppData", "Roaming", "PiApp"),
    ].filter(Boolean);
  }
  return [
    process.env.XDG_CONFIG_HOME ? join(process.env.XDG_CONFIG_HOME, "PiApp") : "",
    join(homedir(), ".config", "PiApp"),
  ].filter(Boolean);
}

function readEndpointFile(): CoreEndpoint | null {
  for (const candidate of getUserDataCandidates()) {
    const filePath = candidate.endsWith(".json") ? candidate : join(candidate, "core-service.json");
    try {
      if (!existsSync(filePath)) continue;
      const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Partial<CoreEndpoint>;
      if (typeof parsed.url === "string" && typeof parsed.token === "string") {
        return { url: parsed.url, token: parsed.token };
      }
    } catch {
      // Keep falling back; this file is advisory for external dev servers.
    }
  }
  return null;
}

export function getCoreServiceEndpoint(): CoreEndpoint | null {
  const fileEndpoint = readEndpointFile();
  if (fileEndpoint) return fileEndpoint;
  const url = process.env.PI_CORE_SERVICE_URL;
  const token = process.env.PI_CORE_SERVICE_TOKEN;
  if (url && token) return { url, token };
  return null;
}

export function hasCoreServiceEndpoint(): boolean {
  return getCoreServiceEndpoint() !== null;
}

export async function fetchCoreService(pathAndSearch: string, init: RequestInit = {}): Promise<Response> {
  const endpoint = getCoreServiceEndpoint();
  if (!endpoint) throw new Error("Pi Core service is unavailable");
  const url = new URL(pathAndSearch, endpoint.url);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${endpoint.token}`);
  return fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });
}

function copyRequestHeaders(request: Request): Headers {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });
  return headers;
}

function copyResponseHeaders(response: Response): Headers {
  const headers = new Headers();
  response.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });
  return headers;
}

export async function proxyToCoreService(request: Request): Promise<Response | null> {
  const endpoint = getCoreServiceEndpoint();
  if (!endpoint) {
    if (!isDesktopProxyRequired()) return null;
    return Response.json(
      { error: "Pi Core service is unavailable", detail: "Missing Pi Core service endpoint" },
      { status: 503 }
    );
  }

  const requestUrl = new URL(request.url);
  const headers = copyRequestHeaders(request);
  headers.set("Authorization", `Bearer ${endpoint.token}`);

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.clone().arrayBuffer();
  }

  let response: Response;
  try {
    response = await fetch(new URL(`${requestUrl.pathname}${requestUrl.search}`, endpoint.url), init);
  } catch (error) {
    if (!isDesktopProxyRequired()) return null;
    return Response.json(
      { error: "Pi Core service is unavailable", detail: String(error) },
      { status: 503 }
    );
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: copyResponseHeaders(response),
  });
}

function isDesktopProxyRequired(): boolean {
  return process.env.PI_APP_DESKTOP === "1" || Boolean(process.env.PI_APP_USER_DATA_DIR);
}

export async function fetchCoreJson<T>(pathAndSearch: string): Promise<T | null> {
  const endpoint = getCoreServiceEndpoint();
  if (!endpoint) {
    if (!isDesktopProxyRequired()) return null;
    throw new Error("Pi Core service is unavailable");
  }
  let response: Response;
  try {
    response = await fetchCoreService(pathAndSearch);
  } catch {
    if (!isDesktopProxyRequired()) return null;
    throw new Error("Pi Core service is unavailable");
  }
  if (!response.ok) return null;
  return response.json() as Promise<T>;
}
