/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("piDesktop", {
  platform: process.platform,
  getCoreSetupState: () => ipcRenderer.invoke("piDesktop:getCoreSetupState"),
  retryStartup: () => ipcRenderer.invoke("piDesktop:retryStartup"),
  retryCoreSetup: () => ipcRenderer.invoke("piDesktop:retryCoreSetup"),
  quit: () => ipcRenderer.invoke("piDesktop:quit"),
  getCoreStatus: () => ipcRenderer.invoke("piDesktop:getCoreStatus"),
  checkCoreUpdates: () => ipcRenderer.invoke("piDesktop:checkCoreUpdates"),
  updateCore: () => ipcRenderer.invoke("piDesktop:updateCore"),
  openRuntimeFolder: () => ipcRenderer.invoke("piDesktop:openRuntimeFolder"),
  openLogFile: () => ipcRenderer.invoke("piDesktop:openLogFile"),
  selectDirectory: () => ipcRenderer.invoke("piDesktop:selectDirectory"),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  setTheme: (mode, resolvedTheme) => ipcRenderer.invoke("piDesktop:setTheme", mode, resolvedTheme),
  getLanguageMode: () => ipcRenderer.invoke("piDesktop:getLanguageMode"),
  setLanguageMode: (mode, resolved) => ipcRenderer.invoke("piDesktop:setLanguageMode", mode, resolved),
  onOpenSettings: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("piDesktop:openSettings", listener);
    return () => ipcRenderer.removeListener("piDesktop:openSettings", listener);
  },
  onCoreSetupState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("piDesktop:coreSetupState", listener);
    return () => ipcRenderer.removeListener("piDesktop:coreSetupState", listener);
  },
});
