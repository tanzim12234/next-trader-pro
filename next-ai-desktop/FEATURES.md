# NEXT AI Desktop — Feature Guide

## Voice assistant
- Uses the selected Bangla (Bangladesh) or English (US) speech-recognition locale when supported by the installed Electron/Windows speech service.
- Supports wake phrases such as “Hey NEXT” and Bengali variants.
- Routes common app, YouTube, web-search, media, text-entry, AI chat, and Home Assistant commands.
- Unknown speech is offered to the AI task planner; any proposed desktop action still requires approval.
- Spoken answers use the system speech-synthesis voices. Voice recognition and synthesis availability depend on Windows/Electron runtime support.

## Personal Brain and learning
- Personal Brain data is encrypted with Electron safeStorage and stays on this Windows profile.
- Chat history is not silently saved. The user explicitly saves conversations or approves learning suggestions.
- API keys and Home Assistant tokens are stored in encrypted local settings. Never commit them to source control or paste them into public issue trackers.

## Smart home
- Connect a Home Assistant instance using its URL and a long-lived access token.
- Private LAN URLs may use HTTP; public hosts must use HTTPS.
- Supports read-only sensor, binary sensor, weather and person entities; supported controls include lights, switches, climate, media players and locks.
- Every control request is confirmed by a native Windows dialog. Lock/unlock actions use a warning dialog.
- Cameras, cars, suits and devices without a Home Assistant integration are not controlled by this connector.

## Research, analysis and multitasking
- Web research uses Gemini Google Search grounding and returns source links.
- Parallel research accepts up to three independent queries.
- CSV/JSON analysis is local and reports numeric summaries, missing values, category counts and duplicate rows. Input is limited to 1 MB and 10,000 records.

## File and browser control
- File Control starts from a folder explicitly selected by the user and supports nested browsing, opening files, copying files and creating folders. It does not delete files.
- The Secure Browser accepts HTTP/HTTPS URLs only, blocks site permission requests, and asks before opening popups externally.

## Fail-safe and security
- Encrypted backups include Personal Brain, settings and task history when those files exist. Restore requires confirmation and creates a rollback snapshot first. Backups are tied to the same Windows user profile.
- System monitoring estimates short-term CPU/RAM trends; it is diagnostic, not a guarantee or emergency autonomous controller.
- Electron context isolation, renderer sandboxing, disabled Node integration, allowlisted actions and explicit confirmations reduce application risk.
- These features do not replace Windows Defender, firewall, endpoint protection, backups outside the PC, or professional security review. No software can guarantee protection from every hacker.

## Not yet implemented / hardware-dependent
- Physical hologram projection requires compatible external display hardware; the current interface is a screen-based animated HUD.
- Camera live feeds, car/vehicle control, powered suit control, advanced sensor networks and emergency autonomous decisions require dedicated hardware, vendor APIs, safety validation and explicit setup.
