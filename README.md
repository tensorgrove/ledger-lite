# Ledger Lite

A small React Native (Expo) wallet that shows how to move money safely from a mobile client:

- **Append-only ledger.** The balance is always derived from entries and never stored as a field you can overwrite.
- **Idempotency keys.** Each user action gets one key, and every retry reuses it. Turn on "Simulate flaky network" and the server commits the write but the response gets lost. The client retries, and the server replays the original entry instead of charging twice.
- **Versioned API contract.** Requests go to `/v1`, errors share one shape (`{ code, message, requestId }`), and the app sends its build number so the server can block builds that are too old.
- **Shareable logic.** `src/lib` and `src/theme.ts` are plain TypeScript with no React Native imports, so a React web app or a Node backend can use the same code.
- **Release pipeline.** EAS Build → TestFlight + Google Play internal track, triggered from GitHub Actions by pushing a tag.

```
App.tsx              UI (React Native core components only)
src/lib/ledger.ts    pure ledger logic (idempotent append, balance, money parsing)
src/lib/api.ts       mock server + client with exponential-backoff retries
src/theme.ts         design tokens
tests/               node:test unit tests for the ledger logic
eas.json             build/submit profiles
.github/workflows/   CI (typecheck + tests) and tag-triggered release
```

## Run locally

```bash
npm install
npx expo start        # scan the QR code with Expo Go
npm run typecheck
npm test
```

## Release setup

You only do this once.

**Accounts you need:** Expo (free), Apple Developer Program ($99/yr), Google Play Console ($25 one-time).

1. **Set your identifiers.** Replace `com.REPLACE_ME.ledgerlite` in `app.json` (iOS `bundleIdentifier` and Android `package`) with your own reverse-DNS name.
2. **Link the project to EAS.**
   ```bash
   npm i -g eas-cli
   eas login
   eas init            # writes the projectId into app.json
   ```
3. **iOS → TestFlight**
   ```bash
   eas build -p ios --profile production
   eas submit -p ios --latest
   ```
   On the first build, let EAS generate the distribution certificate and provisioning profile. On the first submit, it can create the App Store Connect app record and an App Store Connect API key for you. Put the app's numeric Apple ID (App Store Connect → App Information) into `submit.production.ios.ascAppId` in `eas.json`. The build appears in TestFlight once Apple finishes processing it, which usually takes 5–30 minutes.
4. **Android → Play internal track**
   - Create the app in Play Console.
   - **Google requires the first `.aab` to be uploaded by hand.** Run `eas build -p android --profile production`, download the `.aab`, and upload it to Internal testing in the Play Console. Let EAS manage the upload key, and enrol in Play App Signing.
   - Create a Google Cloud service account, give it Release-manager access in Play Console → Users and permissions, and download its JSON key. Upload the key with `eas credentials` → Android → Google Service Account. Don't commit it.
   - After that, `eas submit -p android --latest` works without manual steps.
   - `releaseStatus` is `draft` because Google rejects non-draft releases until the app has finished its first review. Once that's done, switch it to `completed`.
5. **Automate it from GitHub.**
   - Create a token at expo.dev → Account settings → Access tokens, then add it as the repository secret `EXPO_TOKEN`.
   - Push a tag:
     ```bash
     git tag v1.0.1 && git push origin v1.0.1
     ```
   - The workflow typechecks, runs the tests, then builds both platforms on EAS and submits them automatically. `autoIncrement` with `appVersionSource: remote` means EAS manages the build numbers, so you never edit them by hand.

## Going further

- **EAS Update** for JS-only fixes: `npx expo install expo-updates`, then `eas update --branch production`. Logic that touches money stays on the server, so an over-the-air update can't change it.
- **Expo Router** if the app grows past one screen.
- Swap the mock server for a real Node/TypeScript API using the same contract.
