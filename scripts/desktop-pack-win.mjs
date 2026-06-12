import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildHome = join(root, ".build-home");
const npmCli = process.env.npm_execpath;
const electronBuilderCli = join(root, "node_modules", "electron-builder", "cli.js");

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: root,
      env: options.env ?? process.env,
      shell: false,
      stdio: "inherit",
    });

    child.on("error", rejectRun);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(new Error(`${command} ${args.join(" ")} exited with ${signal ?? code}`));
    });
  });
}

function makeBuildEnv() {
  const appData = join(buildHome, "AppData", "Roaming");
  const localAppData = join(buildHome, "AppData", "Local");
  mkdirSync(appData, { recursive: true });
  mkdirSync(localAppData, { recursive: true });

  return {
    ...process.env,
    HOME: buildHome,
    USERPROFILE: buildHome,
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    NEXT_TELEMETRY_DISABLED: "1",
  };
}

function makePackEnv() {
  return {
    ...process.env,
    ELECTRON_MIRROR: process.env.ELECTRON_MIRROR ?? "https://npmmirror.com/mirrors/electron/",
    ELECTRON_BUILDER_BINARIES_MIRROR: process.env.ELECTRON_BUILDER_BINARIES_MIRROR ?? "https://npmmirror.com/mirrors/electron-builder-binaries/",
  };
}

function cleanBuildHome() {
  if (!existsSync(buildHome)) return;
  const resolved = resolve(buildHome);
  if (!resolved.startsWith(`${root}\\`) && !resolved.startsWith(`${root}/`)) {
    throw new Error(`Refusing to remove path outside project: ${resolved}`);
  }
  rmSync(resolved, { recursive: true, force: true });
}

try {
  cleanBuildHome();
  if (!npmCli) throw new Error("npm_execpath is not set. Run this script through npm run desktop:pack:win.");
  await run(process.execPath, [npmCli, "run", "build"], { env: makeBuildEnv() });
  await run(process.execPath, [electronBuilderCli, "--win", "--publish", "never"], {
    env: makePackEnv(),
  });
} finally {
  cleanBuildHome();
}
