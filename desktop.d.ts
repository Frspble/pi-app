export {};

declare global {
  type PiCorePackageStatus = "missing" | "unknown" | "up-to-date" | "update-available";

  interface PiCorePackageInfo {
    name: string;
    range: string;
    installed: string | null;
    latest: string | null;
    status: PiCorePackageStatus;
  }

  interface PiCoreStatus {
    productName: string;
    runtimeDir: string;
    logPath: string;
    nodeModules: string;
    packages: PiCorePackageInfo[];
  }

  type PiCoreSetupPhase = "starting" | "installing" | "service-starting" | "ready" | "updating" | "rolling-back" | "error";
  type LanguageMode = "system" | "en" | "zh";
  type ResolvedLanguage = "en" | "zh";
  type DesktopPlatform = "darwin" | "win32" | "linux";

  interface PiCoreSetupState {
    phase: PiCoreSetupPhase;
    message: string;
    detail: string;
    runtimeDir: string | null;
    packages: PiCorePackageInfo[];
  }

  interface PiAppUpdateStatus {
    currentVersion: string;
    latestVersion: string | null;
    releaseName: string | null;
    releaseUrl: string;
    publishedAt: string | null;
    hasUpdate: boolean;
  }

  interface Window {
    piDesktop?: {
      platform: DesktopPlatform;
      getCoreSetupState: () => Promise<PiCoreSetupState>;
      retryStartup: () => Promise<PiCoreSetupState>;
      retryCoreSetup: () => Promise<PiCoreSetupState>;
      quit: () => Promise<null>;
      getCoreStatus: () => Promise<PiCoreStatus>;
      checkCoreUpdates: () => Promise<PiCoreStatus>;
      updateCore: () => Promise<PiCoreStatus>;
      checkAppUpdates: () => Promise<PiAppUpdateStatus>;
      openAppDownloadPage: (url?: string) => Promise<null>;
      openRuntimeFolder: () => Promise<string>;
      openLogFile: () => Promise<string>;
      selectDirectory: () => Promise<string | null>;
      getPathForFile: (file: File) => string;
      setTheme: (mode: "system" | "light" | "dark", resolvedTheme: "light" | "dark") => Promise<null>;
      getLanguageMode: () => Promise<LanguageMode | null>;
      setLanguageMode: (mode: LanguageMode, resolved: ResolvedLanguage) => Promise<null>;
      onOpenSettings: (callback: () => void) => () => void;
      onCoreSetupState: (callback: (state: PiCoreSetupState) => void) => () => void;
    };
  }
}
