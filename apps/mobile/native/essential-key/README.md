# Ava on mobile — Nothing Essential Key

Experimental native Ava prompt for **Nothing phones with an Essential Key**. First hardware
verification used a Nothing A069 on Android 17 (scan code 250). Other phones, reboot and
locked-screen behavior have not been verified.

## Build-time opt-in

Normal builds exclude the service, screen bridge, UI, font and generated native resources. Enable only at
Expo prebuild / native build time:

```sh
AVENIRE_ESSENTIAL_KEY=1 EXPO_PUBLIC_API_URL=http://100.75.95.125:3001 pnpm --filter @avenire/mobile exec expo prebuild --platform android
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
movement. Ava is a service-owned `TYPE_ACCESSIBILITY_OVERLAY` window with window animations
set to zero. It does not launch an Activity, switch tasks, or rely on suppressing a system
Activity transition. The backdrop is fully black and the gradient frame is 3 dp thick. One stronger native
long-press haptic fires when the key-opened entry gains focus, respecting system haptics.
The popover composer is “Add a note”; hold switches it to “Ask Ava” without losing the
preview or draft. There is no diagnostic screen, top control strip, audio UI, or speech-to-text.

The UI uses Geist and native resources generated from `src/theme/tokens.ts` (colors and
composer radius), 44 dp controls, 15 sp input, and the mobile close/send icon paths. The
static gradient uses the home NightSky blue/indigo/purple tokens. Native resources are explicitly kept
from release resource shrinking because the shared preview source resolves them by name.

Screenshots are obtained by the opt-in accessibility service **before** opening Ava. Only
an explicit opening click/hold acquires an image; no background polling, window text access, or recording.
The hardware buffer is closed, a bounded-size preview is encoded off the main thread, and
one app-private cache file is retained. Secure windows and screenshot failures open a prompt
with an explicit unavailable-preview state. Holding again while Ava is visible reuses the
preview instead of photographing Ava itself.

## Ruth annotations

Send stays inside the overlay. An opt-in `AvaTaskService` runs authenticated Headless JS,
using the same mobile RPC and AI SDK streaming transport without starting an Activity. A
compact 96 dp answer above the composer streams only the latest paragraph; follow-ups reuse
the same server-owned thread. The native view replaces the previous answer on Send; complete conversation history remains on the server. Closing Ava aborts the active stream.
Sign-in/network errors appear in place. The standalone probe cannot send chat requests.

The registered `AvenireScreen` module retrieves the matching image only after checking
**Share screen with Ava** in Settings → Capture. The server independently checks the setting
before forwarding pixels. Opening/dismissing the preview never uploads it. Screenshots are
request-only model context, excluded from saved message/history parts; large images are
scaled for the shared wire limit while the local preview retains its original resolution.

Ruth can return the same `native_annotate` result used by desktop Qt: cursor/label bubbles,
rectangles and arrows, at normalized screenshot coordinates. A native Canvas renderer applies
validated completed results to the frozen image inside Ava's gradient frame. Empty item sets
clear the annotations. Partial tool streams never draw. The client preserves full explanatory
text as a fallback when native presentation fails. This also works for a screenshot of a PDF;
it does not edit or save annotations into the original PDF.

Each capture expires after five minutes and is invalidated by closing the overlay, a new
capture, account changes, service shutdown, or disabling sharing. Sending retains the preview and transcript in place for matching tool results. Both JS and Java validate
outputs; stale capture IDs/timestamps and out-of-bounds coordinates are rejected. The app
rechecks sharing before presentation and serializes replacement sets. It does not enable
Qt's desktop-only 3D/diagram/cursor-observation capabilities on mobile.

This uses the desktop screen contracts/server support from PR #14; PR #16 is stacked on it.
A complete opt-in native build is required for the RN bridge. The standalone APK exercises
the identical native renderer and key UI but has no React Native chat client.

Dismiss/back preserves one local event-associated text draft; a new key event starts a new
prompt. Configuration changes keep the same overlay and draft. An unavailable integrated chat runtime shows an error and keeps the text. The standalone validation APK includes the same service and overlay source as Avenire.
It has no launcher Activity; enable its accessibility service and use the physical key.
The production plugin also adds no Activity and removes legacy probe/entry Activities on
incremental prebuilds. Back and Close return the screenshot to the original display bounds over 200 ms while the
composer fades down, then remove the window. Reduced motion removes it immediately.
Interrupting, unbinding or destroying the service removes it immediately as well.

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
pnpm exec vp test run apps/mobile/src/features/native-screen/results.test.ts packages/ai/src/tools/native-overlay-policy.test.ts

# Optional real-device fixture tests (never included in the Expo plugin or normal probe):
AVENIRE_PROBE_TESTS=1 ./apps/mobile/native/essential-key/build-probe.sh
# Install using the device panel, enable the probe accessibility listener, then:
adb shell am broadcast -n com.thedamod.avenire.keyprobe/com.thedamod.avenire.essentialkey.NativeAnnotationTestReceiver --ez back true
# Remove the synthetic fixture, then reinstall the ordinary probe to remove the test receiver:
adb shell am broadcast -n com.thedamod.avenire.keyprobe/com.thedamod.avenire.essentialkey.NativeAnnotationTestReceiver --ez clear true
```

Android UiAutomation may suppress enabled accessibility services. Release the current
snapshot helper before a physical-key test and inspect logs (`AvenireEssentialKey`) and
screenshots without reconnecting snapshot instrumentation.

References:
- [Android screenshot API and secure-window errors](https://developer.android.com/reference/android/accessibilityservice/AccessibilityService#takeScreenshot(int,%20java.util.concurrent.Executor,%20android.accessibilityservice.AccessibilityService.TakeScreenshotCallback))
- [General Nothing key-filtering approach](https://github.com/KoukeNeko/EssentialKeyTools)
