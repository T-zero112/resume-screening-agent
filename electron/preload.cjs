const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("resumeScreening", {
  selectArchiveDirectory: () => ipcRenderer.invoke("archive:select-directory"),
  openArchiveDirectory: () => ipcRenderer.invoke("archive:open-directory"),
});
