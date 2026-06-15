"use client";

import { useState, useCallback, useRef, useEffect, type CSSProperties, type FocusEvent, type MouseEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SessionSidebar } from "./SessionSidebar";
import { ChatWindow, type CurrentModelInfo } from "./ChatWindow";
import { FileViewer } from "./FileViewer";
import { TabBar, type Tab } from "./TabBar";
import { ModelsConfig } from "./ModelsConfig";
import { SkillsConfig } from "./SkillsConfig";
import { SettingsConfig } from "./SettingsConfig";
import { BranchNavigator } from "./BranchNavigator";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/hooks/useI18n";
import type { SessionInfo, SessionTreeNode } from "@/lib/types";
import type { ChatInputHandle } from "./ChatInput";

type ElectronDragStyle = CSSProperties & {
  WebkitAppRegion?: "drag" | "no-drag";
};

type TopBarTooltip = {
  text: string;
  x: number;
  y: number;
};

function PiCoreStartupOverlay({ state }: { state: PiCoreSetupState | null }) {
  const { t } = useI18n();
  const phase = state?.phase ?? "starting";
  const isError = phase === "error";
  const detailLines = (state?.detail ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-8);

  const retry = () => {
    void window.piDesktop?.retryCoreSetup();
  };
  const openLog = () => {
    void window.piDesktop?.openLogFile();
  };
  const quit = () => {
    void window.piDesktop?.quit();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 900,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(5, 9, 18, 0.38)",
        backdropFilter: "blur(8px)",
        color: "var(--text)",
      }}
    >
      <div
        style={{
          width: "min(560px, calc(100vw - 36px))",
          border: "1px solid var(--border)",
          borderRadius: 10,
          background: "var(--bg-panel)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.34)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "22px 24px 18px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: isError ? "rgba(239,68,68,0.14)" : "rgba(37,99,235,0.14)",
                color: isError ? "#ef4444" : "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {isError ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v4" />
                  <path d="M12 18v4" />
                  <path d="m4.93 4.93 2.83 2.83" />
                  <path d="m16.24 16.24 2.83 2.83" />
                  <path d="M2 12h4" />
                  <path d="M18 12h4" />
                  <path d="m4.93 19.07 2.83-2.83" />
                  <path d="m16.24 7.76 2.83-2.83" />
                </svg>
              )}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{isError ? t("startup.coreFailed") : t("startup.preparingCore")}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
                {state?.message ?? t("startup.starting")}
              </div>
            </div>
          </div>

          {!isError && (
            <div style={{ height: 4, borderRadius: 999, overflow: "hidden", background: "var(--border)", marginTop: 16 }}>
              <div style={{ width: "42%", height: "100%", borderRadius: 999, background: "var(--accent)", animation: "core-startup-progress 1.25s ease-in-out infinite" }} />
            </div>
          )}
        </div>

        <div style={{ padding: 16 }}>
          {state?.runtimeDir && (
            <div style={{ marginBottom: 12, color: "var(--text-dim)", fontSize: 11, fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={state.runtimeDir}>
              {state.runtimeDir}
            </div>
          )}
          {detailLines.length > 0 && (
            <pre
              style={{
                maxHeight: 136,
                overflow: "auto",
                margin: 0,
                padding: 12,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: isError ? "#ef4444" : "var(--text-muted)",
                fontSize: 11,
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
              }}
            >
              {detailLines.join("\n")}
            </pre>
          )}
          {isError && (
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button onClick={openLog} style={{ height: 30, padding: "0 11px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12, cursor: "pointer" }}>{t("core.openLog")}</button>
              <button onClick={quit} style={{ height: 30, padding: "0 11px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12, cursor: "pointer" }}>{t("common.quit")}</button>
              <button onClick={retry} style={{ height: 30, padding: "0 12px", borderRadius: 6, border: "1px solid var(--accent)", background: "var(--accent)", color: "white", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>{t("common.retry")}</button>
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes core-startup-progress {
          0% { transform: translateX(-115%); }
          55% { transform: translateX(85%); }
          100% { transform: translateX(260%); }
        }
      `}</style>
    </div>
  );
}

export function AppShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mode: themeMode, resolvedTheme } = useTheme();
  const { t } = useI18n();
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);
  // When user clicks +, we only store the cwd — no fake session id
  const [newSessionCwd, setNewSessionCwd] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sessionKey, setSessionKey] = useState(0);
  const [explorerRefreshKey, setExplorerRefreshKey] = useState(0);
  const [modelsConfigOpen, setModelsConfigOpen] = useState(false);
  const [modelsRefreshKey, setModelsRefreshKey] = useState(0);
  const [skillsConfigOpen, setSkillsConfigOpen] = useState(false);
  const [settingsConfigOpen, setSettingsConfigOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [coreSetupState, setCoreSetupState] = useState<PiCoreSetupState | null>(null);
  const [desktopRuntimeChecked, setDesktopRuntimeChecked] = useState(false);
  const [hasDesktopSetupApi, setHasDesktopSetupApi] = useState(false);
  const [desktopPlatform, setDesktopPlatform] = useState<DesktopPlatform | null>(null);
  const chatInputRef = useRef<ChatInputHandle | null>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const coreReady = desktopRuntimeChecked && (!hasDesktopSetupApi || coreSetupState?.phase === "ready");

  // Branch navigator state — populated by ChatWindow via onBranchDataChange
  const [branchTree, setBranchTree] = useState<SessionTreeNode[]>([]);
  const [branchActiveLeafId, setBranchActiveLeafId] = useState<string | null>(null);
  const branchLeafChangeFnRef = useRef<((leafId: string | null) => void) | null>(null);

  const handleBranchDataChange = useCallback((tree: SessionTreeNode[], activeLeafId: string | null, onLeafChange: (leafId: string | null) => void) => {
    setBranchTree(tree);
    setBranchActiveLeafId(activeLeafId);
    branchLeafChangeFnRef.current = onLeafChange;
  }, []);

  const handleBranchLeafChange = useCallback((leafId: string | null) => {
    branchLeafChangeFnRef.current?.(leafId);
  }, []);

  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [systemPromptLoading, setSystemPromptLoading] = useState(false);
  const [systemPromptError, setSystemPromptError] = useState<string | null>(null);
  const systemBtnRef = useRef<HTMLButtonElement>(null);
  const ensuredStateSessionRef = useRef<string | null>(null);

  const handleSystemPromptChange = useCallback((prompt: string | null) => {
    setSystemPrompt(prompt);
  }, []);

  // Session stats (tokens + cost) — populated by ChatWindow, displayed in top bar
  const [sessionStats, setSessionStats] = useState<{ tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }; cost?: number } | null>(null);
  const handleSessionStatsChange = useCallback((stats: { tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }; cost?: number } | null) => {
    setSessionStats(stats);
  }, []);

  // Context usage — populated by ChatWindow, displayed in top bar
  const [contextUsage, setContextUsage] = useState<{ percent: number | null; contextWindow: number; tokens: number | null } | null>(null);
  const handleContextUsageChange = useCallback((usage: { percent: number | null; contextWindow: number; tokens: number | null } | null) => {
    setContextUsage(usage);
  }, []);

  const [currentModelInfo, setCurrentModelInfo] = useState<CurrentModelInfo | null>(null);
  const handleModelInfoChange = useCallback((model: CurrentModelInfo | null) => {
    setCurrentModelInfo(model);
  }, []);

  // Single active panel — only one dropdown open at a time
  const [activeTopPanel, setActiveTopPanel] = useState<"branches" | "system" | null>(null);
  const [topPanelPos, setTopPanelPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [topBarTooltip, setTopBarTooltip] = useState<TopBarTooltip | null>(null);

  const showTopBarTooltip = useCallback((text: string, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const x = Math.min(window.innerWidth - 18, Math.max(18, rect.left + rect.width / 2));
    setTopBarTooltip({ text, x, y: rect.bottom + 8 });
  }, []);

  const hideTopBarTooltip = useCallback(() => {
    setTopBarTooltip(null);
  }, []);

  const topBarTooltipProps = useCallback((text: string) => ({
    onMouseEnter: (event: MouseEvent<HTMLElement>) => showTopBarTooltip(text, event.currentTarget),
    onMouseLeave: hideTopBarTooltip,
    onFocus: (event: FocusEvent<HTMLElement>) => showTopBarTooltip(text, event.currentTarget),
    onBlur: hideTopBarTooltip,
  }), [showTopBarTooltip, hideTopBarTooltip]);

  useEffect(() => {
    const unsubscribe = window.piDesktop?.onOpenSettings?.(() => setSettingsConfigOpen(true));
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    setDesktopPlatform(window.piDesktop?.platform ?? null);
  }, []);

  useEffect(() => {
    void window.piDesktop?.setTheme?.(themeMode, resolvedTheme);
  }, [themeMode, resolvedTheme]);

  useEffect(() => {
    const desktop = window.piDesktop;
    if (!desktop?.getCoreSetupState) {
      setHasDesktopSetupApi(false);
      setDesktopRuntimeChecked(true);
      return;
    }
    setHasDesktopSetupApi(true);

    let cancelled = false;
    desktop.getCoreSetupState()
      .then((state) => {
        if (!cancelled) {
          setCoreSetupState(state);
          setDesktopRuntimeChecked(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCoreSetupState({
            phase: "ready",
            message: t("startup.runtimeUnavailable"),
            detail: "",
            runtimeDir: null,
            packages: [],
          });
          setDesktopRuntimeChecked(true);
        }
      });
    const unsubscribe = desktop.onCoreSetupState?.((state) => setCoreSetupState(state));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [t]);

  const fetchEnsuredAgentState = useCallback(async () => {
    if (!selectedSession) return null;
    const res = await fetch(`/api/agent/${encodeURIComponent(selectedSession.id)}?ensureState=1`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as {
      running?: boolean;
      state?: {
        contextUsage?: { percent: number | null; contextWindow: number; tokens: number | null } | null;
        systemPrompt?: string;
      };
    };
    return data.state ?? null;
  }, [selectedSession]);

  const ensureSystemPrompt = useCallback(async () => {
    if (!selectedSession || systemPrompt !== null || systemPromptLoading) return;
    setSystemPromptError(null);
    setSystemPromptLoading(true);
    try {
      const state = await fetchEnsuredAgentState();
      if (state?.contextUsage !== undefined) setContextUsage(state.contextUsage ?? null);
      if (state?.systemPrompt !== undefined) {
        setSystemPrompt(state.systemPrompt);
      } else {
        setSystemPromptError(t("app.systemPromptUnavailable"));
      }
    } catch (error) {
      setSystemPromptError(String(error));
    } finally {
      setSystemPromptLoading(false);
    }
  }, [fetchEnsuredAgentState, selectedSession, systemPrompt, systemPromptLoading, t]);

  useEffect(() => {
    if (!coreReady || !selectedSession || ensuredStateSessionRef.current === selectedSession.id) return;
    ensuredStateSessionRef.current = selectedSession.id;
    let cancelled = false;
    fetchEnsuredAgentState()
      .then((state) => {
        if (cancelled || !state) return;
        if (state.contextUsage !== undefined) setContextUsage(state.contextUsage ?? null);
        if (state.systemPrompt !== undefined) setSystemPrompt(state.systemPrompt);
      })
      .catch(() => {
        if (!cancelled) ensuredStateSessionRef.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, [coreReady, fetchEnsuredAgentState, selectedSession]);

  const toggleTopPanel = useCallback((panel: "branches" | "system") => {
    setActiveTopPanel((cur) => {
      const next = cur === panel ? null : panel;
      if (next === "system") void ensureSystemPrompt();
      return next;
    });
  }, [ensureSystemPrompt]);

  useEffect(() => {
    if (!activeTopPanel || !topBarRef.current) return;
    const update = () => {
      const rect = topBarRef.current!.getBoundingClientRect();
      setTopPanelPos({ top: rect.bottom, left: rect.left, width: rect.width });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(topBarRef.current);
    return () => ro.disconnect();
  }, [activeTopPanel]);

  // Right panel — file tabs only
  const [fileTabs, setFileTabs] = useState<Tab[]>([]);
  const [activeFileTabId, setActiveFileTabId] = useState<string | null>(null);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);

  const handleAtMention = useCallback((relativePath: string) => {
    chatInputRef.current?.insertText("`" + relativePath + "`");
  }, []);

  const [initialSessionId] = useState<string | null>(() => searchParams.get("session"));
  const [activeCwd, setActiveCwd] = useState<string | null>(null);
  // True once the initial ?session= URL param has been resolved (or confirmed absent)
  const [initialSessionRestored, setInitialSessionRestored] = useState<boolean>(() => !searchParams.get("session"));
  // Suppresses sessionKey bump in handleCwdChange during the initial URL restore
  const suppressCwdBumpRef = useRef(false);

  const handleCwdChange = useCallback((cwd: string | null) => {
    setActiveCwd(cwd);
    // Skip if cwd is null (initial mount) or during the initial URL restore.
    if (!cwd || suppressCwdBumpRef.current) return;
    // Close any session that belongs to a different cwd — it no longer
    // matches the selected project directory.
    setSelectedSession((prev) => {
      if (prev && prev.cwd !== cwd) return null;
      return prev;
    });
    setNewSessionCwd((prev) => {
      if (prev && prev !== cwd) return null;
      return prev;
    });
    setSessionKey((k) => k + 1);
    setBranchTree([]);
    setBranchActiveLeafId(null);
    setSystemPrompt(null);
    setSystemPromptError(null);
    setSystemPromptLoading(false);
    ensuredStateSessionRef.current = null;
    setSessionStats(null);
    setContextUsage(null);
    setCurrentModelInfo(null);
    setActiveTopPanel(null);
    router.replace("/", { scroll: false });
  }, [router]);

  const handleSelectSession = useCallback((session: SessionInfo, isRestore = false) => {
    setNewSessionCwd(null);
    setSelectedSession(session);
    setSessionKey((k) => k + 1);
    setSystemPrompt(null);
    setSystemPromptError(null);
    setSystemPromptLoading(false);
    ensuredStateSessionRef.current = null;
    setSessionStats(null);
    setContextUsage(null);
    setCurrentModelInfo(null);
    setInitialSessionRestored(true);
    if (isRestore) {
      // Suppress the redundant sessionKey bump that would come from the
      // onCwdChange effect firing after setSelectedCwd in the sidebar
      suppressCwdBumpRef.current = true;
      setTimeout(() => { suppressCwdBumpRef.current = false; }, 0);
    }
    // Skip router.replace when restoring from URL — the param is already correct
    // and calling replace in production Next.js triggers a Suspense remount loop
    if (!isRestore) {
      router.replace(`?session=${encodeURIComponent(session.id)}`, { scroll: false });
    }
  }, [router]);

  const handleNewSession = useCallback((_sessionId: string, cwd: string) => {
    setSelectedSession(null);
    setNewSessionCwd(cwd);
    setSessionKey((k) => k + 1);
    setBranchTree([]);
    setBranchActiveLeafId(null);
    setSystemPrompt(null);
    setSystemPromptError(null);
    setSystemPromptLoading(false);
    ensuredStateSessionRef.current = null;
    setSessionStats(null);
    setContextUsage(null);
    setCurrentModelInfo(null);
    setActiveTopPanel(null);
    router.replace("/", { scroll: false });
  }, [router]);

  // Called by ChatWindow when a new session gets its real id from pi
  const handleSessionCreated = useCallback((session: SessionInfo) => {
    setNewSessionCwd(null);
    setSelectedSession(session);
    setSystemPrompt(null);
    setSystemPromptError(null);
    setSystemPromptLoading(false);
    ensuredStateSessionRef.current = null;
    setSessionStats(null);
    setContextUsage(null);
    setCurrentModelInfo(null);
    setRefreshKey((k) => k + 1);
    router.replace(`?session=${encodeURIComponent(session.id)}`, { scroll: false });
  }, [router]);

  const handleAgentEnd = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setExplorerRefreshKey((k) => k + 1);
  }, []);

  const handleSessionForked = useCallback((newSessionId: string) => {
    setRefreshKey((k) => k + 1);
    setSessionKey((k) => k + 1);
    setNewSessionCwd(null);
    setSystemPrompt(null);
    setSystemPromptError(null);
    setSystemPromptLoading(false);
    ensuredStateSessionRef.current = null;
    setSessionStats(null);
    setContextUsage(null);
    setCurrentModelInfo(null);
    setSelectedSession((prev) => ({
      ...(prev ?? { path: "", cwd: "", created: "", modified: "", messageCount: 0, firstMessage: "" }),
      id: newSessionId,
    }));
    router.replace(`?session=${encodeURIComponent(newSessionId)}`, { scroll: false });
  }, [router]);

  const handleInitialRestoreDone = useCallback(() => {
    setInitialSessionRestored(true);
  }, []);

  const handleSessionDeleted = useCallback((sessionId: string) => {
    setRefreshKey((k) => k + 1);
    if (selectedSession?.id === sessionId) {
      const cwd = selectedSession.cwd;
      setSelectedSession(null);
      setNewSessionCwd(cwd ?? null);
      setSessionKey((k) => k + 1);
      setBranchTree([]);
      setBranchActiveLeafId(null);
      setSystemPrompt(null);
      setSystemPromptError(null);
      setSystemPromptLoading(false);
      ensuredStateSessionRef.current = null;
      setSessionStats(null);
      setContextUsage(null);
      setCurrentModelInfo(null);
      setActiveTopPanel(null);
      router.replace("/", { scroll: false });
    }
  }, [selectedSession, router]);

  const handleOpenFile = useCallback((filePath: string, fileName: string) => {
    const tabId = `file:${filePath}`;
    setFileTabs((prev) => {
      if (prev.find((t) => t.id === tabId)) return prev;
      return [...prev, { id: tabId, label: fileName, filePath }];
    });
    setActiveFileTabId(tabId);
    setRightPanelOpen(true);
  }, []);

  const handleCloseFileTab = useCallback((tabId: string) => {
    setFileTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId);
      if (next.length === 0) setRightPanelOpen(false);
      return next;
    });
    setActiveFileTabId((cur) => {
      if (cur !== tabId) return cur;
      const remaining = fileTabs.filter((t) => t.id !== tabId);
      return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
    });
  }, [fileTabs]);

  const handleExportSession = useCallback(() => {
    if (!selectedSession) return;
    window.location.href = `/api/sessions/${encodeURIComponent(selectedSession.id)}/export`;
  }, [selectedSession]);

  // Show chat area if a session is selected, or if we have a cwd to start a new session in
  const effectiveNewSessionCwd = newSessionCwd ?? (selectedSession === null && activeCwd ? activeCwd : null);
  const showChat = selectedSession !== null || effectiveNewSessionCwd !== null;
  // While restoring initial session from URL, don't show the placeholder
  const showPlaceholder = initialSessionRestored && !showChat;

  const activeFileTab = fileTabs.find((t) => t.id === activeFileTabId) ?? null;

  const sidebarContent = (
    <>
      {coreReady ? (
        <SessionSidebar
          selectedSessionId={selectedSession?.id ?? null}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          initialSessionId={initialSessionId}
          onInitialRestoreDone={handleInitialRestoreDone}
          refreshKey={refreshKey}
          onSessionDeleted={handleSessionDeleted}
          selectedCwd={selectedSession?.cwd ?? newSessionCwd ?? null}
          onCwdChange={handleCwdChange}
          onOpenFile={handleOpenFile}
          explorerRefreshKey={explorerRefreshKey}
          onAtMention={handleAtMention}
        />
      ) : (
        <div style={{ flex: 1, minHeight: 0, padding: 14, color: "var(--text-muted)" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 18 }}>Pi App</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ height: 32, borderRadius: 7, background: "var(--bg-hover)", opacity: 0.7 }} />
            <div style={{ height: 32, borderRadius: 7, background: "var(--bg-hover)", opacity: 0.5 }} />
            <div style={{ height: 32, borderRadius: 7, background: "var(--bg-hover)", opacity: 0.35 }} />
          </div>
        </div>
      )}
      <div style={{ padding: "8px", flexShrink: 0, display: "flex", justifyContent: "space-between", gap: 4 }}>
        {([
          {
            label: t("common.models"),
            onClick: () => setModelsConfigOpen(true),
            disabled: !coreReady,
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" />
                <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
                <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
                <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
                <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
              </svg>
            ),
          },
          {
            label: t("common.skills"),
            onClick: () => setSkillsConfigOpen(true),
            disabled: !coreReady || (!activeCwd && !selectedSession?.cwd && !newSessionCwd),
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            ),
          },
          {
            label: t("common.settings"),
            onClick: () => setSettingsConfigOpen(true),
            disabled: !coreReady,
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.15.34.48.67 1.55 1H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15z" />
              </svg>
            ),
          },
        ] as { label: string; onClick: () => void; disabled: boolean; icon: React.ReactNode }[]).map(({ label, onClick, disabled, icon }) => (
          <button
            key={label}
            onClick={onClick}
            disabled={disabled}
            title={label}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              height: 32, padding: 0, background: "none", border: "none",
              borderRadius: 9, color: "var(--text-muted)", cursor: disabled ? "default" : "pointer",
              fontSize: 12, opacity: disabled ? 0.35 : 1,
              transition: "background 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; } }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
    </>
  );

  return (
    <>
    <div
      className={desktopPlatform ? `app-root desktop-chrome desktop-platform-${desktopPlatform}` : "app-root"}
      style={{ display: "flex", height: "100dvh", overflow: "hidden", background: "var(--bg)" }}
    >
      {/* Mobile overlay backdrop */}
      <div
        className="sidebar-overlay-backdrop"
        onClick={() => setSidebarOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 199,
          background: "rgba(0,0,0,0.4)",
          opacity: sidebarOpen ? 1 : 0,
          pointerEvents: sidebarOpen ? "auto" : "none",
          transition: "opacity 0.25s ease",
        }}
      />

      {/* Left sidebar */}
      <div
        className={`sidebar-container${sidebarOpen ? " sidebar-open" : " sidebar-closed"}`}
        style={{
          background: "var(--bg-panel)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          zIndex: 200,
        }}
      >
        {sidebarContent}
      </div>

      {/* Center: chat */}
      <div className="app-main" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Top bar with sidebar toggle */}
        <div ref={topBarRef} className="app-titlebar" style={{ display: "flex", alignItems: "center", flexShrink: 0, borderBottom: "1px solid var(--border)", height: 36, background: "var(--bg-panel)" }}>
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? t("app.hideSidebar") : t("app.showSidebar")}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 36, height: 36, padding: 0,
              background: "none", border: "none", borderRight: "1px solid var(--border)",
              color: "var(--text-muted)", cursor: "pointer", flexShrink: 0, transition: "color 0.12s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            {sidebarOpen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
          {coreReady && showChat && (
            <div style={{ display: "flex", alignItems: "stretch", height: "100%" }}>
              <button
                onClick={handleExportSession}
                aria-disabled={!selectedSession}
                title={selectedSession ? t("app.exportHtml") : t("app.exportUnavailable")}
                aria-label={t("app.exportHtml")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  height: "100%",
                  padding: "0 12px",
                  background: "none",
                  border: "none",
                  borderTop: "2px solid transparent",
                  borderRight: "1px solid var(--border)",
                  color: selectedSession ? "var(--text-muted)" : "var(--text-dim)",
                  cursor: selectedSession ? "pointer" : "not-allowed",
                  opacity: selectedSession ? 1 : 0.45,
                  flexShrink: 0,
                  fontSize: 11,
                  whiteSpace: "nowrap",
                  transition: "color 0.1s, background 0.1s, opacity 0.1s",
                }}
                onMouseEnter={(e) => {
                  showTopBarTooltip(selectedSession ? t("app.exportHtml") : t("app.exportUnavailable"), e.currentTarget);
                  if (!selectedSession) return;
                  e.currentTarget.style.color = "var(--text)";
                  e.currentTarget.style.background = "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  hideTopBarTooltip();
                  e.currentTarget.style.color = selectedSession ? "var(--text-muted)" : "var(--text-dim)";
                  e.currentTarget.style.background = "none";
                }}
                onFocus={(e) => showTopBarTooltip(selectedSession ? t("app.exportHtml") : t("app.exportUnavailable"), e.currentTarget)}
                onBlur={hideTopBarTooltip}
              >
                <span style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 18,
                  height: 18,
                  borderRadius: 5,
                  background: "transparent",
                  color: selectedSession ? "var(--text-muted)" : "var(--text-dim)",
                  flexShrink: 0,
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </span>
                <span>{t("app.export")}</span>
              </button>
              <BranchNavigator
                tree={branchTree}
                activeLeafId={branchActiveLeafId}
                onLeafChange={handleBranchLeafChange}
                inline
                containerRef={topBarRef}
                open={activeTopPanel === "branches"}
                onToggle={() => toggleTopPanel("branches")}
                hasSession
              />
              <button
                ref={systemBtnRef}
                onClick={() => toggleTopPanel("system")}
                title={t("app.systemPromptTooltip")}
                aria-label={t("app.systemPromptTooltip")}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  height: "100%", padding: "0 12px",
                  background: activeTopPanel === "system" ? "var(--bg-selected)" : "none",
                  border: "none",
                  borderTop: activeTopPanel === "system" ? "2px solid var(--accent)" : "2px solid transparent",
                  borderRight: "1px solid var(--border)",
                  cursor: "pointer",
                  color: activeTopPanel === "system" ? "var(--text)" : "var(--text-muted)",
                  fontSize: 11, whiteSpace: "nowrap", transition: "color 0.1s, background 0.1s",
                }}
                onMouseEnter={(e) => { showTopBarTooltip(t("app.systemPromptTooltip"), e.currentTarget); e.currentTarget.style.color = "var(--text)"; }}
                onMouseLeave={(e) => { hideTopBarTooltip(); e.currentTarget.style.color = activeTopPanel === "system" ? "var(--text)" : "var(--text-muted)"; }}
                onFocus={(e) => showTopBarTooltip(t("app.systemPromptTooltip"), e.currentTarget)}
                onBlur={hideTopBarTooltip}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: systemPrompt ? "var(--accent)" : "var(--text-dim)", flexShrink: 0 }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="8" y1="13" x2="16" y2="13" />
                  <line x1="8" y1="17" x2="13" y2="17" />
                </svg>
                <span>{t("app.system")}</span>
              </button>
            </div>
          )}
          {/* Session stats — right-aligned in top bar */}
          {coreReady && showChat && (() => {
            const tokens = sessionStats?.tokens;
            const c = sessionStats?.cost ?? 0;
            const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
            const costStr = c > 0 ? (c >= 0.01 ? `$${c.toFixed(2)}` : `<$0.01`) : null;
            const metricColor = (available: boolean) => available ? "var(--text-muted)" : "var(--text-dim)";
            const metricText = (value: number | undefined) => value && value > 0 ? fmt(value) : "--";

            let ctxColor = "var(--text-muted)";
            let ctxStr = "-- / --";
            const fallbackContextWindow = currentModelInfo?.contextWindow;
            const contextWindow = contextUsage?.contextWindow ?? fallbackContextWindow;
            if (contextUsage?.contextWindow) {
              const pct = contextUsage.percent;
              if (typeof pct === "number" && pct > 90) ctxColor = "#ef4444";
              else if (typeof pct === "number" && pct > 70) ctxColor = "rgba(234,179,8,0.95)";
              ctxStr = typeof pct === "number" ? `${pct.toFixed(0)}% / ${fmt(contextUsage.contextWindow)}` : `? / ${fmt(contextUsage.contextWindow)}`;
            } else if (fallbackContextWindow) {
              ctxColor = "var(--text-dim)";
              ctxStr = selectedSession ? `-- / ${fmt(fallbackContextWindow)}` : `0% / ${fmt(fallbackContextWindow)}`;
            } else {
              ctxColor = "var(--text-dim)";
            }

            const contextTitle = contextUsage?.contextWindow
              ? t("app.stats.contextTooltip", {
                  percent: typeof contextUsage.percent === "number" ? `${contextUsage.percent.toFixed(1)}%` : t("app.stats.unknown"),
                  used: typeof contextUsage.tokens === "number" ? contextUsage.tokens.toLocaleString() : t("app.stats.unknown"),
                  window: contextUsage.contextWindow.toLocaleString(),
                })
              : contextWindow
                ? selectedSession
                  ? t("app.stats.contextPendingTooltip", { window: contextWindow.toLocaleString() })
                  : t("app.stats.contextTooltip", { percent: "0.0%", used: "0", window: contextWindow.toLocaleString() })
                : t("app.stats.contextMissingTooltip");

            return (
              <div
                className="no-window-drag"
                style={{
                  marginLeft: "auto",
                  display: "flex", alignItems: "center", gap: 10,
                  paddingLeft: 12,
                  paddingRight: rightPanelOpen ? 12 : 48,
                  height: "100%",
                  fontSize: 11, color: "var(--text-muted)",
                  whiteSpace: "nowrap", cursor: "default",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <span {...topBarTooltipProps(tokens ? t("app.stats.inputTooltip", { count: tokens.input.toLocaleString() }) : t("app.stats.inputPendingTooltip"))} style={{ display: "flex", alignItems: "center", gap: 4, color: metricColor(Boolean(tokens)) }}>
                    <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="8.5" x2="5" y2="1.5" /><polyline points="2 4 5 1.5 8 4" />
                    </svg>
                    {metricText(tokens?.input)}
                  </span>
                <span {...topBarTooltipProps(tokens ? t("app.stats.outputTooltip", { count: tokens.output.toLocaleString() }) : t("app.stats.outputPendingTooltip"))} style={{ display: "flex", alignItems: "center", gap: 4, color: metricColor(Boolean(tokens)) }}>
                    <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="1.5" x2="5" y2="8.5" /><polyline points="2 6 5 8.5 8 6" />
                    </svg>
                    {metricText(tokens?.output)}
                  </span>
                <span {...topBarTooltipProps(tokens ? t("app.stats.cacheReadTooltip", { count: tokens.cacheRead.toLocaleString() }) : t("app.stats.cacheReadPendingTooltip"))} style={{ display: "flex", alignItems: "center", gap: 4, color: metricColor(Boolean(tokens)) }}>
                    <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8.5 5a3.5 3.5 0 1 1-1-2.45" /><polyline points="6.5 1.5 8.5 2.5 7.5 4.5" />
                    </svg>
                    {metricText(tokens?.cacheRead)}
                  </span>
                <span {...topBarTooltipProps(c > 0 ? t("app.stats.costTooltip", { cost: `$${c.toFixed(4)}` }) : t("app.stats.costPendingTooltip"))} style={{ display: "flex", alignItems: "center", color: costStr ? "var(--text)" : "var(--text-dim)", fontWeight: 500 }}>
                    {costStr ?? "$--"}
                  </span>
                <span {...topBarTooltipProps(contextTitle)} style={{ display: "flex", alignItems: "center", gap: 4, color: ctxColor }}>
                    <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 9 L1 5 Q1 1 5 1 Q9 1 9 5 L9 9" /><line x1="1" y1="9" x2="9" y2="9" />
                    </svg>
                    {ctxStr}
                  </span>
              </div>
            );
          })()}
          {/* Top panel dropdown — shared, only one active at a time */}
          {activeTopPanel && topPanelPos && (
            <div className="no-window-drag" style={{
              position: "fixed",
              top: topPanelPos.top,
              left: topPanelPos.left,
              width: topPanelPos.width,
              zIndex: 500,
            }}>
              {activeTopPanel === "system" && (
                <div style={{
                  background: "var(--bg-panel)",
                  borderBottom: "1px solid var(--border)",
                }}>
                  {systemPromptLoading ? (
                    <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                      {t("app.systemPromptLoading")}
                    </div>
                  ) : systemPromptError ? (
                    <div style={{ padding: "10px 16px", fontSize: 12, color: "#ef4444", fontStyle: "italic" }}>
                      {t("app.systemPromptError", { error: systemPromptError })}
                    </div>
                  ) : systemPrompt ? (
                    <div style={{
                      maxHeight: "min(600px, 75vh)",
                      overflowY: "auto",
                      padding: "12px 16px",
                      color: "var(--text-muted)",
                      fontSize: 12,
                      lineHeight: 1.6,
                      whiteSpace: "pre-wrap",
                      fontFamily: "var(--font-mono)",
                    }}>
                      {systemPrompt}
                    </div>
                  ) : systemPrompt === "" ? (
                    <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                      {t("app.systemPromptEmpty")}
                    </div>
                  ) : (
                    <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                      {selectedSession ? t("app.systemPromptLoad") : t("app.systemPromptNoSession")}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Chat content */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          {!coreReady ? (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>
              {t("startup.opening")}
            </div>
          ) : showChat ? (
            <ChatWindow
              key={sessionKey}
              session={selectedSession}
              newSessionCwd={effectiveNewSessionCwd}
              onAgentEnd={handleAgentEnd}
              onSessionCreated={handleSessionCreated}
              onSessionForked={handleSessionForked}
              modelsRefreshKey={modelsRefreshKey}
              chatInputRef={chatInputRef}
              onBranchDataChange={handleBranchDataChange}
              onSystemPromptChange={handleSystemPromptChange}
              onSessionStatsChange={handleSessionStatsChange}
              onContextUsageChange={handleContextUsageChange}
              onModelInfoChange={handleModelInfoChange}
            />
          ) : showPlaceholder ? (
            activeCwd ? (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 15 }}>
                {t("app.selectSession")}
              </div>
            ) : (
              <div style={{ position: "absolute", top: 12, left: 12, display: "flex", alignItems: "flex-start", gap: 8, userSelect: "none", pointerEvents: "none" }}>
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7, flexShrink: 0 }}>
                  <line x1="20" y1="12" x2="4" y2="12" /><polyline points="10 6 4 12 10 18" />
                </svg>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>{t("app.getStarted")}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
                    <span style={{ color: "var(--text-dim)", marginRight: 6 }}>1.</span>{t("app.getStartedStep1")}<br />
                    <span style={{ color: "var(--text-dim)", marginRight: 6 }}>2.</span>{t("app.getStartedStep2Prefix")} <strong style={{ color: "var(--text)" }}>{t("common.models")}</strong> {t("app.getStartedStep2Suffix")}
                  </div>
                </div>
              </div>
            )
          ) : null}
        </div>
      </div>

      {/* Right panel: file viewer — always mounted, width animated via CSS */}
      <div
        className={`right-panel-container${rightPanelOpen ? " right-panel-open" : " right-panel-closed"}`}
        style={{
          display: "flex",
          flexDirection: "column",
          borderLeft: "1px solid var(--border)",
          background: "var(--bg)",
        }}
      >
        {/* Right panel tab bar */}
        <div className="right-panel-titlebar no-window-drag" style={{ display: "flex", alignItems: "center", flexShrink: 0, background: "var(--bg-panel)", borderBottom: "1px solid var(--border)", height: 36 }}>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <TabBar
              tabs={fileTabs}
              activeTabId={activeFileTabId ?? ""}
              onSelectTab={setActiveFileTabId}
              onCloseTab={handleCloseFileTab}
            />
          </div>

        </div>

        {/* File content */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {coreReady && activeFileTab?.filePath ? (
            <FileViewer filePath={activeFileTab.filePath} cwd={activeCwd ?? undefined} />
          ) : (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontSize: 12 }}>
              {coreReady ? t("app.noFileOpen") : t("app.coreStarting")}
            </div>
          )}
        </div>
      </div>
    </div>
    {/* File panel toggle — always visible at top-right */}
    <button
      className="file-panel-toggle no-window-drag"
      onClick={() => setRightPanelOpen((v) => !v)}
      aria-label={rightPanelOpen ? t("app.hideFilePanel") : t("app.showFilePanel")}
      style={{
        position: "fixed", top: 0, right: 0, zIndex: 300,
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 36, height: 36, padding: 0,
        background: "var(--bg-panel)", border: "none", borderLeft: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
        color: rightPanelOpen ? "var(--text)" : "var(--text-muted)",
        cursor: "pointer", transition: "color 0.12s",
        WebkitAppRegion: "no-drag",
      } as ElectronDragStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--text)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = rightPanelOpen ? "var(--text)" : "var(--text-muted)";
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="15" y1="3" x2="15" y2="21" />
      </svg>
    </button>
    {topBarTooltip && (
      <div
        role="tooltip"
        style={{
          position: "fixed",
          left: topBarTooltip.x,
          top: topBarTooltip.y,
          transform: "translateX(-50%)",
          zIndex: 1200,
          maxWidth: 320,
          padding: "6px 8px",
          borderRadius: 6,
          border: "1px solid var(--border)",
          background: "var(--bg-panel)",
          color: "var(--text)",
          boxShadow: "0 10px 28px rgba(0,0,0,0.24)",
          fontSize: 11,
          lineHeight: 1.45,
          pointerEvents: "none",
          whiteSpace: "normal",
        }}
      >
        {topBarTooltip.text}
      </div>
    )}
    {coreReady && modelsConfigOpen && <ModelsConfig onClose={() => { setModelsConfigOpen(false); setModelsRefreshKey((k) => k + 1); }} />}
    {coreReady && skillsConfigOpen && (activeCwd ?? selectedSession?.cwd ?? newSessionCwd) && (
      <SkillsConfig cwd={(activeCwd ?? selectedSession?.cwd ?? newSessionCwd)!} onClose={() => setSkillsConfigOpen(false)} />
    )}
    {coreReady && settingsConfigOpen && <SettingsConfig onClose={() => setSettingsConfigOpen(false)} />}
    {!coreReady && <PiCoreStartupOverlay state={coreSetupState} />}
    </>
  );
}
