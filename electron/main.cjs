const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require("electron");
const { mkdir, readFile, rename, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

let localServer;
let localOrigin;
let savedSecrets = {};

const hasSingleInstance = app.requestSingleInstanceLock();
if (!hasSingleInstance) app.quit();

app.whenReady().then(async () => {
  try {
    process.chdir(app.getPath("userData"));
    registerArchiveHandlers();
    await loadEncryptedSecrets();
    const serverModulePath = path.join(app.getAppPath(), "desktop-dist", "src", "server.js");
    const { startLocalServer } = await import(pathToFileURL(serverModulePath).href);
    localServer = await startLocalServer({ storeSecrets: saveEncryptedSecrets });
    const address = localServer.address();
    if (!address || typeof address === "string") throw new Error("本地服务启动失败。");
    localOrigin = `http://127.0.0.1:${address.port}`;
    await createWindow();
  } catch (error) {
    dialog.showErrorBox("简历筛选 Agent 启动失败", error instanceof Error ? error.message : String(error));
    app.quit();
  }
});

async function loadEncryptedSecrets() {
  const file = path.join(app.getPath("userData"), "credentials.dat");
  const encrypted = await readFile(file).catch((error) => error.code === "ENOENT" ? undefined : Promise.reject(error));
  if (!encrypted) return;
  if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error("Windows 安全存储暂不可用，无法读取本机 API Key。");
  const decrypted = await safeStorage.decryptStringAsync(encrypted);
  savedSecrets = JSON.parse(decrypted.result);
  Object.assign(process.env, savedSecrets);
  if (decrypted.shouldReEncrypt) await writeEncryptedSecrets();
}

async function saveEncryptedSecrets(secrets) {
  if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error("Windows 安全存储暂不可用，API Key 未保存。");
  savedSecrets = { ...savedSecrets, ...secrets };
  await writeEncryptedSecrets();
  Object.assign(process.env, secrets);
}

async function writeEncryptedSecrets() {
  const userData = app.getPath("userData");
  const file = path.join(userData, "credentials.dat");
  const temporary = `${file}.tmp`;
  await mkdir(userData, { recursive: true });
  await writeFile(temporary, await safeStorage.encryptStringAsync(JSON.stringify(savedSecrets)));
  await rename(temporary, file);
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(app.getAppPath(), "electron", "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (["http:", "https:"].includes(new URL(url).protocol)) void shell.openExternal(url);
    } catch {}
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(localOrigin)) event.preventDefault();
  });
  window.once("ready-to-show", () => window.show());
  await window.loadURL(localOrigin);
}

function registerArchiveHandlers() {
  ipcMain.handle("archive:select-directory", async () => {
    const settingsPath = path.join(app.getPath("userData"), "data", "mail", "archive-settings.json");
    const settings = await readFile(settingsPath, "utf8").then(JSON.parse).catch(() => ({}));
    const result = await dialog.showOpenDialog({
      title: "选择简历归档文件夹",
      defaultPath: settings.directory || app.getPath("documents"),
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? undefined : result.filePaths[0];
  });
  ipcMain.handle("archive:open-directory", async () => {
    const settingsPath = path.join(app.getPath("userData"), "data", "mail", "archive-settings.json");
    const settings = await readFile(settingsPath, "utf8").then(JSON.parse).catch(() => ({}));
    if (!settings.directory) throw new Error("尚未设置归档文件夹。");
    await mkdir(settings.directory, { recursive: true });
    const error = await shell.openPath(settings.directory);
    if (error) throw new Error(error);
  });
}

app.on("before-quit", () => {
  localServer?.close();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && localOrigin) void createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
