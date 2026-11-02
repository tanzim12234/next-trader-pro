# NEXT AI Android

Android wrapper source for the hosted NEXT AI workspace.

## Build
1. Install Node.js 20+ and Android Studio (Android SDK + JDK 17).
2. From this directory run `npm install`.
3. Run `npm run add:android` once to generate the native Android project.
4. Run `npm run sync`, then `npm run open:android`.
5. In Android Studio, build a signed APK/AAB using your own release keystore.

The app currently loads the production web workspace at `https://next-trader-ai.vercel.app/next-ai.html`. This keeps AI requests on the existing secure server API; it does not embed provider keys in the APK.

Before public release: verify Android back navigation, microphone/camera permissions, file picker, login/session persistence, privacy policy, app signing, and Play policy compliance. A build artifact has not yet been produced or tested on a device.
