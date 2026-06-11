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

  interface Window {
    piDesktop?: {
      getCoreStatus: () => Promise<PiCoreStatus>;
      checkCoreUpdates: () => Promise<PiCoreStatus>;
      updateCore: () => Promise<PiCoreStatus>;
      openRuntimeFolder: () => Promise<string>;
      openLogFile: () => Promise<string>;
      selectDirectory: () => Promise<string | null>;
      getPathForFile: (file: File) => string;
      onOpenSettings: (callback: () => void) => () => void;
    };
  }
}
