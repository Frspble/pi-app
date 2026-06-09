/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

const PRODUCT_NAME = "Pi App";
const CORE_PACKAGES = [
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-ai",
];
const CORE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const NPM_TIMEOUT_MS = 10 * 60 * 1000;
const SERVER_READY_TIMEOUT_MS = 90 * 1000;

app.setName(PRODUCT_NAME);
if (process.platform === "win32") {
  app.setAppUserModelId("works.earendil.pi-app");
}

let mainWindow = null;
let statusWindow = null;
let nextProcess = null;
let serverUrl = null;
let runtimeInfo = null;
let isBooting = false;
let isStoppingForQuit = false;
let statusLoadId = 0;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getAppRoot() {
  return path.resolve(__dirname, "..");
}

function getRuntimeDir() {
  return path.join(app.getPath("userData"), "runtime");
}

function getRuntimeNodeModules(runtimeDir) {
  return path.join(runtimeDir, "node_modules");
}

function getLogPath() {
  return path.join(app.getPath("userData"), "desktop.log");
}

function log(message, detail = "") {
  const body = detail ? `${message}\n${detail}` : message;
  const line = `[${new Date().toISOString()}] ${body}\n`;
  console.log(line.trimEnd());
  try {
    const logPath = getLogPath();
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, line);
  } catch {
    // Logging must never block startup.
  }
}

function getHomeDir() {
  try {
    if (app.isReady()) return app.getPath("home");
  } catch {
    // Fall back to environment paths below.
  }
  return process.env.HOME || process.env.USERPROFILE || "";
}

function getNvmNodeDirs(homeDir) {
  const versionsDir = path.join(homeDir, ".nvm", "versions", "node");
  try {
    return fs.readdirSync(versionsDir)
      .filter((entry) => entry.startsWith("v"))
      .sort(compareSemver)
      .reverse()
      .map((entry) => path.join(versionsDir, entry, "bin"));
  } catch {
    return [];
  }
}

function getExtraPathEntries(env = process.env) {
  const homeDir = getHomeDir();
  if (process.platform === "win32") {
    return [
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Programs", "nodejs"),
      env.ProgramFiles && path.join(env.ProgramFiles, "nodejs"),
      env["ProgramFiles(x86)"] && path.join(env["ProgramFiles(x86)"], "nodejs"),
      env.APPDATA && path.join(env.APPDATA, "npm"),
    ].filter(Boolean);
  }

  return [
    homeDir && path.join(homeDir, ".volta", "bin"),
    homeDir && path.join(homeDir, ".asdf", "shims"),
    homeDir && path.join(homeDir, ".fnm", "current", "bin"),
    ...getNvmNodeDirs(homeDir),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ].filter(Boolean);
}

function getDesktopPathEntries(env = process.env) {
  const current = env.PATH ? env.PATH.split(path.delimiter) : [];
  const merged = [...current, ...getExtraPathEntries(env)].filter(Boolean);
  return [...new Set(merged)];
}

function withDesktopPath(env = process.env) {
  return {
    ...env,
    PATH: getDesktopPathEntries(env).join(path.delimiter),
  };
}

function hasPathSeparator(command) {
  return command.includes("/") || command.includes("\\");
}

function isRunnable(filePath) {
  try {
    fs.accessSync(filePath, process.platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findCommand(command, env = process.env) {
  if (hasPathSeparator(command)) return command;
  const names = process.platform === "win32" && !/\.(cmd|exe)$/i.test(command)
    ? [`${command}.cmd`, `${command}.exe`, command]
    : [command];

  for (const dir of getDesktopPathEntries(env)) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (isRunnable(candidate)) return candidate;
    }
  }
  return null;
}

function getNpmCommand() {
  if (process.env.PI_WEB_NPM) return process.env.PI_WEB_NPM;
  return findCommand(process.platform === "win32" ? "npm.cmd" : "npm") || (process.platform === "win32" ? "npm.cmd" : "npm");
}

function getNodeCommand() {
  if (process.env.PI_WEB_NODE) return process.env.PI_WEB_NODE;
  return findCommand("node") || "node";
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function getExternalServerUrl() {
  return process.env.PI_WEB_SERVER_URL || getArgValue("--server-url") || null;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    log(`Running command: ${command} ${args.join(" ")}`);
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: withDesktopPath(options.env),
      shell: options.shell ?? false,
      windowsHide: true,
    });

    const timer = options.timeout
      ? setTimeout(() => {
          child.kill();
          reject(new Error(`${command} timed out after ${options.timeout}ms`));
        }, options.timeout)
      : null;

    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      options.onStdout?.(text);
    });
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      options.onStderr?.(text);
    });
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      log(`Command failed to start: ${command}`, error.stack || error.message);
      reject(error);
    });
    child.on("exit", (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error(`${command} ${args.join(" ")} exited with code ${code}`);
      error.stdout = stdout;
      error.stderr = stderr;
      log(`Command exited with code ${code}: ${command} ${args.join(" ")}`, stderr || stdout);
      reject(error);
    });
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readPackageJson() {
  return readJson(path.join(getAppRoot(), "package.json"));
}

function getCoreSpecs() {
  const pkg = readPackageJson();
  const coreDeps = pkg.piCore?.dependencies ?? {};
  const deps = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.peerDependencies ?? {}),
    ...(pkg.optionalDependencies ?? {}),
  };
  return CORE_PACKAGES.map((name) => ({
    name,
    range: coreDeps[name] || deps[name] || "latest",
  }));
}

function ensureRuntimePackageJson(runtimeDir, specs) {
  fs.mkdirSync(runtimeDir, { recursive: true });
  const runtimePkgPath = path.join(runtimeDir, "package.json");
  let runtimePkg = {};
  if (fs.existsSync(runtimePkgPath)) {
    try {
      runtimePkg = readJson(runtimePkgPath);
    } catch {
      runtimePkg = {};
    }
  }

  const nextPkg = {
    name: "pi-app-runtime",
    private: true,
    version: "0.0.0",
    ...runtimePkg,
    dependencies: {
      ...(runtimePkg.dependencies ?? {}),
    },
  };
  for (const spec of specs) {
    nextPkg.dependencies[spec.name] = spec.range;
  }

  fs.writeFileSync(runtimePkgPath, `${JSON.stringify(nextPkg, null, 2)}\n`);
}

function readInstalledCoreVersions(runtimeDir) {
  const versions = {};
  for (const name of CORE_PACKAGES) {
    const pkgPath = path.join(runtimeDir, "node_modules", ...name.split("/"), "package.json");
    try {
      versions[name] = readJson(pkgPath).version ?? null;
    } catch {
      versions[name] = null;
    }
  }
  return versions;
}

function missingCorePackages(versions) {
  return CORE_PACKAGES.filter((name) => !versions[name]);
}

function createStatusHtml(title, message, detail = "") {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        margin: 0;
        height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #1a1a1a;
        color: #e8e8e8;
        font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: 420px;
        line-height: 1.5;
      }
      h1 {
        margin: 0 0 10px;
        font-size: 18px;
      }
      p {
        margin: 0 0 12px;
        color: #b6beca;
      }
      pre {
        max-height: 120px;
        overflow: auto;
        margin: 0;
        padding: 10px;
        border: 1px solid #3a3a3a;
        border-radius: 6px;
        background: #111;
        color: #9ca3af;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      ${detail ? `<pre>${escapeHtml(detail.slice(-4000))}</pre>` : ""}
    </main>
  </body>
</html>`;
}

async function showStatus(title, message, detail = "") {
  const loadId = ++statusLoadId;
  if (!statusWindow || statusWindow.isDestroyed()) {
    statusWindow = new BrowserWindow({
      width: 520,
      height: 320,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      title: PRODUCT_NAME,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
  }
  const html = createStatusHtml(title, message, detail);
  try {
    await statusWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  } catch (error) {
    const messageText = String(error?.message || error);
    if (!messageText.includes("ERR_ABORTED") && !messageText.includes("ERR_FAILED")) {
      throw error;
    }
  }
  if (loadId === statusLoadId && !statusWindow.isDestroyed() && !statusWindow.isVisible()) {
    statusWindow.show();
  }
}

function closeStatus() {
  statusLoadId++;
  if (statusWindow && !statusWindow.isDestroyed()) {
    statusWindow.close();
  }
  statusWindow = null;
}

function waitForHttp(url, timeoutMs = 30_000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      let requestDone = false;
      const req = http.get(url, (res) => {
        if (requestDone) return;
        requestDone = true;
        res.resume();
        if ((res.statusCode ?? 500) < 500) {
          resolve();
          return;
        }
        schedule();
      });
      req.setTimeout(2000, () => {
        if (requestDone) return;
        requestDone = true;
        req.destroy();
        schedule();
      });
      req.on("error", () => {
        if (requestDone) return;
        requestDone = true;
        schedule();
      });
    };

    const schedule = () => {
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(`Timed out waiting for development server: ${url}`));
        return;
      }
      setTimeout(poll, 500);
    };

    poll();
  });
}

async function ensureNodeAvailable() {
  const env = withDesktopPath();
  try {
    await runCommand(getNodeCommand(), ["--version"], {
      env,
      timeout: 15_000,
      shell: false,
    });
  } catch (error) {
    throw new Error(`Node.js is required to run ${PRODUCT_NAME}. Install Node.js, then retry.\n\n${error.message}`);
  }
}

async function ensureNpmAvailable() {
  const env = withDesktopPath();
  try {
    await runCommand(getNpmCommand(), ["--version"], {
      env,
      timeout: 15_000,
      shell: process.platform === "win32",
    });
  } catch (error) {
    throw new Error(`npm is required to install Pi Core. Install npm, then retry.\n\n${error.message}`);
  }
}

async function ensureToolingAvailable() {
  await ensureNodeAvailable();
  await ensureNpmAvailable();
}

async function installCoreRuntime(reason) {
  const runtimeDir = getRuntimeDir();
  const specs = getCoreSpecs();
  ensureRuntimePackageJson(runtimeDir, specs);
  await ensureToolingAvailable();

  const args = [
    "install",
    "--no-audit",
    "--no-fund",
    ...specs.map((spec) => `${spec.name}@${spec.range}`),
  ];
  let detail = "";
  await showStatus(PRODUCT_NAME, reason, `npm ${args.join(" ")}`);
  await runCommand(getNpmCommand(), args, {
    cwd: runtimeDir,
    env: withDesktopPath({ ...process.env, FORCE_COLOR: "0" }),
    timeout: NPM_TIMEOUT_MS,
    shell: process.platform === "win32",
    onStdout: async (text) => {
      detail += text;
      await showStatus(PRODUCT_NAME, reason, detail);
    },
    onStderr: async (text) => {
      detail += text;
      await showStatus(PRODUCT_NAME, reason, detail);
    },
  });

  const versions = readInstalledCoreVersions(runtimeDir);
  const missing = missingCorePackages(versions);
  if (missing.length > 0) {
    throw new Error(`Pi Core install finished, but these packages are still missing: ${missing.join(", ")}`);
  }

  return {
    runtimeDir,
    nodeModules: getRuntimeNodeModules(runtimeDir),
    specs,
    versions,
  };
}

async function prepareCoreRuntime() {
  const runtimeDir = getRuntimeDir();
  const specs = getCoreSpecs();
  ensureRuntimePackageJson(runtimeDir, specs);
  const versions = readInstalledCoreVersions(runtimeDir);
  const missing = missingCorePackages(versions);
  if (missing.length === 0) {
    return {
      runtimeDir,
      nodeModules: getRuntimeNodeModules(runtimeDir),
      specs,
      versions,
    };
  }
  return installCoreRuntime(`Installing Pi Core packages: ${missing.join(", ")}`);
}

async function prepareCoreRuntimeWithRetry() {
  while (true) {
    try {
      return await prepareCoreRuntime();
    } catch (error) {
      const result = await dialog.showMessageBox({
        type: "error",
        title: "Pi Core setup failed",
        message: "Pi Core could not be installed.",
        detail: error.message,
        buttons: ["Retry", "Quit"],
        defaultId: 0,
        cancelId: 1,
      });
      if (result.response === 0) continue;
      app.quit();
      throw error;
    }
  }
}

function compareSemver(a, b) {
  const pa = String(a).split(/[.-]/).map((part) => Number(part.replace(/\D/g, "")) || 0);
  const pb = String(b).split(/[.-]/).map((part) => Number(part.replace(/\D/g, "")) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

function newestVersionFromNpmJson(raw) {
  const parsed = JSON.parse(raw.trim());
  if (typeof parsed === "string") return parsed;
  if (Array.isArray(parsed)) {
    return parsed.sort(compareSemver).at(-1) ?? null;
  }
  if (parsed && typeof parsed === "object") {
    return Object.values(parsed).flat().filter(Boolean).sort(compareSemver).at(-1) ?? null;
  }
  return null;
}

async function checkRemoteCoreVersions() {
  const specs = getCoreSpecs();
  const remote = {};
  for (const spec of specs) {
    const { stdout } = await runCommand(getNpmCommand(), ["view", `${spec.name}@${spec.range}`, "version", "--json"], {
      env: withDesktopPath({ ...process.env, FORCE_COLOR: "0" }),
      timeout: 45_000,
      shell: process.platform === "win32",
    });
    remote[spec.name] = newestVersionFromNpmJson(stdout);
  }
  return remote;
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (port) resolve(port);
        else reject(new Error("Could not allocate a local port"));
      });
    });
  });
}

function resolveNextBin(appRoot) {
  try {
    return require.resolve("next/dist/bin/next", { paths: [appRoot] });
  } catch {
    return path.join(appRoot, "node_modules", "next", "dist", "bin", "next");
  }
}

function resolveStandaloneServer(appRoot) {
  return path.join(appRoot, ".next", "standalone", "server.js");
}

function getStandaloneBuildId(standaloneDir) {
  try {
    return fs.readFileSync(path.join(standaloneDir, ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    return null;
  }
}

function getRuntimeStandaloneDir(runtimeDir) {
  return path.join(runtimeDir, "standalone");
}

function syncRuntimeStandalone(appRoot, runtimeDir) {
  const packagedStandalone = path.join(appRoot, ".next", "standalone");
  const runtimeStandalone = getRuntimeStandaloneDir(runtimeDir);
  const packagedBuildId = getStandaloneBuildId(packagedStandalone);
  const runtimeBuildId = getStandaloneBuildId(runtimeStandalone);
  const runtimeServer = path.join(runtimeStandalone, "server.js");

  if (packagedBuildId && packagedBuildId === runtimeBuildId && fs.existsSync(runtimeServer)) {
    return runtimeServer;
  }

  log("Syncing Next.js standalone server to runtime", `source=${packagedStandalone}\ntarget=${runtimeStandalone}`);
  fs.rmSync(runtimeStandalone, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(runtimeStandalone), { recursive: true });
  fs.cpSync(packagedStandalone, runtimeStandalone, { recursive: true });
  return runtimeServer;
}

function buildNodePath(runtimeNodeModules) {
  return [
    runtimeNodeModules,
    path.join(getAppRoot(), ".next", "standalone", "node_modules"),
    path.join(runtimeInfo?.runtimeDir ?? "", "standalone", "node_modules"),
    path.join(getAppRoot(), "node_modules"),
    process.env.NODE_PATH,
  ].filter(Boolean).join(path.delimiter);
}

async function startNextServer() {
  if (nextProcess) return serverUrl;
  if (serverUrl) return serverUrl;

  const externalServerUrl = getExternalServerUrl();
  if (externalServerUrl) {
    log(`Using external development server: ${externalServerUrl}`);
    await showStatus(PRODUCT_NAME, "Connecting to local development server...", externalServerUrl);
    await waitForHttp(externalServerUrl);
    serverUrl = externalServerUrl;
    return serverUrl;
  }

  await ensureNodeAvailable();

  const appRoot = getAppRoot();
  const devMode = process.argv.includes("--dev-next") || process.env.PI_WEB_ELECTRON_DEV === "1";
  const nextDir = path.join(appRoot, ".next");
  if (!devMode && !fs.existsSync(nextDir)) {
    throw new Error("Next.js build artifacts were not found. Run npm run build before packaging.");
  }

  const port = await findFreePort();
  const packagedStandaloneServer = resolveStandaloneServer(appRoot);
  if (!devMode && !fs.existsSync(packagedStandaloneServer)) {
    throw new Error("Next.js standalone server was not found. Run npm run build before packaging.");
  }

  const standaloneServer = devMode
    ? packagedStandaloneServer
    : syncRuntimeStandalone(appRoot, runtimeInfo.runtimeDir);
  const command = getNodeCommand();
  const mode = devMode ? "dev" : "standalone";
  const args = devMode
    ? [resolveNextBin(appRoot), "dev", "-p", String(port), "-H", "127.0.0.1"]
    : [standaloneServer];
  const env = withDesktopPath({
    ...process.env,
    HOSTNAME: "127.0.0.1",
    NODE_PATH: buildNodePath(runtimeInfo.nodeModules),
    PI_WEB_CORE_RUNTIME_DIR: runtimeInfo.runtimeDir,
    NEXT_TELEMETRY_DISABLED: "1",
    PORT: String(port),
  });

  log(`Starting Next.js ${mode} server`, `node=${command}\nargs=${args.join(" ")}\nport=${port}\nruntime=${runtimeInfo.runtimeDir}`);
  await showStatus(PRODUCT_NAME, `Starting local ${devMode ? "development" : "production"} server...`);

  return new Promise((resolve, reject) => {
    let ready = false;
    let output = "";
    const timer = setTimeout(() => {
      reject(new Error(`Next.js did not become ready within ${SERVER_READY_TIMEOUT_MS}ms.\n\n${output.slice(-2000)}`));
    }, SERVER_READY_TIMEOUT_MS);

    nextProcess = spawn(command, args, {
      cwd: appRoot,
      env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const onText = (chunk) => {
      const text = chunk.toString();
      output += text;
      log("Next.js output", text.trim());
      showStatus(PRODUCT_NAME, "Starting local server...", output).catch((error) => {
        log("Failed to update status window", error.stack || error.message);
      });
      if (!ready && /ready|started server|local:/i.test(output)) {
        ready = true;
        clearTimeout(timer);
        serverUrl = `http://127.0.0.1:${port}`;
        resolve(serverUrl);
      }
    };

    nextProcess.stdout.on("data", onText);
    nextProcess.stderr.on("data", onText);
    nextProcess.on("error", (error) => {
      clearTimeout(timer);
      nextProcess = null;
      reject(error);
    });
    nextProcess.on("exit", (code) => {
      if (!ready) {
        clearTimeout(timer);
        reject(new Error(`Next.js exited before it was ready with code ${code}.\n\n${output.slice(-2000)}`));
      }
      nextProcess = null;
      serverUrl = null;
    });
  });
}

function stopNextServer() {
  return new Promise((resolve) => {
    if (!nextProcess) {
      resolve();
      return;
    }
    const child = nextProcess;
    nextProcess = null;
    serverUrl = null;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill();
  });
}

function fetchJson(url, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out: ${url}`));
    });
    req.on("error", reject);
  });
}

async function hasBusyAgentSessions() {
  if (!serverUrl) return false;
  try {
    const state = await fetchJson(`${serverUrl}/api/desktop/runtime`);
    return Boolean(state.busy);
  } catch {
    return false;
  }
}

async function restartNextServer() {
  await stopNextServer();
  const url = await startNextServer();
  if (mainWindow && !mainWindow.isDestroyed()) {
    await mainWindow.loadURL(url);
  }
}

async function handleCoreUpdate({ silent = false } = {}) {
  let remote;
  try {
    remote = await checkRemoteCoreVersions();
  } catch (error) {
    if (!silent) {
      await dialog.showMessageBox({
        type: "warning",
        title: "Pi Core update check failed",
        message: "Could not check npm for Pi Core updates.",
        detail: error.message,
      });
    }
    return;
  }

  const installed = readInstalledCoreVersions(runtimeInfo.runtimeDir);
  const updates = CORE_PACKAGES
    .map((name) => ({ name, installed: installed[name], remote: remote[name] }))
    .filter((item) => item.remote && item.installed !== item.remote);

  if (updates.length === 0) {
    if (!silent) {
      await dialog.showMessageBox({
        type: "info",
        title: "Pi Core is up to date",
        message: "Pi Core is already on the latest compatible version.",
        detail: CORE_PACKAGES.map((name) => `${name}: ${installed[name] ?? "not installed"}`).join("\n"),
      });
    }
    return;
  }

  if (silent) return;

  if (await hasBusyAgentSessions()) {
    await dialog.showMessageBox({
      type: "warning",
      title: "Pi Core update postponed",
      message: "An agent session is currently running or compacting.",
      detail: "Stop the current run before updating Pi Core.",
    });
    return;
  }

  const result = await dialog.showMessageBox({
    type: "question",
    title: "Update Pi Core?",
    message: "A compatible Pi Core update is available.",
    detail: updates.map((item) => `${item.name}: ${item.installed ?? "missing"} -> ${item.remote}`).join("\n"),
    buttons: ["Update", "Cancel"],
    defaultId: 0,
    cancelId: 1,
  });
  if (result.response !== 0) return;

  await installCoreRuntime("Updating Pi Core packages...");
  runtimeInfo = {
    runtimeDir: getRuntimeDir(),
    nodeModules: getRuntimeNodeModules(getRuntimeDir()),
    specs: getCoreSpecs(),
    versions: readInstalledCoreVersions(getRuntimeDir()),
  };
  await restartNextServer();
  closeStatus();
}

function createMainWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: PRODUCT_NAME,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    shell.openExternal(targetUrl);
    return { action: "deny" };
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.loadURL(url);
}

function createMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{
      label: PRODUCT_NAME,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "quit" },
      ],
    }] : []),
    {
      label: "Pi Core",
      submenu: [
        {
          label: "Check for Updates",
          click: () => handleCoreUpdate({ silent: false }),
        },
        {
          label: "Restart Local Service",
          click: () => restartNextServer().catch((error) => {
            dialog.showErrorBox("Restart failed", error.message);
          }),
        },
        {
          label: "Open Runtime Folder",
          click: () => shell.openPath(getRuntimeDir()),
        },
        {
          label: "Open Log File",
          click: () => {
            log("Opening desktop log");
            shell.openPath(getLogPath());
          },
        },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function boot() {
  isBooting = true;
  try {
    log(`${PRODUCT_NAME} booting`, `userData=${app.getPath("userData")}\nnode=${getNodeCommand()}\nnpm=${getNpmCommand()}\nPATH=${withDesktopPath().PATH}`);
    runtimeInfo = await prepareCoreRuntimeWithRetry();
    log("Pi Core runtime ready", JSON.stringify(runtimeInfo.versions, null, 2));
    const url = await startNextServer();
    closeStatus();
    createMenu();
    createMainWindow(url);
    setTimeout(() => handleCoreUpdate({ silent: true }), 3000);
    setInterval(() => handleCoreUpdate({ silent: true }), CORE_CHECK_INTERVAL_MS);
  } finally {
    isBooting = false;
  }
}

app.whenReady().then(() => {
  boot().catch((error) => {
    log(`${PRODUCT_NAME} failed to start`, error.stack || error.message);
    dialog.showErrorBox(`${PRODUCT_NAME} failed to start`, error.message);
    app.quit();
  });
});

app.on("activate", () => {
  if (!mainWindow && serverUrl) {
    createMainWindow(serverUrl);
  }
});

app.on("before-quit", (event) => {
  if (!nextProcess || isStoppingForQuit) return;
  event.preventDefault();
  isStoppingForQuit = true;
  stopNextServer().finally(() => app.quit());
});

app.on("window-all-closed", () => {
  if (isBooting) return;
  if (process.platform !== "darwin") {
    app.quit();
  }
});
