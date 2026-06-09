import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const { version } = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8")) as { version: string };
let piVersion = "unknown";
try {
  const piPkgPath = join(__dirname, "node_modules/@earendil-works/pi-coding-agent/package.json");
  piVersion = (JSON.parse(readFileSync(piPkgPath, "utf8")) as { version: string }).version;
} catch { /* package not found, use default */ }

const nextConfig: NextConfig = {
  serverExternalPackages: ["@earendil-works/pi-coding-agent", "@earendil-works/pi-ai"],
  outputFileTracingRoot: resolve(__dirname),
  outputFileTracingExcludes: {
    "/*": [
      "../**/Application Data/**",
      "../**/Cookies/**",
      "../**/Local Settings/**",
      "../**/NetHood/**",
      "../**/PrintHood/**",
      "../**/Recent/**",
      "../**/SendTo/**",
      "../**/Start Menu/**",
      "../**/Templates/**",
      "**/node_modules/@earendil-works/pi-agent-core/**",
      "**/node_modules/@earendil-works/pi-ai/**",
      "**/node_modules/@earendil-works/pi-coding-agent/**",
      "**/node_modules/@earendil-works/pi-tui/**",
    ],
  },
  allowedDevOrigins: ['192.168.*.*'],
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_PI_VERSION: piVersion,
  },
};

export default nextConfig;
