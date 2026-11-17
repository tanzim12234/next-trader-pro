const { app, BrowserWindow, shell, ipcMain, safeStorage } = require("electron");\nconst fs = require("node:fs");\nconst path = require("node:path");
const { execFile } = require("node:child_process");

const APP_ALLOWLIST = {
  chrome: "chrome",
  notepad: "notepad",
  calculator: "calc",
  explorer: "explorer",
  taskmanager: "taskmgr",
  settings: "ms-settings:"
};

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 940, minWidth: 900, minHeight: 650,
    backgroundColor: "#061316", title: "NEXT AI",
    webPreferences: {
      preload: require("node:path").join(__dirname, "preload.cjs"),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  win.loadURL("https://next-trader-ai.vercel.app/next-ai.html");
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
}

ipcMain.handle("next:open-app", async (_event, name) => {
  if (process.platform !== "win32" || typeof name !== "string" || !APP_ALLOWLIST[name]) {
    return { ok: false, error: "Unsupported app or platform." };
  }
  return new Promise(resolve => {
    const target = APP_ALLOWLIST[name];
    const command = target === "ms-settings:" ? "cmd" : target;
    const args = target === "ms-settings:" ? ["/c", "start", "", target] : [];
    execFile(command, args, { windowsHide: true }, error =>
      resolve(error ? { ok: false, error: "Could not open that app." } : { ok: true })
    );
  });
});

ipcMain.handle("next:save-api-key", async (_event, key) => {
  if (typeof key !== "string" || key.trim().length < 20 || key.trim().length > 512) return { ok: false, error: "Invalid API key length." };
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: "OS secure storage is unavailable on this device." };
  try {
    const encrypted = safeStorage.encryptString(key.trim());
    fs.writeFileSync(path.join(app.getPath("userData"), "provider-api-key.enc"), encrypted, { mode: 0o600 });
    return { ok: true };
  } catch { return { ok: false, error: "Could not securely store the API key." }; }
});
ipcMain.handle("next:get-api-key", async () => {
  try {
    const file = path.join(app.getPath("userData"), "provider-api-key.enc");
    if (!safeStorage.isEncryptionAvailable() || !fs.existsSync(file)) return "";
    return safeStorage.decryptString(fs.readFileSync(file));
  } catch { return ""; }
});
ipcMain.handle("next:delete-api-key", async () => {
  try { fs.rmSync(path.join(app.getPath("userData"), "provider-api-key.enc"), { force: true }); return { ok: true }; }
  catch { return { ok: false, error: "Could not remove the saved API key." }; }
});

ipcMain.handle("next:speak", async (_event, text) => {
  if (typeof text !== "string" || !text.trim() || text.length > 1500) {
    return { ok: false, error: "Text must be 1–1500 characters." };
  }
  if (process.platform !== "win32") return { ok: false, error: "Windows speech is unavailable." };
  const safeText = text.replace(/'/g, "''");
  const script = "$s=New-Object -ComObject SAPI.SpVoice; $v=$s.GetVoices(); for($i=0;$i -lt $v.Count;$i++){if($v.Item($i).GetAttribute('Gender') -eq 'Male'){$s.Voice=$v.Item($i);break}}; $s.Speak('" + safeText + "') | Out-Null";
  return new Promise(resolve => execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, timeout: 15000 }, error =>
      resolve(error ? { ok: false, error: "Windows speech failed." } : { ok: true })
    ));
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
