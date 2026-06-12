/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { app, BrowserWindow, Menu, dialog, shell, ipcMain, nativeTheme } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

const PRODUCT_NAME = "Pi App";
const GITHUB_URL = "https://github.com/Frspble/pi-app";
const GITHUB_ISSUES_URL = `${GITHUB_URL}/issues`;
const USER_DATA_DIR_NAME = "PiApp";
const CORE_PACKAGES = [
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-ai",
];
const CORE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const NPM_TIMEOUT_MS = 10 * 60 * 1000;
const SERVER_READY_TIMEOUT_MS = 90 * 1000;
const TITLE_BAR_HEIGHT = 36;

app.setName(PRODUCT_NAME);
const userDataDir = path.join(app.getPath("appData"), USER_DATA_DIR_NAME);
fs.mkdirSync(userDataDir, { recursive: true });
app.setPath("userData", userDataDir);
if (process.platform === "win32") {
  app.setAppUserModelId("works.earendil.pi-app");
}

let mainWindow = null;
let nextProcess = null;
let nextStartupPromise = null;
let serverUrl = null;
let runtimeInfo = null;
let isLoadingLocalShell = false;
let isBooting = false;
let isStoppingForQuit = false;
let localShellLoadId = 0;
const gotSingleInstanceLock = app.requestSingleInstanceLock();
let coreSetupPromise = null;
let coreStandaloneSyncPromise = null;
let coreUpdateInterval = null;
let coreSetupState = {
  phase: "starting",
  message: "Starting Pi App...",
  detail: "",
  runtimeDir: null,
  packages: [],
};

const WINDOW_THEME_COLORS = {
  light: {
    background: "#ffffff",
    titleBar: "#ffffff",
    symbol: "#182033",
  },
  dark: {
    background: "#151923",
    titleBar: "#151923",
    symbol: "#e6eaf2",
  },
};

const DESKTOP_TRANSLATIONS = {
  en: {
    "startup.starting": "Starting Pi App...",
    "startup.startingService": "Starting the local app service...",
    "startup.serviceFailedTitle": "Pi App could not start",
    "startup.serviceFailedMessage": "The local app service failed to start.",
    "startup.bootFailedMessage": "Startup failed before the app service could be prepared.",
    "startup.preparingRuntime": "Preparing local runtime...",
    "startup.preparingCore": "Preparing Pi Core runtime...",
    "startup.syncingCore": "Preparing Pi Core runtime files...",
    "startup.checkingTooling": "Checking local Node.js and npm...",
    "startup.coreReady": "Pi Core runtime ready",
    "startup.installingCore": "Installing Pi Core packages: {packages}",
    "startup.coreInstallFailed": "Pi Core could not be installed.",
    "startup.updatingCore": "Updating Pi Core packages...",
    "startup.details": "Details",
    "common.openLog": "Open Log",
    "common.quit": "Quit",
    "common.retry": "Retry",
    "common.update": "Update",
    "common.cancel": "Cancel",
    "common.missing": "missing",
    "dialog.nodeRequired": "Node.js is required to run Pi App. Install Node.js, then retry.",
    "dialog.npmRequired": "npm is required to install Pi Core. Install npm, then retry.",
    "dialog.updateCheckFailedTitle": "Pi Core update check failed",
    "dialog.updateCheckFailedMessage": "Could not check npm for Pi Core updates.",
    "dialog.upToDateTitle": "Pi Core is up to date",
    "dialog.upToDateMessage": "Pi Core is already on the latest compatible version.",
    "dialog.updatePostponedTitle": "Pi Core update postponed",
    "dialog.updatePostponedMessage": "An agent session is currently running or compacting.",
    "dialog.updatePostponedDetail": "Stop the current run before updating Pi Core.",
    "dialog.updateQuestionTitle": "Update Pi Core?",
    "dialog.updateQuestionMessage": "A compatible Pi Core update is available.",
    "dialog.busyError": "An agent session is currently running or compacting. Stop the current run before updating Pi Core.",
    "dialog.chooseProjectFolder": "Choose project folder",
    "dialog.restartFailed": "Restart failed",
    "menu.settings": "Settings...",
    "menu.file": "File",
    "menu.edit": "Edit",
    "menu.view": "View",
    "menu.piCore": "Pi Core",
    "menu.checkUpdates": "Check for Updates...",
    "menu.restartService": "Restart Local Service",
    "menu.openRuntime": "Open Runtime Folder",
    "menu.openLog": "Open Log File",
    "menu.window": "Window",
    "menu.helpGithub": "Open GitHub Repository",
    "menu.helpIssue": "Report an Issue",
  },
  zh: {
    "startup.starting": "正在启动 Pi App...",
    "startup.startingService": "正在启动本地 App 服务...",
    "startup.serviceFailedTitle": "Pi App 无法启动",
    "startup.serviceFailedMessage": "本地 App 服务启动失败。",
    "startup.bootFailedMessage": "App 服务准备前启动失败。",
    "startup.preparingRuntime": "正在准备本地运行时...",
    "startup.preparingCore": "正在准备 Pi Core 运行时...",
    "startup.syncingCore": "正在准备 Pi Core 运行文件...",
    "startup.checkingTooling": "正在检查本地 Node.js 和 npm...",
    "startup.coreReady": "Pi Core 运行时已就绪",
    "startup.installingCore": "正在安装 Pi Core 包：{packages}",
    "startup.coreInstallFailed": "Pi Core 无法安装。",
    "startup.updatingCore": "正在更新 Pi Core 包...",
    "startup.details": "详情",
    "common.openLog": "打开日志",
    "common.quit": "退出",
    "common.retry": "重试",
    "common.update": "更新",
    "common.cancel": "取消",
    "common.missing": "未安装",
    "dialog.nodeRequired": "Pi App 需要 Node.js 才能运行。请安装 Node.js 后重试。",
    "dialog.npmRequired": "安装 Pi Core 需要 npm。请安装 npm 后重试。",
    "dialog.updateCheckFailedTitle": "Pi Core 更新检查失败",
    "dialog.updateCheckFailedMessage": "无法从 npm 检查 Pi Core 更新。",
    "dialog.upToDateTitle": "Pi Core 已是最新",
    "dialog.upToDateMessage": "Pi Core 已经是最新兼容版本。",
    "dialog.updatePostponedTitle": "Pi Core 更新已暂停",
    "dialog.updatePostponedMessage": "当前有 Agent 会话正在运行或压缩。",
    "dialog.updatePostponedDetail": "请停止当前运行后再更新 Pi Core。",
    "dialog.updateQuestionTitle": "更新 Pi Core？",
    "dialog.updateQuestionMessage": "发现兼容的 Pi Core 更新。",
    "dialog.busyError": "当前有 Agent 会话正在运行或压缩。请停止当前运行后再更新 Pi Core。",
    "dialog.chooseProjectFolder": "选择项目文件夹",
    "dialog.restartFailed": "重启失败",
    "menu.settings": "设置...",
    "menu.file": "文件",
    "menu.edit": "编辑",
    "menu.view": "视图",
    "menu.piCore": "Pi Core",
    "menu.checkUpdates": "检查更新...",
    "menu.restartService": "重启本地服务",
    "menu.openRuntime": "打开运行时文件夹",
    "menu.openLog": "打开日志文件",
    "menu.window": "窗口",
    "menu.helpGithub": "打开 GitHub 仓库",
    "menu.helpIssue": "报告问题",
  },
};

if (!gotSingleInstanceLock) {
  app.quit();
}

function isLanguageMode(value) {
  return value === "system" || value === "en" || value === "zh";
}

function isResolvedLanguage(value) {
  return value === "en" || value === "zh";
}

function resolveSystemLanguage() {
  try {
    return app.getLocale().toLowerCase().startsWith("zh") ? "zh" : "en";
  } catch {
    return "en";
  }
}

function getPreferencesPath() {
  return path.join(app.getPath("userData"), "desktop-preferences.json");
}

function readDesktopPreferences() {
  try {
    const parsed = readJson(getPreferencesPath());
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeDesktopPreferences(nextPrefs) {
  const prefsPath = getPreferencesPath();
  const prefs = {
    ...readDesktopPreferences(),
    ...nextPrefs,
  };
  fs.mkdirSync(path.dirname(prefsPath), { recursive: true });
  fs.writeFileSync(prefsPath, `${JSON.stringify(prefs, null, 2)}\n`);
}

function getLanguageMode() {
  const mode = readDesktopPreferences().languageMode;
  return isLanguageMode(mode) ? mode : "system";
}

function getResolvedLanguage() {
  const mode = getLanguageMode();
  if (mode !== "system") return mode;
  return resolveSystemLanguage();
}

function desktopT(key, params = {}) {
  const language = getResolvedLanguage();
  const dictionary = DESKTOP_TRANSLATIONS[language] ?? DESKTOP_TRANSLATIONS.en;
  const template = dictionary[key] ?? DESKTOP_TRANSLATIONS.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) => (
    params[name] == null ? match : String(params[name])
  ));
}

function getCorePackagesSafe() {
  try {
    return getCoreStatus().packages;
  } catch {
    return [];
  }
}

function emitCoreSetupState(nextState = {}) {
  coreSetupState = {
    ...coreSetupState,
    ...nextState,
    runtimeDir: nextState.runtimeDir ?? runtimeInfo?.runtimeDir ?? coreSetupState.runtimeDir,
    packages: nextState.packages ?? getCorePackagesSafe(),
  };

  for (const window of BrowserWindow.getAllWindows()) {
    sendCoreSetupStateToWindow(window);
  }

  return coreSetupState;
}

function sendCoreSetupStateToWindow(window) {
  if (!window || window.isDestroyed()) return;
  window.webContents.send("piDesktop:coreSetupState", coreSetupState);
}

function resolveDesktopTheme(mode, fallback) {
  if (mode === "dark" || mode === "light") return mode;
  if (fallback === "dark" || fallback === "light") return fallback;
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

function applyWindowTheme(mode, fallback) {
  const resolvedTheme = resolveDesktopTheme(mode, fallback);
  const colors = WINDOW_THEME_COLORS[resolvedTheme];
  nativeTheme.themeSource = mode === "system" ? "system" : resolvedTheme;

  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.setBackgroundColor(colors.background);
    if (typeof window.setTitleBarOverlay === "function") {
      try {
        window.setTitleBarOverlay({
          color: colors.titleBar,
          symbolColor: colors.symbol,
          height: TITLE_BAR_HEIGHT,
        });
      } catch {
        // Title bar overlay is unavailable unless the platform/window style supports it.
      }
    }
  }
}

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

function getAppIconPath() {
  return path.join(getAppRoot(), "public", "app-icon.png");
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

function getNpmInvocation() {
  const npmCommand = getNpmCommand();
  if (process.platform === "win32" && /\.cmd$/i.test(npmCommand)) {
    const npmCli = path.join(path.dirname(npmCommand), "node_modules", "npm", "bin", "npm-cli.js");
    if (fs.existsSync(npmCli)) {
      return {
        command: getNodeCommand(),
        args: [npmCli],
        shell: false,
      };
    }
  }

  return {
    command: npmCommand,
    args: [],
    shell: process.platform === "win32",
  };
}

function runNpmCommand(args, options = {}) {
  const npm = getNpmInvocation();
  return runCommand(npm.command, [...npm.args, ...args], {
    ...options,
    shell: npm.shell,
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
    const packageDir = getCorePackagePath(getRuntimeNodeModules(runtimeDir), name);
    const pkgPath = path.join(packageDir, "package.json");
    try {
      const pkg = readJson(pkgPath);
      versions[name] = hasValidPackageEntry(packageDir, pkg) ? (pkg.version ?? null) : null;
    } catch {
      versions[name] = null;
    }
  }
  return versions;
}

function getCoreStatus(remote = null) {
  const runtimeDir = getRuntimeDir();
  const specs = getCoreSpecs();
  const installed = readInstalledCoreVersions(runtimeDir);
  const packages = specs.map((spec) => {
    const latest = remote?.[spec.name] ?? null;
    const installedVersion = installed[spec.name] ?? null;
    return {
      name: spec.name,
      range: spec.range,
      installed: installedVersion,
      latest,
      status: !installedVersion
        ? "missing"
        : latest && latest !== installedVersion
          ? "update-available"
          : latest
            ? "up-to-date"
            : "unknown",
    };
  });

  return {
    productName: PRODUCT_NAME,
    runtimeDir,
    logPath: getLogPath(),
    nodeModules: getRuntimeNodeModules(runtimeDir),
    packages,
  };
}

function missingCorePackages(versions) {
  return CORE_PACKAGES.filter((name) => !versions[name]);
}

function getPackageEntryCandidates(pkg) {
  const candidates = [];
  const rootExport = pkg.exports?.["."];
  if (typeof rootExport === "string") candidates.push(rootExport);
  else if (rootExport && typeof rootExport === "object") {
    if (typeof rootExport.import === "string") candidates.push(rootExport.import);
    if (typeof rootExport.default === "string") candidates.push(rootExport.default);
    if (typeof rootExport.require === "string") candidates.push(rootExport.require);
  }
  if (typeof pkg.module === "string") candidates.push(pkg.module);
  if (typeof pkg.main === "string") candidates.push(pkg.main);
  candidates.push("index.js");
  return candidates;
}

function hasValidPackageEntry(packageDir, pkg = readJson(path.join(packageDir, "package.json"))) {
  return getPackageEntryCandidates(pkg)
    .some((entry) => fs.existsSync(path.join(packageDir, entry)));
}

function pruneInvalidCorePackages(runtimeDir) {
  const runtimeNodeModules = getRuntimeNodeModules(runtimeDir);
  for (const packageName of CORE_PACKAGES) {
    const packageDir = getCorePackagePath(runtimeNodeModules, packageName);
    try {
      if (!fs.existsSync(packageDir)) continue;
      const pkg = readJson(path.join(packageDir, "package.json"));
      if (hasValidPackageEntry(packageDir, pkg)) continue;
    } catch {
      // Missing or invalid package metadata means npm must reinstall it.
    }
    log("Removing invalid Pi Core package", packageDir);
    fs.rmSync(packageDir, { recursive: true, force: true });
  }
}

function getInitialRuntimeInfo() {
  const runtimeDir = getRuntimeDir();
  const specs = getCoreSpecs();
  ensureRuntimePackageJson(runtimeDir, specs);
  return {
    runtimeDir,
    nodeModules: getRuntimeNodeModules(runtimeDir),
    specs,
    versions: readInstalledCoreVersions(runtimeDir),
  };
}

function summarizeStatusDetail(detail) {
  const lines = String(detail || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.at(-1) || "";
}

function createLocalShellHtml(title, message, detail = "", options = {}) {
  const summary = summarizeStatusDetail(detail);
  const fullDetail = String(detail || "").slice(-4000);
  const isError = options.variant === "error";
  const retryScript = isError
    ? `
      <script>
        const invoke = (channel) => {
          if (window.piDesktop) {
            window.piDesktop[channel]?.();
            return;
          }
          if (window.electronAPI) {
            window.electronAPI[channel]?.();
          }
        };
      </script>`
    : "";
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
        background:
          radial-gradient(circle at 20% 15%, rgba(62, 115, 255, 0.16), transparent 28%),
          linear-gradient(145deg, #f7f8fb 0%, #eceff5 100%);
        color: #182033;
        font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: 420px;
        box-sizing: border-box;
        padding: 28px;
        border: 1px solid rgba(25, 35, 58, 0.1);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.86);
        box-shadow: 0 24px 70px rgba(27, 38, 67, 0.16);
        line-height: 1.5;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 22px;
        letter-spacing: 0;
      }
      p {
        margin: 0;
        color: #5c6575;
      }
      .brand {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 18px;
        color: #3457d5;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
      }
      .mark {
        width: 12px;
        height: 12px;
        border-radius: 4px;
        background: ${isError ? "#dc2626" : "#3457d5"};
        box-shadow: 0 0 0 5px rgba(52, 87, 213, 0.12);
      }
      .bar {
        position: relative;
        height: 6px;
        margin: 22px 0 12px;
        overflow: hidden;
        border-radius: 999px;
        background: #dce2ee;
      }
      .bar::after {
        content: "";
        position: absolute;
        inset: 0 auto 0 0;
        width: 42%;
        border-radius: inherit;
        background: ${isError ? "#dc2626" : "linear-gradient(90deg, #3457d5, #26a69a)"};
        animation: ${isError ? "none" : "slide 1.25s ease-in-out infinite"};
      }
      .summary {
        min-height: 18px;
        color: #7a8393;
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      details {
        margin-top: 14px;
        color: #7a8393;
        font-size: 12px;
      }
      summary {
        cursor: pointer;
        user-select: none;
      }
      pre {
        max-height: 96px;
        overflow: auto;
        margin: 8px 0 0;
        padding: 10px;
        border: 1px solid #d7deea;
        border-radius: 8px;
        background: #f8fafc;
        color: #5c6575;
        font-size: 11px;
        white-space: pre-wrap;
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 18px;
      }
      button {
        height: 30px;
        padding: 0 12px;
        border: 1px solid #d7deea;
        border-radius: 6px;
        background: #fff;
        color: #182033;
        font: inherit;
        font-size: 12px;
        cursor: pointer;
      }
      button.primary {
        border-color: #3457d5;
        background: #3457d5;
        color: #fff;
        font-weight: 700;
      }
      @keyframes slide {
        0% { transform: translateX(-110%); }
        55% { transform: translateX(80%); }
        100% { transform: translateX(260%); }
      }
      @media (prefers-color-scheme: dark) {
        body {
          background:
            radial-gradient(circle at 20% 15%, rgba(78, 112, 255, 0.18), transparent 28%),
            linear-gradient(145deg, #111827 0%, #0b1020 100%);
          color: #eef2ff;
        }
        main {
          border-color: rgba(255, 255, 255, 0.1);
          background: rgba(17, 24, 39, 0.88);
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.36);
        }
        p { color: #aeb7ca; }
        .bar { background: #273144; }
        .summary, details { color: #8e99ad; }
        button {
          border-color: #2b3548;
          background: #111827;
          color: #eef2ff;
        }
        button.primary {
          border-color: #4967ff;
          background: #4967ff;
        }
        pre {
          border-color: #2b3548;
          background: #0b1020;
          color: #aeb7ca;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="brand"><span class="mark"></span>${escapeHtml(PRODUCT_NAME)}</div>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      <div class="bar" aria-hidden="true"></div>
      <div class="summary">${summary ? escapeHtml(summary) : escapeHtml(desktopT("startup.preparingRuntime"))}</div>
      ${fullDetail ? `<details><summary>${escapeHtml(desktopT("startup.details"))}</summary><pre>${escapeHtml(fullDetail)}</pre></details>` : ""}
      ${isError ? `
        <div class="actions">
          <button onclick="invoke('openLogFile')">${escapeHtml(desktopT("common.openLog"))}</button>
          <button onclick="invoke('quit')">${escapeHtml(desktopT("common.quit"))}</button>
          <button class="primary" onclick="invoke('retryStartup')">${escapeHtml(desktopT("common.retry"))}</button>
        </div>
      ` : ""}
    </main>
    ${retryScript}
  </body>
</html>`;
}

async function loadLocalShell(title, message, detail = "", options = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const loadId = ++localShellLoadId;
  isLoadingLocalShell = true;
  const html = createLocalShellHtml(title, message, detail, options);
  try {
    await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  } catch (error) {
    const messageText = String(error?.message || error);
    if (!messageText.includes("ERR_ABORTED") && !messageText.includes("ERR_FAILED")) {
      throw error;
    }
  }
  if (loadId === localShellLoadId && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
    mainWindow.show();
  }
}

function focusWindow(window) {
  if (!window || window.isDestroyed()) return false;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  return true;
}

function focusExistingInstance() {
  if (focusWindow(mainWindow)) return;
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
    throw new Error(`${desktopT("dialog.nodeRequired")}\n\n${error.message}`);
  }
}

async function ensureNpmAvailable() {
  const env = withDesktopPath();
  try {
    await runNpmCommand(["--version"], {
      env,
      timeout: 15_000,
    });
  } catch (error) {
    throw new Error(`${desktopT("dialog.npmRequired")}\n\n${error.message}`);
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
  pruneInvalidCorePackages(runtimeDir);
  emitCoreSetupState({
    phase: "installing",
    message: reason,
    detail: desktopT("startup.checkingTooling"),
    runtimeDir,
  });
  await ensureToolingAvailable();

  const args = [
    "install",
    "--no-audit",
    "--no-fund",
    ...specs.map((spec) => `${spec.name}@${spec.range}`),
  ];
  let detail = "";
  emitCoreSetupState({
    phase: "installing",
    message: reason,
    detail: `npm ${args.join(" ")}`,
    runtimeDir,
  });
  await runNpmCommand(args, {
    cwd: runtimeDir,
    env: withDesktopPath({ ...process.env, FORCE_COLOR: "0" }),
    timeout: NPM_TIMEOUT_MS,
    onStdout: async (text) => {
      detail += text;
      emitCoreSetupState({ phase: "installing", message: reason, detail, runtimeDir });
    },
    onStderr: async (text) => {
      detail += text;
      emitCoreSetupState({ phase: "installing", message: reason, detail, runtimeDir });
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
  pruneInvalidCorePackages(runtimeDir);
  const versions = readInstalledCoreVersions(runtimeDir);
  const missing = missingCorePackages(versions);
  if (missing.length === 0) {
    emitCoreSetupState({
      phase: "ready",
      message: desktopT("startup.coreReady"),
      detail: "",
      runtimeDir,
    });
    return {
      runtimeDir,
      nodeModules: getRuntimeNodeModules(runtimeDir),
      specs,
      versions,
    };
  }
  return installCoreRuntime(desktopT("startup.installingCore", { packages: missing.join(", ") }));
}

async function prepareCoreRuntimeWithRetry() {
  while (true) {
    try {
      return await prepareCoreRuntime();
    } catch (error) {
      emitCoreSetupState({
        phase: "error",
        message: desktopT("startup.coreInstallFailed"),
        detail: error.stack || error.message || String(error),
        runtimeDir: getRuntimeDir(),
      });
      throw error;
    }
  }
}

function startCoreSetup() {
  if (coreSetupPromise) return coreSetupPromise;

  coreSetupPromise = (async () => {
    emitCoreSetupState({
      phase: "starting",
      message: desktopT("startup.preparingCore"),
      detail: "",
      runtimeDir: runtimeInfo?.runtimeDir ?? getRuntimeDir(),
    });
    runtimeInfo = await prepareCoreRuntimeWithRetry();
    log("Pi Core runtime ready", JSON.stringify(runtimeInfo.versions, null, 2));
    if (serverUrl) {
      const syncResult = await ensureCorePackagesInStandalone(runtimeInfo);
      if (syncResult.changed) await restartNextServer();
    }
    emitCoreSetupState({
      phase: "ready",
      message: desktopT("startup.coreReady"),
      detail: "",
      runtimeDir: runtimeInfo.runtimeDir,
    });
    setTimeout(() => handleCoreUpdate({ silent: true }), 3000);
    if (!coreUpdateInterval) {
      coreUpdateInterval = setInterval(() => handleCoreUpdate({ silent: true }), CORE_CHECK_INTERVAL_MS);
    }
    return runtimeInfo;
  })().catch((error) => {
    coreSetupPromise = null;
    emitCoreSetupState({
      phase: "error",
      message: desktopT("startup.coreInstallFailed"),
      detail: error.stack || error.message || String(error),
      runtimeDir: runtimeInfo?.runtimeDir ?? getRuntimeDir(),
    });
    throw error;
  });

  return coreSetupPromise;
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
    const { stdout } = await runNpmCommand(["view", `${spec.name}@${spec.range}`, "version", "--json"], {
      env: withDesktopPath({ ...process.env, FORCE_COLOR: "0" }),
      timeout: 45_000,
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

function getCorePackagePath(nodeModulesDir, packageName) {
  return path.join(nodeModulesDir, ...packageName.split("/"));
}

async function removePathWithoutFollowingJunctionAsync(target) {
  try {
    const stat = await fs.promises.lstat(target);
    if (stat.isSymbolicLink()) {
      await fs.promises.unlink(target);
      return;
    }
  } catch (error) {
    if (error?.code === "ENOENT") return;
  }

  await fs.promises.rm(target, { recursive: true, force: true });
}

function removePathWithoutFollowingJunction(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) {
    fs.unlinkSync(target);
    return;
  }
  fs.rmSync(target, { recursive: true, force: true });
}

function needsCorePackageSync(source, target) {
  let sourcePkg = null;
  let targetPkg = null;
  try {
    sourcePkg = readJson(path.join(source, "package.json"));
    targetPkg = readJson(path.join(target, "package.json"));
  } catch {
    return true;
  }

  if (!hasValidPackageEntry(source, sourcePkg)) return false;
  if (sourcePkg.version !== targetPkg.version) return true;
  return !hasValidPackageEntry(target, targetPkg);
}

function getPreservedStandaloneCoreDir(runtimeDir) {
  return path.join(runtimeDir, ".standalone-core-preserve");
}

async function preserveStandaloneCorePackages(runtimeDir) {
  const startedAt = Date.now();
  const runtimeStandalone = getRuntimeStandaloneDir(runtimeDir);
  const standaloneNodeModules = path.join(runtimeStandalone, "node_modules");
  const preserveDir = getPreservedStandaloneCoreDir(runtimeDir);
  const preserved = [];

  await fs.promises.rm(preserveDir, { recursive: true, force: true });
  for (const packageName of CORE_PACKAGES) {
    const source = getCorePackagePath(standaloneNodeModules, packageName);
    const target = getCorePackagePath(preserveDir, packageName);
    try {
      const stat = await fs.promises.lstat(source);
      if (stat.isSymbolicLink()) {
        log("Pi Core preserve skipped", `${packageName}\nreason=link`);
        continue;
      }
      const pkg = readJson(path.join(source, "package.json"));
      if (!hasValidPackageEntry(source, pkg)) {
        log("Pi Core preserve skipped", `${packageName}\nreason=invalid package`);
        continue;
      }
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.rename(source, target);
      preserved.push({ packageName, version: pkg.version ?? "unknown" });
    } catch (error) {
      if (error?.code !== "ENOENT") {
        log("Pi Core preserve skipped", `${packageName}\nreason=${error.message || String(error)}`);
      }
    }
  }

  log(
    "Pi Core preserve complete",
    `count=${preserved.length}\npackages=${preserved.map((item) => `${item.packageName}@${item.version}`).join(", ") || "none"}\nelapsed=${Date.now() - startedAt}ms`,
  );
  return preserved;
}

async function restoreStandaloneCorePackages(runtimeDir) {
  const startedAt = Date.now();
  const runtimeStandalone = getRuntimeStandaloneDir(runtimeDir);
  const standaloneNodeModules = path.join(runtimeStandalone, "node_modules");
  const preserveDir = getPreservedStandaloneCoreDir(runtimeDir);
  const restored = [];

  try {
    if (!fs.existsSync(preserveDir)) return { restored };
    for (const packageName of CORE_PACKAGES) {
      const source = getCorePackagePath(preserveDir, packageName);
      const target = getCorePackagePath(standaloneNodeModules, packageName);
      if (!fs.existsSync(source)) continue;
      await removePathWithoutFollowingJunctionAsync(target);
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.rename(source, target);
      restored.push(packageName);
    }
    log(
      "Pi Core restore complete",
      `count=${restored.length}\npackages=${restored.join(", ") || "none"}\nelapsed=${Date.now() - startedAt}ms`,
    );
    return { restored };
  } finally {
    await fs.promises.rm(preserveDir, { recursive: true, force: true });
  }
}

async function ensureCorePackagesInStandalone(info = runtimeInfo, reason = desktopT("startup.syncingCore")) {
  if (coreStandaloneSyncPromise) return coreStandaloneSyncPromise;

  coreStandaloneSyncPromise = (async () => {
    const startedAt = Date.now();
    let changed = false;
    if (!info?.runtimeDir) return { changed };

    const runtimeNodeModules = getRuntimeNodeModules(info.runtimeDir);
    const standaloneNodeModules = path.join(getRuntimeStandaloneDir(info.runtimeDir), "node_modules");
    if (!fs.existsSync(standaloneNodeModules)) {
      log("Pi Core standalone sync skipped", `standalone node_modules missing\nelapsed=${Date.now() - startedAt}ms`);
      return { changed };
    }

    emitCoreSetupState({
      phase: coreSetupState.phase === "ready" ? "ready" : "starting",
      message: reason,
      detail: "",
      runtimeDir: info.runtimeDir,
    });

    for (const packageName of CORE_PACKAGES) {
      const packageStartedAt = Date.now();
      const source = getCorePackagePath(runtimeNodeModules, packageName);
      const target = getCorePackagePath(standaloneNodeModules, packageName);
      let sourcePkg = null;
      try {
        sourcePkg = readJson(path.join(source, "package.json"));
      } catch {
        log("Pi Core package sync skipped", `${packageName}\nsource package missing\nelapsed=${Date.now() - packageStartedAt}ms`);
        continue;
      }
      if (!hasValidPackageEntry(source, sourcePkg)) {
        log("Pi Core package sync skipped", `${packageName}\nsource package invalid\nelapsed=${Date.now() - packageStartedAt}ms`);
        continue;
      }
      if (!needsCorePackageSync(source, target)) {
        log("Pi Core package sync skipped", `${packageName}\nversion=${sourcePkg.version ?? "unknown"}\nelapsed=${Date.now() - packageStartedAt}ms`);
        continue;
      }

      try {
        await removePathWithoutFollowingJunctionAsync(target);
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        await fs.promises.cp(source, target, { recursive: true, dereference: true });
        changed = true;
        log(
          "Copied Pi Core package into standalone runtime",
          `${packageName}\nversion=${sourcePkg.version ?? "unknown"}\nsource=${source}\ntarget=${target}\nelapsed=${Date.now() - packageStartedAt}ms`,
        );
      } catch (error) {
        throw new Error(`Could not copy ${packageName} into the standalone runtime.\n\n${error.message}`);
      }
    }

    log("Pi Core standalone sync complete", `changed=${changed}\nelapsed=${Date.now() - startedAt}ms`);
    return { changed };
  })().finally(() => {
    coreStandaloneSyncPromise = null;
  });

  return coreStandaloneSyncPromise;
}

async function syncRuntimeStandalone(appRoot, runtimeDir) {
  const packagedStandalone = path.join(appRoot, ".next", "standalone");
  const runtimeStandalone = getRuntimeStandaloneDir(runtimeDir);
  const packagedBuildId = getStandaloneBuildId(packagedStandalone);
  const runtimeBuildId = getStandaloneBuildId(runtimeStandalone);
  const runtimeServer = path.join(runtimeStandalone, "server.js");

  if (packagedBuildId && packagedBuildId === runtimeBuildId && fs.existsSync(runtimeServer)) {
    return runtimeServer;
  }

  log("Syncing Next.js standalone server to runtime", `source=${packagedStandalone}\ntarget=${runtimeStandalone}`);
  emitCoreSetupState({
    phase: coreSetupState.phase === "ready" ? "ready" : "starting",
    message: desktopT("startup.preparingRuntime"),
    detail: "",
    runtimeDir,
  });
  await preserveStandaloneCorePackages(runtimeDir);
  await fs.promises.rm(runtimeStandalone, { recursive: true, force: true });
  await fs.promises.mkdir(path.dirname(runtimeStandalone), { recursive: true });
  await fs.promises.cp(packagedStandalone, runtimeStandalone, { recursive: true });
  await restoreStandaloneCorePackages(runtimeDir);
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

function startNextServer() {
  if (serverUrl) return serverUrl;
  if (nextStartupPromise) return nextStartupPromise;

  nextStartupPromise = doStartNextServer()
    .finally(() => {
      nextStartupPromise = null;
    });
  return nextStartupPromise;
}

async function doStartNextServer() {
  if (serverUrl) return serverUrl;

  const externalServerUrl = getExternalServerUrl();
  if (externalServerUrl) {
    log(`Using external development server: ${externalServerUrl}`);
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

  if (!runtimeInfo) runtimeInfo = getInitialRuntimeInfo();
  const standaloneServer = devMode
    ? packagedStandaloneServer
    : await syncRuntimeStandalone(appRoot, runtimeInfo.runtimeDir);
  if (!devMode) await ensureCorePackagesInStandalone(runtimeInfo);
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
      serverUrl = null;
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
    isLoadingLocalShell = false;
    await mainWindow.loadURL(url);
  }
}

async function loadMainAppWhenReady() {
  try {
    await loadLocalShell(
      desktopT("startup.starting"),
      desktopT("startup.startingService"),
      coreSetupState.detail || "",
    );
    const url = await startNextServer();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    isLoadingLocalShell = false;
    await mainWindow.loadURL(url);
  } catch (error) {
    const detail = error.stack || error.message || String(error);
    log("Pi App local service failed to start", detail);
    await loadLocalShell(
      desktopT("startup.serviceFailedTitle"),
      desktopT("startup.serviceFailedMessage"),
      detail,
      { variant: "error" },
    );
  }
}

async function handleCoreUpdate({ silent = false } = {}) {
  if (coreSetupState.phase !== "ready") return;
  let remote;
  try {
    remote = await checkRemoteCoreVersions();
  } catch (error) {
    if (!silent) {
      await dialog.showMessageBox({
        type: "warning",
        title: desktopT("dialog.updateCheckFailedTitle"),
        message: desktopT("dialog.updateCheckFailedMessage"),
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
        title: desktopT("dialog.upToDateTitle"),
        message: desktopT("dialog.upToDateMessage"),
        detail: CORE_PACKAGES.map((name) => `${name}: ${installed[name] ?? desktopT("common.missing")}`).join("\n"),
      });
    }
    return;
  }

  if (silent) return;

  if (await hasBusyAgentSessions()) {
    await dialog.showMessageBox({
      type: "warning",
      title: desktopT("dialog.updatePostponedTitle"),
      message: desktopT("dialog.updatePostponedMessage"),
      detail: desktopT("dialog.updatePostponedDetail"),
    });
    return;
  }

  const result = await dialog.showMessageBox({
    type: "question",
    title: desktopT("dialog.updateQuestionTitle"),
    message: desktopT("dialog.updateQuestionMessage"),
    detail: updates.map((item) => `${item.name}: ${item.installed ?? desktopT("common.missing")} -> ${item.remote}`).join("\n"),
    buttons: [desktopT("common.update"), desktopT("common.cancel")],
    defaultId: 0,
    cancelId: 1,
  });
  if (result.response !== 0) return;

  emitCoreSetupState({
    phase: "installing",
    message: desktopT("startup.updatingCore"),
    detail: "",
    runtimeDir: runtimeInfo?.runtimeDir ?? getRuntimeDir(),
  });
  await installCoreRuntime(desktopT("startup.updatingCore"));
  runtimeInfo = {
    runtimeDir: getRuntimeDir(),
    nodeModules: getRuntimeNodeModules(getRuntimeDir()),
    specs: getCoreSpecs(),
    versions: readInstalledCoreVersions(getRuntimeDir()),
  };
  const syncResult = await ensureCorePackagesInStandalone(runtimeInfo);
  if (syncResult.changed) {
    await restartNextServer();
  }
  emitCoreSetupState({
    phase: "ready",
    message: desktopT("startup.coreReady"),
    detail: "",
    runtimeDir: runtimeInfo.runtimeDir,
  });
}

function registerDesktopIpc() {
  ipcMain.handle("piDesktop:getCoreSetupState", async () => coreSetupState);
  ipcMain.handle("piDesktop:retryCoreSetup", async () => {
    startCoreSetup().catch((error) => {
      log("Pi Core setup failed", error.stack || error.message);
    });
    return coreSetupState;
  });
  ipcMain.handle("piDesktop:retryStartup", async () => {
    if (isLoadingLocalShell || !serverUrl) {
      loadMainAppWhenReady().catch((error) => {
        log("Pi App startup retry failed", error.stack || error.message);
      });
    }
    if (coreSetupState.phase === "error") {
      startCoreSetup().catch((error) => {
        log("Pi Core setup retry failed", error.stack || error.message);
      });
    }
    return coreSetupState;
  });
  ipcMain.handle("piDesktop:quit", async () => {
    app.quit();
    return null;
  });
  ipcMain.handle("piDesktop:getCoreStatus", async () => getCoreStatus());
  ipcMain.handle("piDesktop:checkCoreUpdates", async () => getCoreStatus(await checkRemoteCoreVersions()));
  ipcMain.handle("piDesktop:updateCore", async () => {
    if (await hasBusyAgentSessions()) {
      const error = new Error(desktopT("dialog.busyError"));
      error.code = "busy";
      throw error;
    }

    emitCoreSetupState({
      phase: "installing",
      message: desktopT("startup.updatingCore"),
      detail: "",
      runtimeDir: runtimeInfo?.runtimeDir ?? getRuntimeDir(),
    });
    await installCoreRuntime(desktopT("startup.updatingCore"));
    runtimeInfo = {
      runtimeDir: getRuntimeDir(),
      nodeModules: getRuntimeNodeModules(getRuntimeDir()),
      specs: getCoreSpecs(),
      versions: readInstalledCoreVersions(getRuntimeDir()),
    };
    const syncResult = await ensureCorePackagesInStandalone(runtimeInfo);
    if (syncResult.changed) {
      await restartNextServer();
    }
    emitCoreSetupState({
      phase: "ready",
      message: desktopT("startup.coreReady"),
      detail: "",
      runtimeDir: runtimeInfo.runtimeDir,
    });
    return getCoreStatus(await checkRemoteCoreVersions().catch(() => null));
  });
  ipcMain.handle("piDesktop:openRuntimeFolder", async () => shell.openPath(getRuntimeDir()));
  ipcMain.handle("piDesktop:openLogFile", async () => {
    log("Opening desktop log");
    return shell.openPath(getLogPath());
  });
  ipcMain.handle("piDesktop:selectDirectory", async () => {
    const options = {
      title: desktopT("dialog.chooseProjectFolder"),
      properties: ["openDirectory"],
    };
    const result = mainWindow && !mainWindow.isDestroyed()
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
  ipcMain.handle("piDesktop:setTheme", async (_event, mode, resolvedTheme) => {
    applyWindowTheme(mode, resolvedTheme);
    return null;
  });
  ipcMain.handle("piDesktop:getLanguageMode", async () => getLanguageMode());
  ipcMain.handle("piDesktop:setLanguageMode", async (_event, mode, resolved) => {
    if (!isLanguageMode(mode)) return null;
    writeDesktopPreferences({
      languageMode: mode,
      resolvedLanguage: isResolvedLanguage(resolved) ? resolved : resolveSystemLanguage(),
    });
    createMenu();
    if (coreSetupState.phase === "starting" && coreSetupState.message === DESKTOP_TRANSLATIONS.en["startup.starting"]) {
      emitCoreSetupState({ message: desktopT("startup.starting") });
    }
    return null;
  });
}

function createMainWindow() {
  const initialTheme = nativeTheme.shouldUseDarkColors ? "dark" : "light";
  const titleBarStyle = process.platform === "darwin"
    ? "hiddenInset"
    : undefined;
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: PRODUCT_NAME,
    icon: getAppIconPath(),
    show: false,
    ...(titleBarStyle ? { titleBarStyle } : {}),
    autoHideMenuBar: process.platform !== "darwin",
    backgroundColor: WINDOW_THEME_COLORS[initialTheme].background,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (process.platform !== "darwin") {
    mainWindow.setMenuBarVisibility(false);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    shell.openExternal(targetUrl);
    return { action: "deny" };
  });
  mainWindow.webContents.on("did-finish-load", () => {
    sendCoreSetupStateToWindow(mainWindow);
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function openSettingsFromMenu() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send("piDesktop:openSettings");
}

function createMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{
      label: PRODUCT_NAME,
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: desktopT("menu.settings"),
          accelerator: "CmdOrCtrl+,",
          click: openSettingsFromMenu,
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    }] : []),
    {
      label: desktopT("menu.file"),
      submenu: [
        ...(!isMac ? [
          {
            label: desktopT("menu.settings"),
            accelerator: "Ctrl+,",
            click: openSettingsFromMenu,
          },
          { type: "separator" },
        ] : []),
        { role: "close" },
        ...(!isMac ? [
          { type: "separator" },
          { role: "quit" },
        ] : []),
      ],
    },
    {
      label: desktopT("menu.edit"),
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        ...(isMac ? [{ role: "pasteAndMatchStyle" }] : []),
        { role: "delete" },
        { type: "separator" },
        { role: "selectAll" },
        ...(isMac ? [
          { type: "separator" },
          {
            label: "Speech",
            submenu: [
              { role: "startSpeaking" },
              { role: "stopSpeaking" },
            ],
          },
        ] : []),
      ],
    },
    {
      label: desktopT("menu.view"),
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: desktopT("menu.piCore"),
      submenu: [
        {
          label: desktopT("menu.checkUpdates"),
          click: () => handleCoreUpdate({ silent: false }),
        },
        {
          label: desktopT("menu.restartService"),
          click: () => restartNextServer().catch((error) => {
            dialog.showErrorBox(desktopT("dialog.restartFailed"), error.message);
          }),
        },
        { type: "separator" },
        {
          label: desktopT("menu.openRuntime"),
          click: () => shell.openPath(getRuntimeDir()),
        },
        {
          label: desktopT("menu.openLog"),
          click: () => {
            log("Opening desktop log");
            shell.openPath(getLogPath());
          },
        },
      ],
    },
    {
      label: desktopT("menu.window"),
      submenu: [
        { role: "minimize" },
        ...(isMac ? [
          { role: "zoom" },
          { type: "separator" },
          { role: "front" },
        ] : [
          { role: "close" },
        ]),
      ],
    },
    {
      role: "help",
      submenu: [
        {
          label: desktopT("menu.helpGithub"),
          click: () => shell.openExternal(GITHUB_URL),
        },
        {
          label: desktopT("menu.helpIssue"),
          click: () => shell.openExternal(GITHUB_ISSUES_URL),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function boot() {
  isBooting = true;
  try {
    runtimeInfo = getInitialRuntimeInfo();
    emitCoreSetupState({
      phase: "starting",
      message: desktopT("startup.starting"),
      detail: "",
      runtimeDir: runtimeInfo.runtimeDir,
    });
    log(`${PRODUCT_NAME} booting`, `userData=${app.getPath("userData")}\nnode=${getNodeCommand()}\nnpm=${getNpmCommand()}\nPATH=${withDesktopPath().PATH}`);
    createMenu();
    createMainWindow();
    loadMainAppWhenReady().catch((error) => {
      log("Pi App local service failed to start", error.stack || error.message);
    });
    startCoreSetup().catch((error) => {
      log("Pi Core setup failed", error.stack || error.message);
    });
  } finally {
    isBooting = false;
  }
}

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;
  registerDesktopIpc();
  nativeTheme.on("updated", () => {
    if (nativeTheme.themeSource === "system") {
      applyWindowTheme("system");
    }
  });
  boot().catch((error) => {
    log(`${PRODUCT_NAME} failed to start`, error.stack || error.message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      loadLocalShell(
        desktopT("startup.serviceFailedTitle"),
        desktopT("startup.bootFailedMessage"),
        error.stack || error.message || String(error),
        { variant: "error" },
      ).catch(() => {
        dialog.showErrorBox(`${PRODUCT_NAME} failed to start`, error.message);
      });
    } else {
      dialog.showErrorBox(`${PRODUCT_NAME} failed to start`, error.message);
      app.quit();
    }
  });
});

app.on("second-instance", () => {
  focusExistingInstance();
});

app.on("activate", () => {
  if (!mainWindow) {
    createMainWindow();
    if (serverUrl) {
      isLoadingLocalShell = false;
      mainWindow.loadURL(serverUrl).catch((error) => {
        log("Failed to load existing app service", error.stack || error.message);
      });
    } else {
      loadMainAppWhenReady().catch((error) => {
        log("Pi App local service failed to start", error.stack || error.message);
      });
    }
    return;
  }
  focusExistingInstance();
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
