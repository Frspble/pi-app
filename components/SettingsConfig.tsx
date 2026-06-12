"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useTheme, type ThemeMode } from "@/hooks/useTheme";

type LoadState = "idle" | "loading" | "checking" | "updating" | "ready" | "unavailable" | "error";
type SettingsSection = "appearance" | "core";

const THEME_OPTIONS: { mode: ThemeMode; label: string; description: string }[] = [
  { mode: "system", label: "Follow System", description: "Use the current macOS or Windows appearance." },
  { mode: "light", label: "Light", description: "Use the bright workspace palette." },
  { mode: "dark", label: "Dark", description: "Use the low-light workspace palette." },
];

function statusLabel(status: PiCorePackageInfo["status"]) {
  switch (status) {
    case "missing":
      return "Not installed";
    case "up-to-date":
      return "Up to date";
    case "update-available":
      return "Update available";
    default:
      return "Unknown";
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
      <path d="M12 3v18" />
      <path d="M3 12h18" />
      <circle cx="12" cy="12" r="7" />
    </svg>
  );
}

export function SettingsConfig({ onClose }: { onClose: () => void }) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");
  const [state, setState] = useState<LoadState>("idle");
  const [coreStatus, setCoreStatus] = useState<PiCoreStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { mode, resolvedTheme, setMode } = useTheme();

  const desktop = typeof window !== "undefined" ? window.piDesktop : undefined;
  const hasUpdate = useMemo(
    () => coreStatus?.packages.some((pkg) => pkg.status === "missing" || pkg.status === "update-available") ?? false,
    [coreStatus],
  );
  const busy = state === "loading" || state === "checking" || state === "updating";

  const loadStatus = useCallback(async () => {
    if (!desktop) {
      setState("unavailable");
      setMessage("Desktop runtime unavailable. Pi Core settings are available inside the packaged Pi App.");
      return;
    }
    setState("loading");
    setMessage(null);
    try {
      setCoreStatus(await desktop.getCoreStatus());
      setState("ready");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Failed to load Pi Core status.");
    }
  }, [desktop]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const checkUpdates = useCallback(async () => {
    if (!desktop) return;
    setState("checking");
    setMessage("Checking npm for the latest compatible Pi Core versions...");
    try {
      const next = await desktop.checkCoreUpdates();
      setCoreStatus(next);
      setState("ready");
      setMessage(next.packages.some((pkg) => pkg.status === "update-available" || pkg.status === "missing")
        ? "Compatible Pi Core updates are available."
        : "Pi Core is already on the latest compatible versions.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Failed to check Pi Core updates.");
    }
  }, [desktop]);

  const updateCore = useCallback(async () => {
    if (!desktop) return;
    setState("updating");
    setMessage("Updating Pi Core and restarting the local service...");
    try {
      const next = await desktop.updateCore();
      setCoreStatus(next);
      setState("ready");
      setMessage("Pi Core updated. The local service has restarted.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Failed to update Pi Core.");
    }
  }, [desktop]);

  const resolvedLabel = resolvedTheme === "dark" ? "Dark" : "Light";
  const modeLabel = mode === "system" ? "system" : mode;

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.38)", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(860px, calc(100vw - 36px))",
          height: "min(620px, calc(100vh - 36px))",
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          boxShadow: "0 20px 70px rgba(0,0,0,0.32)",
          display: "grid",
          gridTemplateColumns: "190px minmax(0, 1fr)",
          overflow: "hidden",
          color: "var(--text)",
        }}
      >
        <aside style={{ borderRight: "1px solid var(--border)", background: "var(--bg)", padding: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 650, marginBottom: 18 }}>Settings</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <SectionButton active={activeSection === "appearance"} label="Appearance" onClick={() => setActiveSection("appearance")}>
              <AppearanceIcon />
            </SectionButton>
            <SectionButton active={activeSection === "core"} label="Pi Core" onClick={() => setActiveSection("core")}>
              <CoreIcon />
            </SectionButton>
          </div>
        </aside>

        <main style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <header style={{ height: 54, padding: "0 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 650 }}>{activeSection === "appearance" ? "Appearance" : "Pi Core"}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                {activeSection === "appearance"
                  ? "Choose how Pi App follows light and dark mode."
                  : "Manage the app-owned local runtime used by Pi App."}
              </div>
            </div>
            <button
              onClick={onClose}
              title="Close settings"
              style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "none", color: "var(--text-muted)", cursor: "pointer", borderRadius: 6 }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </header>

          <div style={{ flex: 1, overflow: "auto", padding: 18 }}>
            {activeSection === "appearance" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <section style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, background: "var(--bg)" }}>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 650 }}>Theme</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                      Using {resolvedLabel} from {modeLabel}.
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
                            <span style={{ fontSize: 13, fontWeight: 650 }}>{option.label}</span>
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
                          <div style={{ fontSize: 11, lineHeight: 1.45, color: "var(--text-muted)" }}>{option.description}</div>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, background: "var(--bg)" }}>
                  <div style={{ fontSize: 13, fontWeight: 650, marginBottom: 12 }}>Preview</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div style={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-panel)", padding: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 650, color: "var(--text)", marginBottom: 6 }}>Workspace surface</div>
                      <div style={{ height: 8, width: "70%", borderRadius: 999, background: "var(--bg-hover)", marginBottom: 8 }} />
                      <div style={{ height: 8, width: "48%", borderRadius: 999, background: "var(--bg-selected)" }} />
                    </div>
                    <div style={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-panel)", padding: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 650, color: "var(--text)", marginBottom: 8 }}>Action state</div>
                      <div style={{ display: "inline-flex", alignItems: "center", height: 26, padding: "0 10px", borderRadius: 6, background: "var(--accent)", color: "#fff", fontSize: 11, fontWeight: 600 }}>
                        Primary action
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            ) : state === "unavailable" ? (
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 18, color: "var(--text-muted)", fontSize: 13 }}>
                {message}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <section style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, background: "var(--bg)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 650 }}>Runtime</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>Pi Core is installed outside the packaged app.</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button disabled={busy || !desktop} onClick={() => void desktop?.openRuntimeFolder()} style={actionButtonStyle(busy || !desktop)}>Open Runtime</button>
                      <button disabled={busy || !desktop} onClick={() => void desktop?.openLogFile()} style={actionButtonStyle(busy || !desktop)}>Open Log</button>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <InfoRow label="Runtime path" value={coreStatus?.runtimeDir ?? "Loading..."} />
                    <InfoRow label="Node modules" value={coreStatus?.nodeModules ?? "Loading..."} />
                    <InfoRow label="Log file" value={coreStatus?.logPath ?? "Loading..."} />
                  </div>
                </section>

                <section style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--bg)" }}>
                  <div style={{ padding: 14, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 650 }}>Packages</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>Updates stay within the compatible range declared by this app.</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button disabled={busy || !desktop} onClick={checkUpdates} style={actionButtonStyle(busy || !desktop)}>
                        {state === "checking" ? "Checking..." : "Check Updates"}
                      </button>
                      <button disabled={busy || !desktop || !hasUpdate} onClick={updateCore} style={actionButtonStyle(busy || !desktop || !hasUpdate, true)}>
                        {state === "updating" ? "Updating..." : "Update Pi Core"}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "minmax(210px, 1.4fr) 100px 110px 130px 120px", gap: 0, fontSize: 11, color: "var(--text-dim)", borderBottom: "1px solid var(--border)" }}>
                    {["Package", "Range", "Installed", "Latest", "Status"].map((label) => (
                      <div key={label} style={{ padding: "8px 12px", fontWeight: 600 }}>{label}</div>
                    ))}
                  </div>
                  {(coreStatus?.packages ?? []).map((pkg) => (
                    <div key={pkg.name} style={{ display: "grid", gridTemplateColumns: "minmax(210px, 1.4fr) 100px 110px 130px 120px", gap: 0, alignItems: "center", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                      <div style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={pkg.name}>{pkg.name}</div>
                      <div style={{ padding: "10px 12px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{pkg.range}</div>
                      <div style={{ padding: "10px 12px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{pkg.installed ?? "-"}</div>
                      <div style={{ padding: "10px 12px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{pkg.latest ?? "-"}</div>
                      <div style={{ padding: "10px 12px", color: statusColor(pkg.status), fontWeight: 600 }}>{statusLabel(pkg.status)}</div>
                    </div>
                  ))}
                  {!coreStatus && (
                    <div style={{ padding: 18, color: "var(--text-muted)", fontSize: 12 }}>
                      Loading Pi Core status...
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
              </div>
            )}
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
  );
}
