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

  type PiCoreSetupPhase = "starting" | "installing" | "ready" | "error";

  interface PiCoreSetupState {
    phase: PiCoreSetupPhase;
    message: string;
    detail: string;
    runtimeDir: string | null;
    packages: PiCorePackageInfo[];
  }

  interface Window {
    piDesktop?: {
      getCoreSetupState: () => Promise<PiCoreSetupState>;
      retryStartup: () => Promise<PiCoreSetupState>;
      retryCoreSetup: () => Promise<PiCoreSetupState>;
      quit: () => Promise<null>;
      getCoreStatus: () => Promise<PiCoreStatus>;
      checkCoreUpdates: () => Promise<PiCoreStatus>;
      updateCore: () => Promise<PiCoreStatus>;
      openRuntimeFolder: () => Promise<string>;
      openLogFile: () => Promise<string>;
      selectDirectory: () => Promise<string | null>;
      getPathForFile: (file: File) => string;
      setTheme: (theme: "light" | "dark") => Promise<null>;
      onOpenSettings: (callback: () => void) => () => void;
      onCoreSetupState: (callback: (state: PiCoreSetupState) => void) => () => void;
    };
  }
}
