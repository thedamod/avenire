# Ava on mobile — Nothing Essential Key

Experimental native Ava prompt for **Nothing phones with an Essential Key**. First hardware
verification used a Nothing A069 on Android 17 (scan code 250). Other phones, reboot and
locked-screen behavior have not been verified.

## Build-time opt-in

Normal builds exclude the service, UI, font and generated native resources. Enable only at
Expo prebuild / native build time:

```sh
AVENIRE_ESSENTIAL_KEY=1 pnpm --filter @avenire/mobile exec expo prebuild --platform android
AVENIRE_ESSENTIAL_KEY=1 pnpm --filter @avenire/mobile android
# Opt-in EAS profile (extends internal):
pnpm --filter @avenire/mobile exec eas build --platform android --profile internal-essential-key
```

The ordinary `internal` profile stays off. Unset the flag and rerun prebuild to remove owned
manifest entries, sources and resources, including during incremental prebuilds. OTA updates
cannot enable native code; iOS is unaffected.

## Interaction

One click opens the popover immediately. Another click while it is opening or visible calls
the capture integration hook (currently an explicit “not configured yet” message; no file is
saved). Hold the Essential Key for 500 ms to open the Ava text dock instead. Releasing a hold
never emits a click. A frozen screenshot is fitted into the space
above the bottom composer, with a gradient around the **whole image**, not the composer.
The image resizes with the keyboard. The screenshot starts at the original display bounds and pulls inward into its frame over
250 ms; only the composer rises/fades over 200 ms. Android's disabled-animation setting skips
movement. The launch options, Activity transition override and theme disable Android's
separate window animation so it cannot slide the entire preview upward. One native
confirmation haptic fires when the key-opened entry gains focus, respecting system haptics.
The popover composer is “Add a note”; hold switches it to “Ask Ava” without losing the
preview or draft. There is no diagnostic screen, top control strip, audio UI, or speech-to-text.

The UI uses Geist and native resources generated from `src/theme/tokens.ts` (colors and
composer radius), 44 dp controls, 15 sp input, and the mobile close/send icon paths. The
static gradient uses existing accent/green/amber tokens. Native resources are explicitly kept
from release resource shrinking because the shared preview source resolves them by name.

Screenshots are obtained by the opt-in accessibility service **before** opening Ava. Only
an explicit opening click/hold acquires an image; no background polling, window text access, or recording.
The hardware buffer is closed, a bounded-size preview is encoded off the main thread, and
one app-private cache file is retained. Secure windows and screenshot failures open a prompt
with an explicit unavailable-preview state. Holding again while Ava is visible reuses the
preview instead of photographing Ava itself.

**Screen context is not wired into Ruth yet.** Send opens the existing `avenire://ask?q=…`
route with typed text only. The preview is local visual context for this initial UI. Attaching
the image to a Ruth request requires the later capture/attachment contract and client wiring;
this PR does not claim the model can see it. No image is uploaded implicitly.

Dismiss/back preserves one local event-associated text draft; a new key event starts a new
prompt. Process recreation restores it. A missing Avenire route shows an error and keeps the
text. The standalone validation APK exports Ava as a launcher so the same native source can
be tested without a full React Native build. Production entry activities remain private.

## Phone setup and restore

Enable **Avenire Essential Key** under Settings → Accessibility → Downloaded apps. Use one
listener at a time (standalone preview or integrated Avenire). The service filters only scan
code 250, not all Android `KEYCODE_UNKNOWN` keys. Its accessibility description explicitly
discloses the new screenshot capability; re-enable the service after updating if Android
requires approval of that capability.

Nothing's own handlers consume the key before app input. Free it with ADB (no root or data
removal; the app does not perform this automatically):

```sh
adb shell pm disable-user --user 0 com.nothing.ntessentialspace
adb shell pm disable-user --user 0 com.nothing.ntessentialrecorder
```

Restore the package-default enabled state:

```sh
adb shell pm default-state --user 0 com.nothing.ntessentialspace
adb shell pm default-state --user 0 com.nothing.ntessentialrecorder
```

Disable Avenire's accessibility service to stop key interception. Restoring Nothing's
handlers restores their key behavior, including their original capture/recorder features.

## Validation

Requires JDK 17+, Android SDK platform 36 and build-tools 36.0.0:

```sh
node --test apps/mobile/plugins/with-essential-key.test.cjs
javac -d /tmp/avenire-key-tests \
  apps/mobile/native/essential-key/src/com/thedamod/avenire/essentialkey/KeyGesture.java \
  apps/mobile/native/essential-key/tests/KeyGestureTest.java
java -cp /tmp/avenire-key-tests com.thedamod.avenire.essentialkey.KeyGestureTest
./apps/mobile/native/essential-key/build-probe.sh
# Output: /tmp/avenire-essential-key/avenire-key-input.apk
```

Android UiAutomation may suppress enabled accessibility services. Release the current
snapshot helper before a physical-key test and inspect logs (`AvenireEssentialKey`) and
screenshots without reconnecting snapshot instrumentation.

References:
- [Android screenshot API and secure-window errors](https://developer.android.com/reference/android/accessibilityservice/AccessibilityService#takeScreenshot(int,%20java.util.concurrent.Executor,%20android.accessibilityservice.AccessibilityService.TakeScreenshotCallback))
- [General Nothing key-filtering approach](https://github.com/KoukeNeko/EssentialKeyTools)
