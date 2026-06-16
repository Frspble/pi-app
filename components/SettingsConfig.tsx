"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useTheme, type ThemeMode } from "@/hooks/useTheme";
import { useI18n, type LanguageMode } from "@/hooks/useI18n";

type LoadState = "idle" | "loading" | "checking" | "updating" | "ready" | "unavailable" | "error";
type AppUpdateState = "idle" | "checking" | "ready" | "unavailable" | "error";
type SettingsSection = "appearance" | "language" | "core" | "about";

const PROJECT_URL = "https://github.com/Frspble/pi-app";
const RELEASES_URL = `${PROJECT_URL}/releases`;
const ISSUES_URL = `${PROJECT_URL}/issues`;

const THEME_OPTIONS: { mode: ThemeMode; labelKey: "settings.theme.system" | "settings.theme.light" | "settings.theme.dark"; descriptionKey: "settings.theme.option.system.description" | "settings.theme.option.light.description" | "settings.theme.option.dark.description" }[] = [
  { mode: "system", labelKey: "settings.theme.system", descriptionKey: "settings.theme.option.system.description" },
  { mode: "light", labelKey: "settings.theme.light", descriptionKey: "settings.theme.option.light.description" },
  { mode: "dark", labelKey: "settings.theme.dark", descriptionKey: "settings.theme.option.dark.description" },
];

const LANGUAGE_OPTIONS: { mode: LanguageMode; labelKey: "language.system" | "language.english" | "language.chinese"; descriptionKey: "language.option.system.description" | "language.option.en.description" | "language.option.zh.description" }[] = [
  { mode: "system", labelKey: "language.system", descriptionKey: "language.option.system.description" },
  { mode: "en", labelKey: "language.english", descriptionKey: "language.option.en.description" },
  { mode: "zh", labelKey: "language.chinese", descriptionKey: "language.option.zh.description" },
];

function statusLabel(status: PiCorePackageInfo["status"], t: ReturnType<typeof useI18n>["t"]) {
  switch (status) {
    case "missing":
      return t("core.status.missing");
    case "up-to-date":
      return t("core.status.upToDate");
    case "update-available":
      return t("core.status.updateAvailable");
    default:
      return t("core.status.unknown");
  }
}

function statusColor(status: PiCorePackageInfo["status"]) {
  switch (status) {
    case "missing":
      return "#ef4444";
    case "up-to-date":
      return "#22a06b";
    case "update-available":
      return "#d97706";
    default:
      return "var(--text-dim)";
  }
}

function actionButtonStyle(disabled = false, primary = false): CSSProperties {
  return {
    height: 30,
    padding: "0 11px",
    border: primary ? "1px solid var(--accent)" : "1px solid var(--border)",
    borderRadius: 6,
    background: primary ? "var(--accent)" : "var(--bg)",
    color: primary ? "white" : "var(--text)",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1,
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: "nowrap",
  };
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "120px minmax(0, 1fr)", gap: 12, alignItems: "center" }}>
      <div style={{ color: "var(--text-dim)", fontSize: 11 }}>{label}</div>
      <div style={{ color: "var(--text-muted)", fontSize: 12, fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={value}>
        {value}
      </div>
    </div>
  );
}

function SectionButton({
  active,
  label,
  children,
  onClick,
}: {
  active: boolean;
  label: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        height: 34,
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "0 10px",
        border: active ? "1px solid var(--border)" : "1px solid transparent",
        borderRadius: 7,
        background: active ? "var(--bg-selected)" : "none",
        color: active ? "var(--text)" : "var(--text-muted)",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        textAlign: "left",
      }}
    >
      {children}
      {label}
    </button>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", lineHeight: 1.2 }}>
      {title}
    </div>
  );
}

function AppearanceIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M4.93 19.07l1.41-1.41" />
      <path d="M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function CoreIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

function LanguageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h10" />
      <path d="M9 3v2" />
      <path d="M12 5c-.6 3.5-3 6.5-7 8" />
      <path d="M5 9c1.2 2 3.2 3.6 6 4.8" />
      <path d="M16 19l3-7 3 7" />
      <path d="M17 17h4" />
    </svg>
  );
}

function AboutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

export function SettingsConfig({ onClose }: { onClose: () => void }) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<SettingsSection, HTMLElement | null>>({
    appearance: null,
    language: null,
    core: null,
    about: null,
  });
  const [state, setState] = useState<LoadState>("idle");
  const [coreStatus, setCoreStatus] = useState<PiCoreStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [appUpdateState, setAppUpdateState] = useState<AppUpdateState>("idle");
  const [appUpdateStatus, setAppUpdateStatus] = useState<PiAppUpdateStatus | null>(null);
  const [appUpdateMessage, setAppUpdateMessage] = useState<string | null>(null);
  const { mode, resolvedTheme, setMode } = useTheme();
  const { mode: languageMode, resolvedLanguage, setMode: setLanguageMode, t } = useI18n();

  const desktop = typeof window !== "undefined" ? window.piDesktop : undefined;
  const hasUpdate = useMemo(
    () => coreStatus?.packages.some((pkg) => pkg.status === "missing" || pkg.status === "update-available") ?? false,
    [coreStatus],
  );
  const busy = state === "loading" || state === "checking" || state === "updating";

  const loadStatus = useCallback(async () => {
    if (!desktop) {
      setState("unavailable");
      setMessage(t("core.unavailable"));
      return;
    }
    setState("loading");
    setMessage(null);
    try {
      setCoreStatus(await desktop.getCoreStatus());
      setState("ready");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : t("core.loadFailed"));
    }
  }, [desktop, t]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const checkUpdates = useCallback(async () => {
    if (!desktop) return;
    setState("checking");
    setMessage(t("core.checkingMessage"));
    try {
      const next = await desktop.checkCoreUpdates();
      setCoreStatus(next);
      setState("ready");
      setMessage(next.packages.some((pkg) => pkg.status === "update-available" || pkg.status === "missing")
        ? t("core.updatesAvailable")
        : t("core.alreadyLatest"));
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : t("core.checkFailed"));
    }
  }, [desktop, t]);

  const updateCore = useCallback(async () => {
    if (!desktop) return;
    setState("updating");
    setMessage(t("core.updatingMessage"));
    try {
      const next = await desktop.updateCore();
      setCoreStatus(next);
      setState("ready");
      setMessage(t("core.updatedMessage"));
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : t("core.updateFailed"));
    }
  }, [desktop, t]);

  const checkAppUpdates = useCallback(async () => {
    if (!desktop?.checkAppUpdates) {
      setAppUpdateState("unavailable");
      setAppUpdateMessage(t("updates.unavailable"));
      return;
    }
    setAppUpdateState("checking");
    setAppUpdateMessage(t("updates.checking"));
    try {
      const next = await desktop.checkAppUpdates();
      setAppUpdateStatus(next);
      setAppUpdateState("ready");
      setAppUpdateMessage(next.hasUpdate ? t("updates.available") : t("updates.upToDate"));
    } catch (error) {
      setAppUpdateState("error");
      setAppUpdateMessage(error instanceof Error ? error.message : t("updates.failed"));
    }
  }, [desktop, t]);

  const openAppDownloadPage = useCallback(() => {
    void desktop?.openAppDownloadPage?.(appUpdateStatus?.releaseUrl);
  }, [desktop, appUpdateStatus]);

  const openProjectLink = useCallback((url: string) => {
    if (desktop?.openAppDownloadPage) {
      void desktop.openAppDownloadPage(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }, [desktop]);

  const scrollToSection = useCallback((section: SettingsSection) => {
    setActiveSection(section);
    const container = scrollContainerRef.current;
    const node = sectionRefs.current[section];
    if (!container || !node) return;
    container.scrollTo({ top: node.offsetTop - 18, behavior: "smooth" });
  }, []);

  const handleSettingsScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const marker = container.scrollTop + 90;
    let nextSection: SettingsSection = "appearance";
    for (const section of ["appearance", "language", "core", "about"] as const) {
      const node = sectionRefs.current[section];
      if (node && node.offsetTop <= marker) nextSection = section;
    }
    setActiveSection(nextSection);
  }, []);

  const resolvedLabel = resolvedTheme === "dark" ? t("settings.theme.resolvedDark") : t("settings.theme.resolvedLight");
  const modeLabel = mode === "system" ? t("settings.theme.sourceSystem") : t(mode === "dark" ? "settings.theme.dark" : "settings.theme.light");
  const languageLabel = resolvedLanguage === "zh" ? t("language.chinese") : t("language.english");
  const languageSource = languageMode === "system"
    ? t("language.system")
    : t(languageMode === "zh" ? "language.chinese" : "language.english");

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.38)", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 860,
          maxWidth: "calc(100vw - 32px)",
          height: "78vh",
          maxHeight: "calc(100vh - 32px)",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          color: "var(--text)",
        }}
      >
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{t("common.settings")}</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "2px 6px" }}>×</button>
        </header>

        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
          <aside style={{ width: 210, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0, background: "var(--bg-panel)" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 6px" }}>
              <SectionButton active={activeSection === "appearance"} label={t("settings.appearance")} onClick={() => scrollToSection("appearance")}>
                <AppearanceIcon />
              </SectionButton>
              <SectionButton active={activeSection === "language"} label={t("language.section")} onClick={() => scrollToSection("language")}>
                <LanguageIcon />
              </SectionButton>
              <SectionButton active={activeSection === "core"} label="Pi Core" onClick={() => scrollToSection("core")}>
                <CoreIcon />
              </SectionButton>
              <SectionButton active={activeSection === "about"} label={t("settings.about")} onClick={() => scrollToSection("about")}>
                <AboutIcon />
              </SectionButton>
            </div>
          </aside>

          <main style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, flex: 1 }}>
          <div ref={scrollContainerRef} onScroll={handleSettingsScroll} style={{ flex: "1 1 0", minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: 18, scrollBehavior: "smooth" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 18 }}>
              <section ref={(node) => { sectionRefs.current.appearance = node; }} style={{ scrollMarginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
                <SectionHeading title={t("settings.appearance")} />
                <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, background: "var(--bg)" }}>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 650 }}>{t("settings.theme")}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                    {t("settings.themeStatus", { theme: resolvedLabel, source: modeLabel })}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                  {THEME_OPTIONS.map((option) => {
                    const selected = option.mode === mode;
                    return (
                      <button
                        key={option.mode}
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setMode(option.mode, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
                        }}
                        style={{
                          minHeight: 82,
                          padding: 12,
                          border: selected ? "1px solid var(--accent)" : "1px solid var(--border)",
                          borderRadius: 8,
                          background: selected ? "var(--bg-selected)" : "var(--bg-panel)",
                          color: "var(--text)",
                          cursor: "pointer",
                          textAlign: "left",
                          boxShadow: selected ? "0 0 0 1px color-mix(in srgb, var(--accent) 22%, transparent)" : "none",
                        } as CSSProperties}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 650 }}>{t(option.labelKey)}</span>
                          <span
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: 999,
                              border: selected ? "4px solid var(--accent)" : "1px solid var(--border)",
                              background: "var(--bg)",
                              flexShrink: 0,
                            }}
                          />
                        </div>
                        <div style={{ fontSize: 11, lineHeight: 1.45, color: "var(--text-muted)" }}>{t(option.descriptionKey)}</div>
                      </button>
                    );
                  })}
                </div>
                </div>
              </section>

              <section ref={(node) => { sectionRefs.current.language = node; }} style={{ scrollMarginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
                <SectionHeading title={t("language.section")} />
                <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, background: "var(--bg)" }}>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 650 }}>{t("language.title")}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                    {t("language.status", { language: languageLabel, source: languageSource })}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                  {LANGUAGE_OPTIONS.map((option) => {
                    const selected = option.mode === languageMode;
                    return (
                      <button
                        key={option.mode}
                        onClick={() => setLanguageMode(option.mode)}
                        style={{
                          minHeight: 82,
                          padding: 12,
                          border: selected ? "1px solid var(--accent)" : "1px solid var(--border)",
                          borderRadius: 8,
                          background: selected ? "var(--bg-selected)" : "var(--bg-panel)",
                          color: "var(--text)",
                          cursor: "pointer",
                          textAlign: "left",
                          boxShadow: selected ? "0 0 0 1px color-mix(in srgb, var(--accent) 22%, transparent)" : "none",
                        } as CSSProperties}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 650 }}>{t(option.labelKey)}</span>
                          <span
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: 999,
                              border: selected ? "4px solid var(--accent)" : "1px solid var(--border)",
                              background: "var(--bg)",
                              flexShrink: 0,
                            }}
                          />
                        </div>
                        <div style={{ fontSize: 11, lineHeight: 1.45, color: "var(--text-muted)" }}>{t(option.descriptionKey)}</div>
                      </button>
                    );
                  })}
                </div>
                </div>
              </section>

              <section ref={(node) => { sectionRefs.current.core = node; }} style={{ scrollMarginTop: 18, display: "flex", flexDirection: "column", gap: 16 }}>
              <SectionHeading title="Pi Core" />
              {state === "unavailable" ? (
                <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 18, color: "var(--text-muted)", fontSize: 13, background: "var(--bg)" }}>
                  {message}
                </div>
              ) : (
                <>
                  <section style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, background: "var(--bg)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 650 }}>{t("core.runtime")}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{t("core.runtimeHelp")}</div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button disabled={busy || !desktop} onClick={() => void desktop?.openRuntimeFolder()} style={actionButtonStyle(busy || !desktop)}>{t("core.openRuntime")}</button>
                        <button disabled={busy || !desktop} onClick={() => void desktop?.openLogFile()} style={actionButtonStyle(busy || !desktop)}>{t("core.openLog")}</button>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <InfoRow label={t("core.runtimePath")} value={coreStatus?.runtimeDir ?? t("common.loading")} />
                      <InfoRow label={t("core.nodeModules")} value={coreStatus?.nodeModules ?? t("common.loading")} />
                      <InfoRow label={t("core.logFile")} value={coreStatus?.logPath ?? t("common.loading")} />
                    </div>
                  </section>

                  <section style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--bg)" }}>
                    <div style={{ padding: 14, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 650 }}>{t("core.packages")}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{t("core.packagesHelp")}</div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button disabled={busy || !desktop} onClick={checkUpdates} style={actionButtonStyle(busy || !desktop)}>
                          {state === "checking" ? t("core.checking") : t("core.checkUpdates")}
                        </button>
                        <button disabled={busy || !desktop || !hasUpdate} onClick={updateCore} style={actionButtonStyle(busy || !desktop || !hasUpdate, true)}>
                          {state === "updating" ? t("core.updating") : t("core.updateCore")}
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "minmax(210px, 1.4fr) 100px 110px 130px 120px", gap: 0, fontSize: 11, color: "var(--text-dim)", borderBottom: "1px solid var(--border)" }}>
                      {[t("core.table.package"), t("core.table.range"), t("core.table.installed"), t("core.table.latest"), t("core.table.status")].map((label) => (
                        <div key={label} style={{ padding: "8px 12px", fontWeight: 600 }}>{label}</div>
                      ))}
                    </div>
                    {(coreStatus?.packages ?? []).map((pkg) => (
                      <div key={pkg.name} style={{ display: "grid", gridTemplateColumns: "minmax(210px, 1.4fr) 100px 110px 130px 120px", gap: 0, alignItems: "center", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                        <div style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={pkg.name}>{pkg.name}</div>
                        <div style={{ padding: "10px 12px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{pkg.range}</div>
                        <div style={{ padding: "10px 12px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{pkg.installed ?? "-"}</div>
                        <div style={{ padding: "10px 12px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{pkg.latest ?? "-"}</div>
                        <div style={{ padding: "10px 12px", color: statusColor(pkg.status), fontWeight: 600 }}>{statusLabel(pkg.status, t)}</div>
                      </div>
                    ))}
                    {!coreStatus && (
                      <div style={{ padding: 18, color: "var(--text-muted)", fontSize: 12 }}>
                        {t("core.loadingStatus")}
                      </div>
                    )}
                  </section>

                  {busy && (
                    <div style={{ height: 4, borderRadius: 999, overflow: "hidden", background: "var(--border)" }}>
                      <div style={{ width: "42%", height: "100%", borderRadius: 999, background: "var(--accent)", animation: "settings-progress 1.2s ease-in-out infinite" }} />
                    </div>
                  )}

                  {message && (
                    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", color: state === "error" ? "#ef4444" : "var(--text-muted)", fontSize: 12, lineHeight: 1.5, background: "var(--bg)" }}>
                      {message}
                    </div>
                  )}
                </>
              )}
              </section>

              <section ref={(node) => { sectionRefs.current.about = node; }} style={{ scrollMarginTop: 18, display: "flex", flexDirection: "column", gap: 16 }}>
                <SectionHeading title={t("settings.about")} />
                <section style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, background: "var(--bg)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 650 }}>{t("updates.title")}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{t("updates.appHelp")}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button disabled={appUpdateState === "checking" || !desktop?.checkAppUpdates} onClick={checkAppUpdates} style={actionButtonStyle(appUpdateState === "checking" || !desktop?.checkAppUpdates)}>
                        {appUpdateState === "checking" ? t("core.checking") : t("updates.check")}
                      </button>
                      <button disabled={!desktop?.openAppDownloadPage || !appUpdateStatus?.hasUpdate} onClick={openAppDownloadPage} style={actionButtonStyle(!desktop?.openAppDownloadPage || !appUpdateStatus?.hasUpdate, true)}>
                        {t("updates.openDownload")}
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <InfoRow label={t("updates.currentVersion")} value={appUpdateStatus?.currentVersion ?? process.env.NEXT_PUBLIC_APP_VERSION ?? t("common.loading")} />
                    <InfoRow label={t("updates.latestVersion")} value={appUpdateStatus?.latestVersion ?? t("updates.notChecked")} />
                    <InfoRow label={t("updates.published")} value={appUpdateStatus?.publishedAt ? new Date(appUpdateStatus.publishedAt).toLocaleString() : t("updates.notChecked")} />
                  </div>

                  {appUpdateStatus && (
                    <div style={{ marginTop: 14, border: "1px solid var(--border)", borderRadius: 8, padding: 14, background: "var(--bg-panel)" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 650 }}>
                            {appUpdateStatus.hasUpdate ? t("updates.hasUpdate") : t("updates.current")}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                            {appUpdateStatus.hasUpdate
                              ? `${appUpdateStatus.currentVersion} -> ${appUpdateStatus.latestVersion}`
                              : appUpdateStatus.currentVersion}
                          </div>
                        </div>
                        <span style={{ color: appUpdateStatus.hasUpdate ? "#d97706" : "#22a06b", fontSize: 12, fontWeight: 650 }}>
                          {appUpdateStatus.hasUpdate ? t("updates.hasUpdate") : t("core.status.upToDate")}
                        </span>
                      </div>
                    </div>
                  )}

                  {appUpdateState === "checking" && (
                    <div style={{ height: 4, marginTop: 12, borderRadius: 999, overflow: "hidden", background: "var(--border)" }}>
                      <div style={{ width: "42%", height: "100%", borderRadius: 999, background: "var(--accent)", animation: "settings-progress 1.2s ease-in-out infinite" }} />
                    </div>
                  )}

                  {appUpdateMessage && (
                    <div style={{ marginTop: 12, border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", color: appUpdateState === "error" ? "#ef4444" : "var(--text-muted)", fontSize: 12, lineHeight: 1.5, background: "var(--bg-panel)" }}>
                      {appUpdateMessage}
                    </div>
                  )}
                </section>

                <section style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, background: "var(--bg)" }}>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 650 }}>{t("common.appName")}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.5 }}>
                      {t("about.description")}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <InfoRow label={t("about.repository")} value={PROJECT_URL} />
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
                    <button onClick={() => openProjectLink(PROJECT_URL)} style={actionButtonStyle()}>{t("about.github")}</button>
                    <button onClick={() => openProjectLink(RELEASES_URL)} style={actionButtonStyle()}>{t("about.releases")}</button>
                    <button onClick={() => openProjectLink(ISSUES_URL)} style={actionButtonStyle()}>{t("about.issues")}</button>
                  </div>
                </section>
              </section>
            </div>
          </div>
        </main>
      </div>
      <style jsx>{`
        @keyframes settings-progress {
          0% { transform: translateX(-110%); }
          55% { transform: translateX(85%); }
          100% { transform: translateX(260%); }
        }
      `}</style>
    </div>
    </div>
  );
}
