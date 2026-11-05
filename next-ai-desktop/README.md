# NEXT AI Desktop (Windows)

Initial secure Electron foundation. This is not yet the finished voice assistant or a tested installer.

## Requirements
- Windows 10/11
- Node.js 20+
- npm

## Run
```powershell
cd next-ai-desktop
npm install
npm start
```

## Build Windows installer
```powershell
npm run dist
```
Installer output is written to `release/`.

## Current foundation
- Electron context isolation, sandbox, and disabled Node integration in renderer
- Narrow preload bridge; renderer cannot execute arbitrary shell commands
- API keys stored using Electron safeStorage (Windows-backed encryption)
- Gemini primary and Groq fallback chat routing
- Allowlisted YouTube open, media key actions, and confirmation-gated text paste

## Not implemented yet
- Wake-word detection ("Hey NEXT")
- Speech recognition and spoken responses
- YouTube search voice intent routing
- App allowlist and per-action permissions UI
- File/PDF/image analysis
- Auto-update, code signing, installer verification and security audit

Never commit API keys. Enter them in the app's Settings UI. Verify current provider model names, quotas, pricing and terms before production use.
