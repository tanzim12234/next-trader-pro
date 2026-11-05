# NEXT AI Android

Android foundation with an Android Keystore-backed AES-256-GCM encrypted API-key store, Gemini/Groq chat, and native speech-recognition command entry.

## Build
The GitHub Actions workflow creates a debug APK. It is for testing, not Play Store release. Install the APK on a physical Android device and grant microphone permission when prompted.

## Security notes
- API keys are encrypted using a non-exportable AES key generated in Android Keystore. Only ciphertext is stored in app-private SharedPreferences.
- Do not commit API keys or share screenshots containing them.
- Gemini/Groq requests go directly from the app to their provider over HTTPS.
- Speech recognition is initiated only after the user taps the microphone button and grants permission. No always-on wake-word or background listening.
- Android media control across other apps is not enabled; Android restricts this behavior and it needs a dedicated MediaSession/notification implementation.
- This debug APK is unsigned for distribution and has not undergone a full device/security audit.
