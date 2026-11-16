# Ava on Android

Ava can open over the current app on Android 12+ through the system accessibility
shortcut, a default-assistant gesture, an OEM app shortcut, or a home-screen widget.
Nothing phones additionally support the Essential Key. The existing native namespace
and service component stay stable so an upgrade retains the accessibility grant;
Android may still ask the user to re-enable the service after its capabilities change.

## Build and setup

Android builds include Ava by default. `AVENIRE_ANDROID_AVA=0` at Expo prebuild removes
all owned native components, bridge, fonts and resources; iOS is unaffected. Android versions below 12 keep the ordinary app but disable Ava native components. A new native build is required; OTA JavaScript never uses an older bridge that lacks the policy gate. The
`internal-android-ava` EAS profile enables it explicitly. The legacy
`internal-essential-key` profile remains compatible, but no longer limits Ava to Nothing.

1. Settings → Capture → Android shortcuts → Enable Ava shortcut. Enable **Avenire Ava**
   in Accessibility and choose the system-provided accessibility button/gesture.
2. Optionally select Ava as the default digital assistant. Assign power/Home/assistant
   gestures in the phone's own Settings. Android and the manufacturer determine the
   available gestures; Avenire does not intercept power, Home or emergency gestures.
   Double-press power is not a portable third-party API. OEM app remapping can target
   the exported `AvaEntryActivity` (`ACTION_ASSIST` or `com.thedamod.avenire.OPEN_AVA`).
3. Add **Ask Ava** through Settings or the launcher's widget picker. Widgets open a
   text-only dock, or Ask Ava in the app when the overlay service is unavailable: the previously used app is no longer foreground and cannot be captured.
4. On Nothing, the Essential Key listener can be turned off independently in Avenire
   Settings. It only filters scan code 250 when the manufacturer is Nothing and the
   listener is enabled. Freeing the key from Nothing's stock handlers remains a manual
   device setup step (see below).

## Screen policy

The same native gate guards preview acquisition, the second-press capture hook,
request-only screen delivery and annotation presentation. It is independent of the
Share screen with Ava setting: consent never overrides a policy exclusion.

`packages/capture/src/android-policy.json` owns Android package/category exclusions.
Prebuild and the native probe generate `AndroidScreenPolicy.java` from it. Known mail,
messaging, password, financial, social and DRM apps are excluded, with label checks for
other obvious sensitive apps. This is a best-effort blocklist, not a classification of
all installed apps. New sensitive packages belong in this policy file.

The service requests interactive-window metadata to establish the source package,
window identity and single-app context. In browsers it additionally inspects only known
address-bar controls and private-mode indicators, skipping the page's accessibility
tree, form values and password fields. Normal browser pages are allowed when a visible
address bar identifies a permitted public URL. Incognito/private/secret tabs and
always-private browsers are excluded. A hidden or unrecognized browser toolbar cannot
establish a safe source. Browser URLs use the same host, path and nested-URL exclusions
as desktop capture; opening Ava never fetches that URL.

Locked screens, launchers, system dialogs, unknown source metadata, multiple application
windows and other accessibility overlays are excluded too. On Android 14+ the screenshot
targets the validated application window; Android 12–13 use a display screenshot after
the single-app check. Secure-window screenshot errors are respected. Excluded screens
open text-only Ava with a shield and “Screen Capture can't access private windows and
screens” and never acquire pixels.

A screenshot is checked again before publishing the preview and before returning bytes
to JS. JS rechecks policy after thread/auth work at the transport boundary. Navigation
invalidates the session and pending acquisition callbacks. Acquisition uses a per-request
temporary image; stale work cannot overwrite a newer preview.

## Original capture, extraction and Undo

Open a normal browser page and invoke the screen-context shortcut once (or press the
Essential Key on Nothing) for a frozen preview. Add an optional note, then invoke it
again or tap the capture arrow. Ava closes and a small top receipt shows **Getting
original**, upload and extraction progress, with an animated background and **Undo**.
The preview remains request-only screen context; it is not the saved browser source.

Browser capture acquires the complete anonymously accessible HTML or PDF from the
validated URL. Every redirect is checked against the shared URL exclusions; credentials,
browser cookies and private-network destinations are not used. Acquisition is bounded
by time and bytes. Failure offers Retry/Undo and explains when to share the original;
it never silently uploads screenshot bytes as a replacement document. Authenticated,
paywalled or JavaScript-only pages may require an original supplied by their app.

For native documents, audio and video, select **Ava** as Android's default digital
assistant, then invoke the shortcut twice over the open file. Ava asks Android for the
focused app's `AssistContent`: an explicitly granted original `content://` URI or public
URL. It copies granted bytes before closing the assistant session. It does not inspect
AssistStructure, scrape document text, or take over dictation.
The app must supply a readable original; a playback identifier or webpage link is not
an audio/video file. Unsupported players offer **Share → Avenire** instead. Protected
and excluded apps remain excluded even when an assistant handoff is available.

Google Drive's internal viewer does not provide a readable original through the assistant
handoff. For Drive, Docs, Sheets and Slides, the second capture press now dismisses Ava
and tries to open **Send a copy** (including opening accessible More options and
**Share and export** menus).
It never clicks Google's collaborator **Share** action. Adobe Reader, Microsoft Word,
Excel and PowerPoint, and WPS use the same bounded fallback for recognizable **Share**,
**Share file**, or **Send a copy** controls. The destination list is unchanged: the user
selects Avenire. No destination, permission, export format or confirmation is selected
automatically. If another menu or export picker appears, the user completes it.

Only exact English control labels are currently recognized. Navigation is limited to
three seconds, one overflow click and one export-submenu click. It stops at the first sharing action, app switch,
system dialog, lock or external overlay. Unknown controls fall back to manual instructions.
This inspects toolbar/menu control labels; document bodies, forms and passwords remain
unread. This new navigation requires hardware validation across app versions and locales;
source compilation and label-policy tests do not establish device support.

The explicit Share receiver copies PDFs and ordinary uploaded files when the source
grants access. For virtual Google Docs/Sheets/Slides documents,
Ava requests a provider-advertised Office export, then PDF as a fallback. A Drive webpage
or sign-in page is never saved as the original document. Providers that do not grant
an export require **Send a copy → Avenire**. This does not connect or sync an entire
Google Drive account.

Before this navigation fallback, Drive's internal `InternalProjectorActivity` was
reproduced on the Nothing phone returning only a `projector-id:` intent, with no
content grant or public URL. That assistant response cannot supply original bytes.
Opaque viewer IDs are never treated as file paths or downloaded as documents.

The Share receiver accepts explicitly granted `content://` streams and applies known
provider-app exclusions. It accepts individual or multiple files (up to 32); shared
public URLs use the same original acquisition path. A raw filesystem path never grants
access. Audio/video originals use the existing media extraction pipeline.
An account-bound native outbox persists capture identity, source metadata and original
bytes. Downloaded originals replace the staged acquisition input atomically before any upload ticket
is created. Persisted network-constrained jobs resume offline/interrupted work. The
outbox allows 32 pending originals, 32 MiB per original and 256 MiB retained bytes.
Failed originals remain for Retry/Undo; confirmed publication or settled cancellation
removes local bytes. Another account cannot upload the queue.

The existing files-sdk protocol streams originals through authenticated idempotent upload
tickets. HTML uses the full document parser; PDFs and shared office files use their
existing extractors. Chunking, embeddings, graph indexing and folder placement follow.
Mobile web provenance retains its source URL, capture identity and optional note. The
source remains a webpage/PDF/document in the library rather than an image. The model's
invalid-JSON graph response gets one constrained retry; persistent failures stay visible.

The receipt follows queued/acquiring/uploading/extracting/ready/partial/paused/failed
states. Retry and Undo remain actionable on failure. Undo settles upload/publication
races or archives a newly created item and fences extraction publication. A duplicate
preserves the existing original; undoing every receipt of a newly created item archives
it in either order. Archived originals remain recoverable. Completed receipts dismiss
after 12 seconds; dismissal does not cancel work or reappear on every progress update.
The service restores the latest unfinished receipt after reconnecting.

Home widgets remain text-only entry points: the previous app is no longer foreground.
Hold the Essential Key to switch to **Ask Ava**; Send in that mode asks about the preview
under the separate Share screen with Ava consent.

## Interaction

The accessibility/assistant shortcut opens the popover; a second invocation requests capture. On Nothing, one key click opens the popover immediately. Another click while it is opening or visible saves
the validated original through the durable capture pipeline. Hold the Essential Key for 500 ms to open the Ava text dock instead. Releasing a hold
never emits a click. A frozen screenshot is fitted into the space
above the bottom composer, with a gradient around the **whole image**, not the composer.
The image resizes with the keyboard. The screenshot starts at the original display bounds and pulls inward into its frame over
250 ms; only the composer rises/fades over 200 ms. Android's disabled-animation setting skips
movement. Ava is a service-owned `TYPE_ACCESSIBILITY_OVERLAY` window, using a fresh display-bound
accessibility window context after reconnects, with window animations
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
an explicit opening click/hold acquires an image; no background screenshot polling or recording. Window/package metadata and the bounded browser-toolbar inspection are used only for policy and navigation invalidation.
The hardware buffer is closed, a bounded-size preview is encoded off the main thread, and
an app-private preview and original are retained for the active session. Secure windows and screenshot failures open a prompt
with an explicit unavailable-preview state. Holding again while Ava is visible reuses the
preview instead of photographing Ava itself.

## Ruth annotations

Send stays inside the overlay. An opt-in `AvaTaskService` runs authenticated Headless JS,
using the same mobile RPC and AI SDK streaming transport without starting an Activity. A
compact 96 dp answer above the composer streams only the latest paragraph; follow-ups reuse
the same server-owned thread. The native view replaces the previous answer on Send; complete conversation history remains on the server. Closing Ava aborts the active stream.
Sign-in/network errors appear in place. The latest answer renders native CommonMark spans:
bold, italics, headings, lists, quotes, inline/fenced code, and web links. Code uses Geist Mono;
ordinary text retains Geist. Fenced code stays together when selecting the latest chunk.
Web links open only after a tap and dismiss Ava; other URI schemes are ignored. The Markdown
dependency and fonts are covered by the same native build flag. The standalone probe cannot
send chat requests.

The registered `AvenireScreen` module retrieves the matching image only after checking
**Share screen with Ava** in Settings → Capture. The server independently checks the setting
before forwarding pixels. Opening/dismissing the preview never uploads it. Screenshots are
request-only model context, excluded from saved message/history parts; large images are
scaled for the shared wire limit while the local preview retains its original resolution.

Ruth can return the same `native_annotate` result used by desktop Qt: cursor/label bubbles,
rectangles and arrows, at normalized screenshot coordinates. The current platform, viewport
width and capture size are passed into Ruth’s prompt. Shared layout guidance allows labels
away from targets with leader arrows. The mobile renderer sizes callouts to their content,
keeps an 8 dp gap between boxes, reserves target points, and honors independent
`labelPosition` hints. If no free position remains it omits that text box rather than
covering another label; target markers remain. A native Canvas renderer applies
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
The production plugin adds windowless assistant/shortcut and Share entry Activities and removes legacy probe Activities on incremental prebuilds. Back and Close return the screenshot to the original display bounds over 200 ms while the
composer fades down, then remove the window. Reduced motion removes it immediately.
Interrupting, unbinding or destroying the service removes it immediately as well.

## Phone setup and restore

Enable **Avenire Ava** under Settings → Accessibility → Downloaded apps. Use one
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
javac -d /tmp/avenire-key-tests \
  apps/mobile/native/essential-key/src/com/thedamod/avenire/essentialkey/ShareControls.java \
  apps/mobile/native/essential-key/tests/ShareControlsTest.java
java -cp /tmp/avenire-key-tests com.thedamod.avenire.essentialkey.ShareControlsTest
./apps/mobile/native/essential-key/build-probe.sh
# Output: /tmp/avenire-essential-key/avenire-key-input.apk
pnpm exec vp test run apps/mobile/src/features/native-screen/results.test.ts packages/ai/src/tools/native-overlay-policy.test.ts

# Optional real-device fixture tests (never included in the Expo plugin or normal probe):
AVENIRE_PROBE_TESTS=1 ./apps/mobile/native/essential-key/build-probe.sh
# Install using the device panel, enable the probe accessibility listener, open a permitted study app, then:
adb shell am broadcast -n com.thedamod.avenire.keyprobe/com.thedamod.avenire.essentialkey.NativeAnnotationTestReceiver --ez back true
# Remove the synthetic fixture, then reinstall the ordinary probe to remove the test receiver:
adb shell am broadcast -n com.thedamod.avenire.keyprobe/com.thedamod.avenire.essentialkey.NativeAnnotationTestReceiver --ez clear true
```

Android UiAutomation may suppress enabled accessibility services. Release the current
snapshot helper before a physical-key test and inspect logs (`AvenireEssentialKey`) and
screenshots without reconnecting snapshot instrumentation.

Additional validation:

```sh
node apps/mobile/native/essential-key/generate-policy.cjs /tmp/ava-policy
javac -d /tmp/ava-policy /tmp/ava-policy/AndroidScreenPolicy.java apps/mobile/native/essential-key/tests/AndroidScreenPolicyTest.java
java -cp /tmp/ava-policy com.thedamod.avenire.essentialkey.AndroidScreenPolicyTest
```

Hardware validation is still required for assistant role eligibility, OEM power/Home
assignment, widget pinning, screen metadata and accessibility shortcuts on each phone.
Nothing's hardware listener does not establish support for other manufacturers' keys.

References:

- [Android application sandbox](https://source.android.com/docs/security/app-sandbox)
- [Android assistant role](https://developer.android.com/reference/android/app/role/RoleManager#ROLE_ASSISTANT)
- [Android original-content handoff](https://developer.android.com/reference/android/app/assist/AssistContent)
- [Android shared payloads](https://developer.android.com/training/sharing/receive)
- [Android screenshot API and secure-window errors](<https://developer.android.com/reference/android/accessibilityservice/AccessibilityService#takeScreenshot(int,%20java.util.concurrent.Executor,%20android.accessibilityservice.AccessibilityService.TakeScreenshotCallback)>)
- [General Nothing key-filtering approach](https://github.com/KoukeNeko/EssentialKeyTools)

## Device QA cleanup

Android UiAutomation can suspend every accessibility service while leaving its enabled
setting intact. Always close the agent-device session before testing a physical key or
widget, and verify that the signed Avenire service is bound. Do not leave a diagnostic
probe installed on a user device after a test. The probe declines the Essential Key when
the integrated app is installed, and its service/widget labels explicitly identify it
as a test probe. Widgets fall back to Ask Ava in the app when the service is unavailable;
only a screen-context shortcut with a disabled service opens accessibility setup.
