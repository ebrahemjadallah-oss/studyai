# StudyAI — Mobile release guide

## Current status

The repository now contains Capacitor 8 scaffolding for Android and iOS, a native speech-recognition bridge for Egyptian Arabic (\`ar-EG\`), and a GitHub Actions workflow that builds:

- An Android **debug APK** for device testing.
- An iOS **Simulator app** for simulator testing.

These are preview/test builds. They are not signed store-release packages and are not ready to upload as-is.

## Prerequisites

- Node.js 22 or newer.
- For local Android builds: Android Studio and Android SDK.
- For local iOS builds: macOS with Xcode 26 or newer.
- A unique app identifier. The current placeholder is \`com.ebrahemjadallah.studyai\`; confirm that this identifier is available and keep it unchanged after store registration.

## Generate native projects locally

\`\`\`sh
npm install
npm run mobile:prepare
npx cap add android
npx cap sync android
node scripts/patch-native-permissions.mjs android
\`\`\`

For iOS, run on macOS:

\`\`\`sh
npm install
npm run mobile:prepare
npx cap add ios
npx cap sync ios
node scripts/patch-native-permissions.mjs ios
\`\`\`

## CI preview artifacts

GitHub Actions workflow: \`.github/workflows/mobile-preview.yml\`

It runs on pushes to \`feature/v2.1-long-lecture-engine\` and can also be started manually from the Actions tab. Download the output under the run's Artifacts section.

- Android debug APK: suitable for installing on a test Android device; it is not a Play Store release.
- iOS Simulator app: suitable for simulator testing only; it cannot be installed on a physical iPhone or submitted to App Store Connect.

## Store release work still required

### Google Play

Google Play's current requirement for new apps and app updates is Android 16 / API level 36 or higher from 31 August 2026. The Android preparation script sets the target SDK to 36 when the generated Capacitor variables file is present.

Before submission:
1. Register a Google Play Console developer account.
2. Confirm the permanent application ID.
3. Create a protected Android upload keystore; never commit it.
4. Add signing secrets to GitHub Actions and create a signed Android App Bundle (\`.aab\`).
5. Complete the store listing, screenshots, app icon, content rating, Data safety form, privacy policy URL and testing-track requirements.
6. Test the signed release on real devices.

Google Play developer registration currently has a one-time US$25 fee. Fees and account verification requirements should be confirmed in Play Console.

### Apple App Store

Before submission:
1. Enroll in the Apple Developer Program.
2. Confirm the permanent bundle identifier.
3. Configure signing certificates, provisioning profiles and the App Store Connect API key.
4. Build and sign an iOS archive, upload it to App Store Connect, and distribute through TestFlight for device testing.
5. Complete app privacy disclosures, screenshots, age rating, support details, review notes and the privacy-policy URL.
6. Test microphone permissions, speech recognition, OCR and offline/local-library behavior on physical iPhones and iPads.

The Apple Developer Program currently costs US$99 per year (local pricing may vary). Capacitor 8 requires macOS with Xcode 26 or newer. Store approval is controlled by Apple and cannot be guaranteed.

## Cloud AI gateway

Deploy \`worker/\` separately to Cloudflare Workers. Follow \`worker/README.md\` and add provider credentials as Cloudflare Worker secrets. Configure a usage budget and review rate-limiting settings before sharing the app publicly.

## Voice and language notes

- Chat can respond in Egyptian Arabic, simplified Modern Standard Arabic, or English.
- Speech recognition requests the \`ar-EG\` locale by default.
- In the native mobile build, the Capgo speech-recognition plugin uses Android/iOS speech services. Locale availability and transcript quality depend on the device and operating-system speech service.
- Speech output uses the system/browser voice with locale \`ar-EG\`; a true Egyptian voice is available only when the device exposes one. StudyAI falls back to another Arabic voice when necessary.
- Speech recognition and speech synthesis are different capabilities; support for one does not guarantee support for the other.

## Privacy and data

The current app stores the student's library and review cards locally in IndexedDB. OCR runs locally in the browser/WebView after the OCR engine and language data are downloaded. When a student asks the AI to process lecture content, the selected text is sent to the configured provider through the secure proxy (for Groq/OpenRouter) or to the student's configured local/custom endpoint.

Review \`privacy.html\` before launch. If backend providers, analytics, login, cloud sync, ads, or new data collection are added, update the privacy policy and store privacy declarations before release.
