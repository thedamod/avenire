#!/usr/bin/env bash
# Standalone diagnostic APK using the exact Java service included by the Expo plugin.
set -euo pipefail
source_dir="$(cd "$(dirname "$0")" && pwd)"
sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
build_tools="$sdk/build-tools/36.0.0"
android_jar="$sdk/platforms/android-36/android.jar"
output="${1:-/tmp/avenire-essential-key}"
mkdir -p "$output"
output="$(cd "$output" && pwd)"
rm -rf "$output/classes" "$output/dex" "$output/resources"
mkdir -p "$output/classes" "$output/dex"
cp -R "$source_dir/res" "$output/resources"
node "$source_dir/generate-design.cjs" "$output/resources"
"$build_tools/aapt2" compile --dir "$output/resources" -o "$output/resources.zip"
cp "$source_dir/AndroidManifest.xml" "$output/AndroidManifest.xml"
if [[ "${AVENIRE_PROBE_TESTS:-0}" == "1" ]]; then
  python - "$output/AndroidManifest.xml" <<'PYTEST'
import sys
p = sys.argv[1]
s = open(p).read().replace('</application>', '<receiver android:name="com.thedamod.avenire.essentialkey.NativeAnnotationTestReceiver" android:exported="true" android:permission="android.permission.DUMP" /></application>')
open(p, 'w').write(s)
PYTEST
fi
"$build_tools/aapt2" link -o "$output/unsigned.apk" -I "$android_jar" --manifest "$output/AndroidManifest.xml" "$output/resources.zip"
mapfile -t sources < <(find "$source_dir/src" -name '*.java' ! -name 'AvenireScreenModule.java' ! -name 'AvenireScreenPackage.java' ! -name 'AvaTaskService.java')
if [[ "${AVENIRE_PROBE_TESTS:-0}" == "1" ]]; then sources+=("$source_dir/tests/android/NativeAnnotationTestReceiver.java"); fi
javac --release 8 -classpath "$android_jar" -d "$output/classes" "${sources[@]}"
mapfile -t classes < <(find "$output/classes" -name '*.class')
"$build_tools/d8" --lib "$android_jar" --min-api 31 --output "$output/dex" "${classes[@]}"
(cd "$output/dex" && zip -q "$output/unsigned.apk" classes.dex)
"$build_tools/zipalign" -f 4 "$output/unsigned.apk" "$output/aligned.apk"
if [[ ! -f "$output/debug.keystore" ]]; then
  keytool -genkeypair -keystore "$output/debug.keystore" -storepass android -keypass android -alias androiddebugkey -dname 'CN=Avenire Input Probe' -keyalg RSA -validity 3650 >/dev/null 2>&1
fi
"$build_tools/apksigner" sign --ks "$output/debug.keystore" --ks-pass pass:android --out "$output/avenire-key-input.apk" "$output/aligned.apk"
"$build_tools/apksigner" verify "$output/avenire-key-input.apk"
printf '%s\n' "$output/avenire-key-input.apk"
