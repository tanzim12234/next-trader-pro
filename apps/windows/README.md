# NEXT AI Windows

Electron desktop wrapper for the hosted NEXT AI workspace.

## Development
- Install Node.js 20+ on Windows.
- Run `npm install` in this directory.
- Run `npm start` to launch the app.

## Installer
Run `npm run dist` on a Windows build machine to produce an NSIS installer under `dist/`.

Security defaults: context isolation enabled, Node integration disabled, sandbox enabled, and navigation restricted to the official NEXT AI host. Provider API keys stay on the server and must never be placed in this desktop package.

This is the first desktop wrapper foundation, not a finished/signed installer. Test login, file uploads, microphone permissions, auto-update signing, and Windows 10/11 behavior before release.
