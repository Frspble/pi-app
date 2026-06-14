/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { pathToFileURL, fileURLToPath } = require("url");
const { randomUUID } = require("crypto");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PI_CORE_SERVICE_PORT || 0);
const TOKEN = process.env.PI_CORE_SERVICE_TOKEN || "";
const RUNTIME_DIR = process.env.PI_CORE_RUNTIME_DIR || process.cwd();
const CORE_PACKAGES = [
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-ai",
];
const TEST_TIMEOUT_MS = 20_000;

if (!TOKEN) {
  console.error("[core-service] PI_CORE_SERVICE_TOKEN is required");
  process.exit(1);
}

let pi = null;
let piAi = null;
let server = null;
const sessions = new Map();
const startLocks = new Map();
const sessionPathCache = new Map();
const loginCallbacks = new Map();

function sendJson(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, text, status = 200) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(text);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function getPackageDir(packageName) {
  return path.join(RUNTIME_DIR, "node_modules", ...packageName.split("/"));
}

function getPackageEntryCandidates(pkg) {
  const candidates = [];
  const rootExport = pkg.exports && pkg.exports["."];
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

function getPackageEntry(packageName) {
  const packageDir = getPackageDir(packageName);
  const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8"));
  for (const candidate of getPackageEntryCandidates(pkg)) {
    const entry = path.join(packageDir, candidate);
    if (fs.existsSync(entry)) return entry;
  }
  throw new Error(`Could not find entry point for ${packageName}`);
}

async function importRuntimePackage(packageName) {
  return import(pathToFileURL(getPackageEntry(packageName)).href);
}

async function loadCore() {
  if (pi && piAi) return;
  [pi, piAi] = await Promise.all([
    importRuntimePackage("@earendil-works/pi-coding-agent"),
    importRuntimePackage("@earendil-works/pi-ai"),
  ]);
}

function normalizeToolCallBlock(block) {
  if (!block || typeof block !== "object" || Array.isArray(block) || block.type !== "toolCall") {
    return null;
  }
  return {
    type: "toolCall",
    toolCallId: typeof block.toolCallId === "string" ? block.toolCallId : (typeof block.id === "string" ? block.id : ""),
    toolName: typeof block.toolName === "string" ? block.toolName : (typeof block.name === "string" ? block.name : ""),
    input: block.input && typeof block.input === "object" && !Array.isArray(block.input)
      ? block.input
      : (block.arguments && typeof block.arguments === "object" && !Array.isArray(block.arguments) ? block.arguments : {}),
  };
}

function normalizeToolCalls(msg) {
  if (!msg || msg.role !== "assistant" || !Array.isArray(msg.content)) return msg;
  return {
    ...msg,
    content: msg.content.map((block) => normalizeToolCallBlock(block) || block),
  };
}

function getPathCache() {
  return sessionPathCache;
}

async function listAllSessions() {
  const piSessions = await pi.SessionManager.listAll();
  const pathToId = new Map();
  for (const s of piSessions) pathToId.set(s.path, s.id);
  const cache = getPathCache();
  return piSessions.map((s) => {
    cache.set(s.id, s.path);
    return {
      path: s.path,
      id: s.id,
      cwd: s.cwd,
      name: s.name,
      created: s.created instanceof Date ? s.created.toISOString() : String(s.created),
      modified: s.modified instanceof Date ? s.modified.toISOString() : String(s.modified),
      messageCount: s.messageCount,
      firstMessage: s.firstMessage || "(no messages)",
      parentSessionId: s.parentSessionPath ? pathToId.get(s.parentSessionPath) : undefined,
    };
  });
}

async function resolveSessionPath(sessionId) {
  const cached = getPathCache().get(sessionId);
  if (cached) return cached;
  await listAllSessions();
  return getPathCache().get(sessionId) || null;
}

function cacheSessionPath(sessionId, filePath) {
  getPathCache().set(sessionId, filePath);
}

function invalidateSessionPathCache(sessionId) {
  getPathCache().delete(sessionId);
}

function buildSessionContext(entries, leafId) {
  const byId = new Map();
  for (const entry of entries) byId.set(entry.id, entry);
  const piCtx = pi.buildSessionContext(entries, leafId, byId);
  let targetLeaf = undefined;
  if (leafId === null) {
    return { messages: [], entryIds: [], thinkingLevel: piCtx.thinkingLevel, model: piCtx.model };
  }
  if (leafId) targetLeaf = byId.get(leafId);
  if (!targetLeaf) targetLeaf = entries[entries.length - 1];
  if (!targetLeaf) {
    return { messages: [], entryIds: [], thinkingLevel: piCtx.thinkingLevel, model: piCtx.model };
  }

  const pathEntries = [];
  let cur = targetLeaf;
  while (cur) {
    pathEntries.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }

  let compactionId = undefined;
  let firstKeptEntryId = undefined;
  for (const entry of pathEntries) {
    if (entry.type === "compaction") {
      compactionId = entry.id;
      firstKeptEntryId = entry.firstKeptEntryId;
    }
  }

  const entryIds = [];
  if (compactionId) {
    entryIds.push(compactionId);
    const compactionIdx = pathEntries.findIndex((entry) => entry.id === compactionId);
    const firstKeptIdx = firstKeptEntryId
      ? pathEntries.findIndex((entry, index) => index < compactionIdx && entry.id === firstKeptEntryId)
      : -1;
    const startIdx = firstKeptIdx >= 0 ? firstKeptIdx : compactionIdx;
    for (let i = startIdx; i < compactionIdx; i++) {
      if (pathEntries[i].type === "message") entryIds.push(pathEntries[i].id);
    }
    for (let i = compactionIdx + 1; i < pathEntries.length; i++) {
      if (pathEntries[i].type === "message") entryIds.push(pathEntries[i].id);
    }
  } else {
    for (const entry of pathEntries) {
      if (entry.type === "message") entryIds.push(entry.id);
    }
  }

  const messages = piCtx.messages.map((msg) => {
    if (msg && msg.role === "compactionSummary") {
      return {
        role: "user",
        content: `*The conversation history before this point was compacted into the following summary:*\n\n${msg.summary || ""}`,
        timestamp: msg.timestamp,
      };
    }
    return normalizeToolCalls(msg);
  });

  return {
    messages,
    entryIds,
    thinkingLevel: piCtx.thinkingLevel,
    model: piCtx.model,
  };
}

class AgentSessionWrapper {
  constructor(inner) {
    this.inner = inner;
    this.listeners = [];
    this.unsubscribe = null;
    this.idleTimer = null;
    this.onDestroyCallback = null;
    this.alive = true;
  }

  get sessionId() {
    return this.inner.sessionId;
  }

  get sessionFile() {
    return this.inner.sessionFile || "";
  }

  isAlive() {
    return this.alive;
  }

  isBusy() {
    return Boolean(this.inner.isStreaming || this.inner.isCompacting);
  }

  start() {
    this.unsubscribe = this.inner.subscribe((event) => {
      this.resetIdleTimer();
      for (const listener of this.listeners) listener(event);
    });
    this.resetIdleTimer();
  }

  resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.destroy(), 10 * 60 * 1000);
  }

  onEvent(listener) {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) this.listeners.splice(index, 1);
    };
  }

  onDestroy(callback) {
    this.onDestroyCallback = callback;
  }

  async send(command) {
    this.resetIdleTimer();
    const type = command.type;
    switch (type) {
      case "prompt": {
        const promptImages = command.images;
        this.inner.prompt(command.message, Array.isArray(promptImages) && promptImages.length ? { images: promptImages } : undefined).catch(() => {});
        return null;
      }
      case "abort":
        await this.inner.abort();
        return null;
      case "get_state": {
        const model = this.inner.model;
        const contextUsage = this.inner.getContextUsage();
        return {
          sessionId: this.inner.sessionId,
          sessionFile: this.inner.sessionFile || "",
          isStreaming: this.inner.isStreaming,
          isCompacting: this.inner.isCompacting,
          autoCompactionEnabled: this.inner.autoCompactionEnabled,
          autoRetryEnabled: this.inner.autoRetryEnabled,
          model: model ? {
            id: model.id,
            provider: model.provider,
            ...(typeof model.contextWindow === "number" ? { contextWindow: model.contextWindow } : {}),
          } : undefined,
          messageCount: 0,
          pendingMessageCount: 0,
          contextUsage: contextUsage
            ? { percent: contextUsage.percent, contextWindow: contextUsage.contextWindow, tokens: contextUsage.tokens }
            : null,
          systemPrompt: (this.inner.agent && this.inner.agent.state && this.inner.agent.state.systemPrompt) || "",
          thinkingLevel: (this.inner.agent && this.inner.agent.state && this.inner.agent.state.thinkingLevel) || "off",
        };
      }
      case "set_model": {
        const registry = this.inner.modelRegistry;
        const model = registry.find(command.provider, command.modelId);
        if (!model) throw new Error(`Model not found: ${command.provider}/${command.modelId}`);
        await this.inner.setModel(model);
        return { id: model.id, provider: model.provider };
      }
      case "fork": {
        const entryId = command.entryId;
        const sessionManager = this.inner.sessionManager;
        const currentSessionFile = this.inner.sessionFile;
        if (!sessionManager.isPersisted()) return { cancelled: true };
        if (!currentSessionFile) throw new Error("Persisted session is missing a session file");
        const entry = sessionManager.getEntry(entryId);
        if (!entry) throw new Error("Invalid entry ID for forking");
        const sessionDir = sessionManager.getSessionDir();
        let newSessionFile;
        if (!entry.parentId) {
          const newManager = pi.SessionManager.create(sessionManager.getCwd(), sessionDir);
          newManager.newSession({ parentSession: currentSessionFile });
          newSessionFile = newManager.getSessionFile();
        } else {
          const sourceManager = pi.SessionManager.open(currentSessionFile, sessionDir);
          newSessionFile = sourceManager.createBranchedSession(entry.parentId);
          if (!newSessionFile) throw new Error("Failed to create forked session");
        }
        const newSessionId = pi.SessionManager.open(newSessionFile, sessionDir).getSessionId();
        cacheSessionPath(newSessionId, newSessionFile);
        this.destroy();
        return { cancelled: false, newSessionId };
      }
      case "navigate_tree":
        return { cancelled: (await this.inner.navigateTree(command.targetId, {})).cancelled };
      case "set_thinking_level":
        this.inner.setThinkingLevel(command.level);
        if (command.level === "xhigh" && this.inner.model && this.inner.model.compat && this.inner.model.compat.thinkingFormat === "deepseek" && this.inner.agent && this.inner.agent.state) {
          this.inner.agent.state.thinkingLevel = "xhigh";
        }
        return null;
      case "compact": {
        const { findCutPoint, DEFAULT_COMPACTION_SETTINGS } = pi;
        const pathEntries = this.inner.sessionManager.getBranch();
        const settings = { ...DEFAULT_COMPACTION_SETTINGS, ...this.inner.settingsManager.getCompactionSettings() };
        let prevCompactionIndex = -1;
        for (let i = pathEntries.length - 1; i >= 0; i--) {
          if (pathEntries[i].type === "compaction") {
            prevCompactionIndex = i;
            break;
          }
        }
        const boundaryStart = prevCompactionIndex + 1;
        const cutPoint = findCutPoint(pathEntries, boundaryStart, pathEntries.length, settings.keepRecentTokens);
        const historyEnd = cutPoint.isSplitTurn ? cutPoint.turnStartIndex : cutPoint.firstKeptEntryIndex;
        if (historyEnd <= boundaryStart) throw new Error("Conversation too short to compact");
        return this.inner.compact(command.customInstructions);
      }
      case "set_auto_compaction":
        this.inner.setAutoCompactionEnabled(command.enabled);
        return null;
      case "steer":
        await this.inner.steer(command.message, Array.isArray(command.images) && command.images.length ? command.images : undefined);
        return null;
      case "follow_up":
        await this.inner.followUp(command.message, Array.isArray(command.images) && command.images.length ? command.images : undefined);
        return null;
      case "get_tools": {
        const active = new Set(this.inner.getActiveToolNames());
        return this.inner.getAllTools().map((tool) => ({
          name: tool.name,
          description: tool.description,
          active: active.has(tool.name),
        }));
      }
      case "set_tools":
        this.inner.setActiveToolsByName(command.toolNames);
        return null;
      case "abort_compaction":
        this.inner.abortCompaction();
        return null;
      case "set_auto_retry":
        this.inner.setAutoRetryEnabled(command.enabled);
        return null;
      default:
        throw new Error(`Unsupported command: ${type}`);
    }
  }

  destroy() {
    if (!this.alive) return;
    this.alive = false;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.unsubscribe) this.unsubscribe();
    if (this.onDestroyCallback) this.onDestroyCallback();
  }
}

function getRpcSession(sessionId) {
  return sessions.get(sessionId);
}

function getRpcRuntimeState() {
  const aliveSessions = Array.from(sessions.values()).filter((session) => session.isAlive());
  const busySessions = aliveSessions.filter((session) => session.isBusy()).length;
  return {
    aliveSessions: aliveSessions.length,
    busySessions,
    busy: busySessions > 0,
  };
}

async function startRpcSession(sessionId, sessionFile, cwd, toolNames) {
  const existing = sessions.get(sessionId);
  if (existing && existing.isAlive()) return { session: existing, realSessionId: sessionId };
  const inflight = startLocks.get(sessionId);
  if (inflight) return inflight;

  const starting = (async () => {
    const agentDir = pi.getAgentDir();
    const sessionManager = sessionFile
      ? pi.SessionManager.open(sessionFile, undefined)
      : pi.SessionManager.create(cwd, undefined);
    const allCodingToolNames = ["read", "bash", "edit", "write", "grep", "find", "ls"];
    let toolsOption = undefined;
    if (toolNames !== undefined) {
      toolsOption = toolNames.length === 0 ? [] : allCodingToolNames;
    }
    const { session: inner } = await pi.createAgentSession({
      cwd,
      agentDir,
      sessionManager,
      ...(toolsOption !== undefined ? { tools: toolsOption } : {}),
    });
    if (toolNames && toolNames.length > 0) inner.setActiveToolsByName(toolNames);
    if (toolNames && toolNames.length === 0 && inner.agent && inner.agent.state) {
      inner.agent.state.systemPrompt = "";
    }

    const wrapper = new AgentSessionWrapper(inner);
    wrapper.start();
    const realSessionId = inner.sessionId;
    if (inner.sessionFile) cacheSessionPath(realSessionId, inner.sessionFile);
    wrapper.onDestroy(() => sessions.delete(realSessionId));
    sessions.set(realSessionId, wrapper);
    return { session: wrapper, realSessionId };
  })().finally(() => startLocks.delete(sessionId));

  startLocks.set(sessionId, starting);
  return starting;
}

function isAuthorized(req) {
  const auth = req.headers.authorization || "";
  return auth === `Bearer ${TOKEN}`;
}

function getSegments(url) {
  return url.pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
}

function encodeHeaderValue(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

function getAttachmentDisposition(fileName) {
  const fallback = fileName.replace(/[^\x20-\x7E]|["\\;\r\n]/g, "_") || "session.html";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeHeaderValue(fileName)}`;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      shell: false,
    });
    const timer = options.timeout
      ? setTimeout(() => {
          child.kill();
          reject(new Error(`${command} timed out after ${options.timeout}ms`));
        }, options.timeout)
      : null;
    if (child.stdout) child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    if (child.stderr) child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else {
        const error = new Error(`${command} ${args.join(" ")} exited with code ${code}`);
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });
  });
}

async function handleAgentNew(req, res) {
  const body = await parseJsonBody(req);
  const { cwd, ...command } = body;
  if (!cwd || typeof cwd !== "string") return sendJson(res, { error: "cwd is required" }, 400);
  if (!fs.existsSync(cwd)) return sendJson(res, { error: `Directory does not exist: ${cwd}` }, 400);
  const { provider, modelId, toolNames, thinkingLevel, ...promptCommand } = command;
  const tempKey = `__new__${Date.now()}`;
  const { session, realSessionId } = await startRpcSession(tempKey, "", cwd, toolNames);
  if (provider && modelId) await session.send({ type: "set_model", provider, modelId });
  if (thinkingLevel) await session.send({ type: "set_thinking_level", level: thinkingLevel });
  const result = await session.send(promptCommand);
  sendJson(res, { success: true, sessionId: realSessionId, data: result });
}

async function handleAgent(req, res, id, url) {
  if (req.method === "GET") {
    let session = getRpcSession(id);
    if ((!session || !session.isAlive()) && url.searchParams.has("ensureState")) {
      const filePath = await resolveSessionPath(id);
      if (!filePath) return sendJson(res, { error: "Session not found" }, 404);
      const cwd = pi.SessionManager.open(filePath).getHeader()?.cwd || process.cwd();
      ({ session } = await startRpcSession(id, filePath, cwd));
    }
    if (!session || !session.isAlive()) return sendJson(res, { running: false });
    const state = await session.send({ type: "get_state" });
    return sendJson(res, { running: true, state });
  }
  if (req.method !== "POST") return sendText(res, "Method not allowed", 405);
  const body = await parseJsonBody(req);
  const existing = getRpcSession(id);
  if (existing && existing.isAlive()) {
    const result = await existing.send(body);
    return sendJson(res, { success: true, data: result });
  }
  const filePath = await resolveSessionPath(id);
  if (!filePath) return sendJson(res, { error: "Session not found" }, 404);
  const cwd = pi.SessionManager.open(filePath).getHeader()?.cwd || process.cwd();
  const { session } = await startRpcSession(id, filePath, cwd);
  const result = await session.send(body);
  sendJson(res, { success: true, data: result });
}

async function handleAgentEvents(req, res, id) {
  let session = getRpcSession(id);
  if (!session || !session.isAlive()) {
    const filePath = await resolveSessionPath(id);
    if (!filePath) return sendText(res, "Session not found", 404);
    const cwd = pi.SessionManager.open(filePath).getHeader()?.cwd || process.cwd();
    try {
      ({ session } = await startRpcSession(id, filePath, cwd));
    } catch (error) {
      return sendText(res, `Failed to start agent: ${error}`, 500);
    }
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  send({ type: "connected", sessionId: id });
  const unsubscribe = session.onEvent(send);
  const heartbeat = setInterval(() => res.write(":\n\n"), 30_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

async function handleSessions(req, res) {
  if (req.method !== "GET") return sendText(res, "Method not allowed", 405);
  sendJson(res, { sessions: await listAllSessions() });
}

async function handleSession(req, res, id, url) {
  const filePath = await resolveSessionPath(id);
  if (!filePath) return sendJson(res, { error: "Session not found" }, 404);

  if (req.method === "GET") {
    const sm = pi.SessionManager.open(filePath);
    const entries = sm.getEntries();
    const tree = sm.getTree();
    const leafId = sm.getLeafId();
    const context = buildSessionContext(entries, leafId);
    const header = sm.getHeader();
    let modified = (header && header.timestamp) || new Date().toISOString();
    try { modified = fs.statSync(filePath).mtime.toISOString(); } catch {}
    const allSessions = await listAllSessions();
    const parentSessionId = allSessions.find((session) => session.id === id)?.parentSessionId;
    const userMessage = context.messages.find((message) => message.role === "user");
    const info = header ? {
      path: filePath,
      id: header.id,
      cwd: header.cwd || "",
      name: sm.getSessionName(),
      created: header.timestamp,
      modified,
      messageCount: context.messages.length,
      firstMessage: userMessage
        ? (() => {
            const content = userMessage.content;
            if (typeof content === "string") return content;
            if (Array.isArray(content)) return (content.find((block) => block.type === "text") || {}).text || "";
            return "(no messages)";
          })()
        : "(no messages)",
      parentSessionId,
    } : null;
    let agentState = undefined;
    if (url.searchParams.has("includeState")) {
      const rpc = getRpcSession(id);
      if (rpc && rpc.isAlive()) agentState = { running: true, state: await rpc.send({ type: "get_state" }) };
      else agentState = { running: false };
    }
    return sendJson(res, {
      sessionId: id,
      filePath,
      info,
      tree,
      leafId,
      context,
      ...(agentState !== undefined ? { agentState } : {}),
    });
  }

  if (req.method === "PATCH") {
    const body = await parseJsonBody(req);
    if (typeof body.name !== "string") return sendJson(res, { error: "name is required" }, 400);
    pi.SessionManager.open(filePath).appendSessionInfo(body.name.trim());
    return sendJson(res, { ok: true });
  }

  if (req.method === "DELETE") {
    const firstLine = fs.readFileSync(filePath, "utf8").split("\n")[0];
    let parentSessionPath = undefined;
    try {
      const header = JSON.parse(firstLine);
      if (header.type === "session") parentSessionPath = header.parentSession;
    } catch {}
    const dir = filePath.replace(/\\/g, "/").split("/").slice(0, -1).join("/");
    try {
      const files = fs.readdirSync(dir).filter((file) => file.endsWith(".jsonl") && path.join(dir, file) !== filePath);
      for (const file of files) {
        const childPath = path.join(dir, file);
        try {
          const content = fs.readFileSync(childPath, "utf8");
          const lines = content.split("\n");
          const header = JSON.parse(lines[0]);
          if (header.type === "session" && header.parentSession === filePath) {
            header.parentSession = parentSessionPath;
            lines[0] = JSON.stringify(header);
            fs.writeFileSync(childPath, lines.join("\n"));
          }
        } catch {}
      }
    } catch {}
    const rpc = getRpcSession(id);
    if (rpc) rpc.destroy();
    fs.unlinkSync(filePath);
    invalidateSessionPathCache(id);
    return sendJson(res, { ok: true });
  }

  return sendText(res, "Method not allowed", 405);
}

async function handleSessionContext(req, res, id, url) {
  if (req.method !== "GET") return sendText(res, "Method not allowed", 405);
  const leafId = url.searchParams.get("leafId") || undefined;
  const filePath = await resolveSessionPath(id);
  if (!filePath) return sendJson(res, { error: "Session not found" }, 404);
  const sm = pi.SessionManager.open(filePath);
  sendJson(res, { context: buildSessionContext(sm.getEntries(), leafId) });
}

async function handleSessionExport(req, res, id) {
  if (req.method !== "GET") return sendText(res, "Method not allowed", 405);
  const filePath = await resolveSessionPath(id);
  if (!filePath) return sendJson(res, { error: "Session not found" }, 404);
  const cliPath = path.join(path.dirname(fileURLToPath(pathToFileURL(getPackageEntry("@earendil-works/pi-coding-agent")).href)), "cli.js");
  if (!fs.existsSync(cliPath)) return sendJson(res, { error: "pi CLI not found" }, 500);
  const tempDir = path.join(os.tmpdir(), "pi-web-export");
  fs.mkdirSync(tempDir, { recursive: true });
  const sessionBase = path.basename(filePath, ".jsonl");
  const fileName = `pi-session-${sessionBase}.html`;
  const outputPath = path.join(tempDir, `${randomUUID()}.html`);
  try {
    await runCommand(process.execPath, [cliPath, "--export", filePath, outputPath], {
      cwd: process.cwd(),
      timeout: 30_000,
      env: {
        ...process.env,
        PI_OFFLINE: "1",
        PI_SKIP_VERSION_CHECK: "1",
      },
    });
    const html = fs.readFileSync(outputPath, "utf8");
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": getAttachmentDisposition(fileName),
      "Cache-Control": "no-cache",
    });
    res.end(html);
  } finally {
    fs.rmSync(outputPath, { force: true });
  }
}

async function handleModels(req, res) {
  if (req.method !== "GET") return sendText(res, "Method not allowed", 405);
  const nameMap = new Map();
  let modelList = [];
  let defaultModel = null;
  const thinkingLevels = {};
  const thinkingLevelMaps = {};
  try {
    const agentDir = pi.getAgentDir();
    const authStorage = pi.AuthStorage.create();
    const registry = pi.ModelRegistry.create(authStorage);
    const available = registry.getAvailable();
    const configuredContextWindows = readConfiguredContextWindows();
    modelList = available.map((model) => ({
      id: model.id,
      name: model.name,
      provider: model.provider,
      ...(typeof model.contextWindow === "number"
        ? { contextWindow: model.contextWindow }
        : configuredContextWindows.has(`${model.provider}:${model.id}`)
          ? { contextWindow: configuredContextWindows.get(`${model.provider}:${model.id}`) }
          : {}),
    }));
    for (const model of available) {
      const key = `${model.provider}:${model.id}`;
      nameMap.set(key, model.name);
      thinkingLevels[key] = piAi.getSupportedThinkingLevels(model);
      if (model.thinkingLevelMap) thinkingLevelMaps[key] = model.thinkingLevelMap;
    }
    const settings = pi.SettingsManager.create(process.cwd(), agentDir);
    const provider = settings.getDefaultProvider();
    const modelId = settings.getDefaultModel();
    if (provider) defaultModel = { provider, modelId: modelId || (available[0] && available[0].id) || "" };
  } catch {}
  sendJson(res, { models: Object.fromEntries(nameMap), modelList, defaultModel, thinkingLevels, thinkingLevelMaps });
}

function getModelsPath() {
  return path.join(pi.getAgentDir(), "models.json");
}

function readModelsJson() {
  const modelsPath = getModelsPath();
  if (!fs.existsSync(modelsPath)) return { providers: {} };
  try {
    return JSON.parse(fs.readFileSync(modelsPath, "utf8"));
  } catch {
    return { providers: {} };
  }
}

function readConfiguredContextWindows() {
  const result = new Map();
  const modelsJson = readModelsJson();
  if (!modelsJson || typeof modelsJson !== "object" || Array.isArray(modelsJson)) return result;
  const providers = modelsJson.providers;
  if (!providers || typeof providers !== "object" || Array.isArray(providers)) return result;
  for (const [provider, config] of Object.entries(providers)) {
    const models = config && typeof config === "object" && !Array.isArray(config) ? config.models : undefined;
    if (!Array.isArray(models)) continue;
    for (const model of models) {
      if (!model || typeof model !== "object" || Array.isArray(model)) continue;
      if (typeof model.id === "string" && typeof model.contextWindow === "number") {
        result.set(`${provider}:${model.id}`, model.contextWindow);
      }
    }
  }
  return result;
}

function writeModelsJson(data) {
  const modelsPath = getModelsPath();
  fs.mkdirSync(path.dirname(modelsPath), { recursive: true });
  fs.writeFileSync(modelsPath, JSON.stringify(data, null, 2), "utf8");
}

async function handleModelsConfig(req, res) {
  if (req.method === "GET") return sendJson(res, readModelsJson());
  if (req.method === "PUT") {
    writeModelsJson(await parseJsonBody(req));
    return sendJson(res, { success: true });
  }
  return sendText(res, "Method not allowed", 405);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getAssistantText(message) {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

async function handleModelsConfigTest(req, res) {
  if (req.method !== "POST") return sendText(res, "Method not allowed", 405);
  let tempDir = undefined;
  try {
    const body = await parseJsonBody(req);
    const providerName = typeof body.providerName === "string" ? body.providerName.trim() : "";
    if (!providerName) return sendJson(res, { ok: false, error: "providerName is required" }, 400);
    if (!isRecord(body.provider)) return sendJson(res, { ok: false, error: "provider is required" }, 400);
    if (!isRecord(body.model)) return sendJson(res, { ok: false, error: "model is required" }, 400);
    const modelId = typeof body.model.id === "string" ? body.model.id.trim() : "";
    if (!modelId) return sendJson(res, { ok: false, error: "Model ID is required" }, 400);

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-web-model-test-"));
    const modelsPath = path.join(tempDir, "models.json");
    fs.writeFileSync(modelsPath, JSON.stringify({
      providers: {
        [providerName]: {
          ...body.provider,
          models: [{ ...body.model, id: modelId }],
        },
      },
    }, null, 2), "utf8");

    const registry = pi.ModelRegistry.create(pi.AuthStorage.create(), modelsPath);
    const loadError = registry.getError();
    if (loadError) return sendJson(res, { ok: false, error: loadError });
    const model = registry.find(providerName, modelId);
    if (!model) return sendJson(res, { ok: false, error: `Model not found: ${providerName}/${modelId}` });
    const auth = await registry.getApiKeyAndHeaders(model);
    if (!auth.ok) return sendJson(res, { ok: false, error: auth.error });
    if (!auth.apiKey) return sendJson(res, { ok: false, error: `No API key found for "${providerName}"` });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
    let status = undefined;
    const startedAt = Date.now();
    try {
      const message = await piAi.completeSimple(model, {
        messages: [{ role: "user", content: "Reply with OK only.", timestamp: Date.now() }],
      }, {
        apiKey: auth.apiKey,
        headers: auth.headers,
        maxTokens: 16,
        timeoutMs: TEST_TIMEOUT_MS,
        maxRetries: 0,
        cacheRetention: "none",
        signal: controller.signal,
        onResponse: (response) => { status = response.status; },
      });
      const latencyMs = Date.now() - startedAt;
      if (message.stopReason === "error" || message.stopReason === "aborted") {
        return sendJson(res, {
          ok: false,
          error: message.errorMessage || (controller.signal.aborted ? "Test timed out" : "Model returned an error"),
          latencyMs,
          status,
        });
      }
      return sendJson(res, {
        ok: true,
        latencyMs,
        status,
        responseText: getAssistantText(message).slice(0, 300),
      });
    } finally {
      clearTimeout(timeout);
    }
  } finally {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function handleAuthProviders(req, res) {
  if (req.method !== "GET") return sendText(res, "Method not allowed", 405);
  const authStorage = pi.AuthStorage.create();
  const providers = authStorage.getOAuthProviders();
  const excluded = new Set(["anthropic"]);
  const displayNames = {
    "openai-codex": "ChatGPT Plus/Pro",
    "github-copilot": "GitHub Copilot",
  };
  const result = await Promise.all(
    providers
      .filter((provider) => !excluded.has(provider.id))
      .map(async (provider) => ({
        id: provider.id,
        name: displayNames[provider.id] || provider.name,
        usesCallbackServer: provider.usesCallbackServer || false,
        loggedIn: authStorage.has(provider.id),
      })),
  );
  sendJson(res, { providers: result });
}

async function handleAuthAllProviders(req, res) {
  if (req.method !== "GET") return sendText(res, "Method not allowed", 405);
  const oauthProviderIds = new Set(["anthropic", "github-copilot", "openai-codex"]);
  const authStorage = pi.AuthStorage.create();
  const registry = pi.ModelRegistry.create(authStorage);
  const all = registry.getAll();
  const seen = new Set();
  const result = [];
  for (const model of all) {
    if (seen.has(model.provider)) continue;
    seen.add(model.provider);
    if (oauthProviderIds.has(model.provider)) continue;
    const status = registry.getProviderAuthStatus(model.provider);
    if (status.source === "models_json_key") continue;
    result.push({
      id: model.provider,
      displayName: registry.getProviderDisplayName(model.provider),
      configured: status.configured,
      source: status.source,
      modelCount: all.filter((item) => item.provider === model.provider).length,
    });
  }
  sendJson(res, { providers: result });
}

async function handleAuthApiKey(req, res, provider) {
  const authStorage = pi.AuthStorage.create();
  if (req.method === "GET") {
    const registry = pi.ModelRegistry.create(authStorage);
    const status = registry.getProviderAuthStatus(provider);
    const displayName = registry.getProviderDisplayName(provider);
    const models = registry.getAll().filter((model) => model.provider === provider).length;
    return sendJson(res, { provider, displayName, configured: status.configured, source: status.source, models });
  }
  if (req.method === "POST") {
    const body = await parseJsonBody(req);
    if (!body.apiKey || typeof body.apiKey !== "string" || !body.apiKey.trim()) {
      return sendJson(res, { error: "apiKey is required" }, 400);
    }
    authStorage.set(provider, { type: "api_key", key: body.apiKey.trim() });
    return sendJson(res, { success: true });
  }
  if (req.method === "DELETE") {
    authStorage.remove(provider);
    return sendJson(res, { success: true });
  }
  return sendText(res, "Method not allowed", 405);
}

async function handleAuthLogout(req, res, provider) {
  if (req.method !== "POST") return sendText(res, "Method not allowed", 405);
  const authStorage = pi.AuthStorage.create();
  if (!authStorage.getOAuthProviders().find((item) => item.id === provider)) {
    return sendJson(res, { error: `Unknown provider: ${provider}` }, 400);
  }
  authStorage.logout(provider);
  sendJson(res, { ok: true });
}

async function handleAuthLoginPost(req, res, provider) {
  const body = await parseJsonBody(req);
  const { token, code } = body;
  if (!token || !code) return sendJson(res, { error: "token and code required" }, 400);
  const callbacks = loginCallbacks.get(token);
  if (!callbacks) return sendJson(res, { error: "No pending login for token" }, 404);
  if (!token.startsWith(`${provider}-`)) return sendJson(res, { error: "Token does not match provider" }, 400);
  callbacks.resolve(code);
  loginCallbacks.delete(token);
  sendJson(res, { ok: true, provider });
}

async function handleAuthLoginGet(req, res, provider) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  const abort = new AbortController();
  req.on("close", () => abort.abort());
  const authStorage = pi.AuthStorage.create();
  const providerInfo = authStorage.getOAuthProviders().find((item) => item.id === provider);
  if (!providerInfo) {
    send({ type: "error", message: `Unknown provider: ${provider}` });
    res.end();
    return;
  }

  const activeTokens = new Set();
  let pendingManualRequest = undefined;
  const createClientInputRequest = () => {
    const token = `${provider}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    activeTokens.add(token);
    const promise = new Promise((resolve, reject) => {
      loginCallbacks.set(token, {
        resolve: (value) => {
          activeTokens.delete(token);
          loginCallbacks.delete(token);
          resolve(value);
        },
        reject: (error) => {
          activeTokens.delete(token);
          loginCallbacks.delete(token);
          reject(error);
        },
      });
    });
    return { token, promise };
  };
  const getManualInputRequest = () => {
    if (!pendingManualRequest) {
      pendingManualRequest = createClientInputRequest();
      pendingManualRequest.promise.finally(() => { pendingManualRequest = undefined; }).catch(() => {});
    }
    return pendingManualRequest;
  };
  const cleanup = () => {
    for (const token of activeTokens) {
      const callbacks = loginCallbacks.get(token);
      if (callbacks) callbacks.reject(new Error("Login cancelled"));
      loginCallbacks.delete(token);
    }
    activeTokens.clear();
  };
  abort.signal.addEventListener("abort", cleanup);

  try {
    await authStorage.login(provider, {
      onAuth: (info) => {
        const request = getManualInputRequest();
        send({ type: "auth", url: info.url, instructions: info.instructions || null, token: request.token });
      },
      onDeviceCode: (info) => {
        send({
          type: "device_code",
          userCode: info.userCode,
          verificationUri: info.verificationUri,
          intervalSeconds: info.intervalSeconds || null,
          expiresInSeconds: info.expiresInSeconds || null,
        });
      },
      onPrompt: async (prompt) => {
        const request = getManualInputRequest();
        send({ type: "prompt_request", message: prompt.message, placeholder: prompt.placeholder || null, token: request.token });
        return request.promise;
      },
      onProgress: (message) => send({ type: "progress", message }),
      onSelect: async (prompt) => {
        const request = createClientInputRequest();
        send({ type: "select_request", message: prompt.message, options: prompt.options, token: request.token });
        return (await request.promise) || undefined;
      },
      onManualCodeInput: () => getManualInputRequest().promise,
      signal: abort.signal,
    });
    send({ type: "success" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    send(message === "Login cancelled" ? { type: "cancelled" } : { type: "error", message });
  } finally {
    cleanup();
    res.end();
  }
}

async function handleAuthLogin(req, res, provider) {
  if (req.method === "POST") return handleAuthLoginPost(req, res, provider);
  if (req.method === "GET") return handleAuthLoginGet(req, res, provider);
  return sendText(res, "Method not allowed", 405);
}

async function handleSkills(req, res, url) {
  if (req.method === "GET") {
    const cwd = url.searchParams.get("cwd");
    if (!cwd) return sendJson(res, { error: "cwd required" }, 400);
    const loader = new pi.DefaultResourceLoader({ cwd, agentDir: pi.getAgentDir() });
    await loader.reload();
    const { skills, diagnostics } = loader.getSkills();
    return sendJson(res, { skills, diagnostics });
  }
  if (req.method === "PATCH") {
    const body = await parseJsonBody(req);
    const { filePath, disableModelInvocation } = body;
    if (!filePath) return sendJson(res, { error: "filePath required" }, 400);
    if (!fs.existsSync(filePath)) return sendJson(res, { error: "file not found" }, 404);
    const content = fs.readFileSync(filePath, "utf8");
    const key = "disable-model-invocation";
    const { frontmatter } = pi.parseFrontmatter(content);
    const alreadySet = Boolean(frontmatter[key]);
    let updated = content;
    if (disableModelInvocation && !alreadySet) {
      updated = content.replace(/^---\r?\n/, `---\n${key}: true\n`);
      if (updated === content) updated = `---\n${key}: true\n---\n${content}`;
    } else if (!disableModelInvocation && alreadySet) {
      updated = content.replace(new RegExp(`^${key}\\s*:.*\\r?\\n`, "m"), "");
    }
    fs.writeFileSync(filePath, updated, "utf8");
    return sendJson(res, { success: true });
  }
  return sendText(res, "Method not allowed", 405);
}

function readInstalledCoreVersions() {
  const versions = {};
  for (const name of CORE_PACKAGES) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(getPackageDir(name), "package.json"), "utf8"));
      versions[name] = pkg.version || null;
    } catch {
      versions[name] = null;
    }
  }
  return versions;
}

function getRuntimeStatus() {
  return {
    runtimeDir: RUNTIME_DIR,
    versions: readInstalledCoreVersions(),
    ...getRpcRuntimeState(),
  };
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  try {
    if (!isAuthorized(req)) return sendJson(res, { error: "Unauthorized" }, 401);
    if (url.pathname === "/health") return sendJson(res, { ok: true, pid: process.pid, runtimeDir: RUNTIME_DIR });
    if (url.pathname === "/runtime" || url.pathname === "/api/desktop/runtime") return sendJson(res, getRuntimeStatus());
    if (url.pathname === "/runtime/shutdown" && req.method === "POST") {
      sendJson(res, { ok: true });
      setTimeout(() => shutdown(0), 50);
      return;
    }

    const segments = getSegments(url);
    if (segments[0] !== "api") return sendJson(res, { error: "Not found" }, 404);

    if (segments[1] === "sessions" && segments.length === 2) return handleSessions(req, res);
    if (segments[1] === "sessions" && segments[3] === "context") return handleSessionContext(req, res, segments[2], url);
    if (segments[1] === "sessions" && segments[3] === "export") return handleSessionExport(req, res, segments[2]);
    if (segments[1] === "sessions" && segments.length === 3) return handleSession(req, res, segments[2], url);
    if (segments[1] === "agent" && segments[2] === "new") return handleAgentNew(req, res);
    if (segments[1] === "agent" && segments[3] === "events") return handleAgentEvents(req, res, segments[2]);
    if (segments[1] === "agent" && segments.length === 3) return handleAgent(req, res, segments[2], url);
    if (segments[1] === "models" && segments.length === 2) return handleModels(req, res);
    if (segments[1] === "models-config" && segments[2] === "test") return handleModelsConfigTest(req, res);
    if (segments[1] === "models-config" && segments.length === 2) return handleModelsConfig(req, res);
    if (segments[1] === "auth" && segments[2] === "providers") return handleAuthProviders(req, res);
    if (segments[1] === "auth" && segments[2] === "all-providers") return handleAuthAllProviders(req, res);
    if (segments[1] === "auth" && segments[2] === "api-key") return handleAuthApiKey(req, res, segments[3]);
    if (segments[1] === "auth" && segments[2] === "login") return handleAuthLogin(req, res, segments[3]);
    if (segments[1] === "auth" && segments[2] === "logout") return handleAuthLogout(req, res, segments[3]);
    if (segments[1] === "skills" && segments.length === 2) return handleSkills(req, res, url);

    return sendJson(res, { error: "Not found" }, 404);
  } catch (error) {
    const detail = error && error.stack ? error.stack : String(error);
    console.error("[core-service] request failed", detail);
    if (!res.headersSent) sendJson(res, { error: String(error) }, 500);
    else res.end();
  }
}

function shutdown(code) {
  for (const session of sessions.values()) session.destroy();
  sessions.clear();
  if (server) {
    server.close(() => process.exit(code));
    setTimeout(() => process.exit(code), 1000).unref();
  } else {
    process.exit(code);
  }
}

async function main() {
  await loadCore();
  server = http.createServer((req, res) => {
    handleRequest(req, res);
  });
  server.listen(PORT, HOST, () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : PORT;
    console.log(JSON.stringify({ type: "ready", port, pid: process.pid }));
  });
}

process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));
process.once("uncaughtException", (error) => {
  console.error("[core-service] uncaught exception", error && error.stack ? error.stack : error);
  shutdown(1);
});
process.once("unhandledRejection", (error) => {
  console.error("[core-service] unhandled rejection", error && error.stack ? error.stack : error);
  shutdown(1);
});

main().catch((error) => {
  console.error("[core-service] failed to start", error && error.stack ? error.stack : error);
  process.exit(1);
});
