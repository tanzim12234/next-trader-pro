const { app, BrowserWindow, ipcMain, safeStorage, shell, globalShortcut, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');

let win;
const settingsPath = () => path.join(app.getPath('userData'), 'settings.enc');

function readSettings() {
  try {
    const raw = fs.readFileSync(settingsPath());
    if (!safeStorage.isEncryptionAvailable()) return {};
    return JSON.parse(safeStorage.decryptString(raw));
  } catch { return {}; }
}
function writeSettings(settings) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is unavailable.');
  fs.writeFileSync(settingsPath(), safeStorage.encryptString(JSON.stringify(settings)));
}
function createWindow() {
  win = new BrowserWindow({
    width: 1100, height: 760, minWidth: 760, minHeight: 560,
    backgroundColor: '#061018',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { globalShortcut.unregisterAll(); if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('settings:status', () => {
  const s = readSettings();
  return { gemini: !!s.geminiKey, groq: !!s.groqKey, secureStorage: safeStorage.isEncryptionAvailable() };
});
ipcMain.handle('settings:save', (_e, input) => {
  if (!input || typeof input !== 'object') throw new Error('Invalid settings.');
  const old = readSettings();
  const next = { ...old };
  for (const k of ['geminiKey', 'groqKey']) {
    if (typeof input[k] === 'string' && input[k].trim()) next[k] = input[k].trim();
  }
  writeSettings(next);
  return { ok: true };
});
ipcMain.handle('ai:chat', async (_e, message) => {
  if (typeof message !== 'string' || !message.trim() || message.length > 8000) throw new Error('Message must be 1–8000 characters.');
  const s = readSettings();
  if (s.geminiKey) {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + encodeURIComponent(s.geminiKey), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: message }] }] })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'Gemini request failed.');
    return data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || 'No text response.';
  }
  if (s.groqKey) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + s.groqKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: message }] })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'Groq request failed.');
    return data.choices?.[0]?.message?.content || 'No text response.';
  }
  throw new Error('Settings থেকে Gemini অথবা Groq API key যোগ করো।');
});
ipcMain.handle('action:run', async (_e, action) => {
  if (!action || typeof action.type !== 'string') throw new Error('Invalid action.');
  if (action.type === 'youtube-open') return shell.openExternal('https://www.youtube.com');
  if (action.type === 'youtube-search') {
    const q = String(action.query || '').trim().slice(0, 200);
    if (!q) throw new Error('Search text is required.');
    return shell.openExternal('https://www.youtube.com/results?search_query=' + encodeURIComponent(q));
  }
  if (action.type === 'media') {
    const keys = { playpause: '{MEDIA_PLAY_PAUSE}', pause: '{MEDIA_PLAY_PAUSE}', next: '{MEDIA_NEXT_TRACK}', previous: '{MEDIA_PREV_TRACK}' };
    const key = keys[action.command];
    if (!key) throw new Error('Unsupported media command.');
    const vk = { playpause: '0xB3', pause: '0xB3', next: '0xB0', previous: '0xB1' }[action.command];
    const ps = "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class NextMediaKey { [StructLayout(LayoutKind.Sequential)] public struct INPUT { public UInt32 type; public KEYBDINPUT ki; } [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public UInt16 wVk; public UInt16 wScan; public UInt32 dwFlags; public UInt32 time; public IntPtr dwExtraInfo; } [DllImport(\\"user32.dll\\", SetLastError=true)] public static extern UInt32 SendInput(UInt32 n, INPUT[] p, Int32 cb); }'; $v=[Convert]::ToUInt16('" + vk + "',16); $a=New-Object NextMediaKey+INPUT[] 2; $a[0].type=1; $a[0].ki.wVk=$v; $a[1].type=1; $a[1].ki.wVk=$v; $a[1].ki.dwFlags=2; [NextMediaKey]::SendInput(2,$a,[Runtime.InteropServices.Marshal]::SizeOf([type][NextMediaKey+INPUT])) | Out-Null";
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps],
      { windowsHide: true, timeout: 3000 }, err => { if (err) console.error('Media key failed:', err.message); });
    return { ok: true };
  }
  if (action.type === 'write-text') {
    const value = String(action.text || '').slice(0, 4000);
    if (!value) throw new Error('Text is empty.');
    const choice = await require('electron').dialog.showMessageBox(win, {
      type: 'warning', buttons: ['Paste text', 'Cancel'], defaultId: 1, cancelId: 1,
      message: 'Focused app-এ লেখা paste করবে?',
      detail: 'NEXT AI তোমার clipboard-এ লেখা রেখে Ctrl+V পাঠাবে। আগে সঠিক text field-এ cursor রাখো।'
    });
    if (choice.response !== 0) return { cancelled: true };
    clipboard.writeText(value);
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      "$w=New-Object -ComObject WScript.Shell; Start-Sleep -Milliseconds 250; $w.SendKeys('^v')"],
      { windowsHide: true, timeout: 3000 }, err => { if (err) console.error('Paste failed:', err.message); });
    return { ok: true };
  }
  throw new Error('এই action অনুমোদিত নয়।');
});
