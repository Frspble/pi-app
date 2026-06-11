/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("piDesktop", {
  getCoreStatus: () => ipcRenderer.invoke("piDesktop:getCoreStatus"),
  checkCoreUpdates: () => ipcRenderer.invoke("piDesktop:checkCoreUpdates"),
  updateCore: () => ipcRenderer.invoke("piDesktop:updateCore"),
  openRuntimeFolder: () => ipcRenderer.invoke("piDesktop:openRuntimeFolder"),
  openLogFile: () => ipcRenderer.invoke("piDesktop:openLogFile"),
  selectDirectory: () => ipcRenderer.invoke("piDesktop:selectDirectory"),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  onOpenSettings: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("piDesktop:openSettings", listener);
    return () => ipcRenderer.removeListener("piDesktop:openSettings", listener);
  },
});
