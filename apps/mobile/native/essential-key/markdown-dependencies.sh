#!/usr/bin/env bash
# Standalone probe dependencies; integrated builds resolve the pinned core through Gradle.
set -euo pipefail
dep_dir="$1"
mkdir -p "$dep_dir"
dep_dir="$(cd "$dep_dir" && pwd)"
fetch() {
  if [[ ! -s "$2" ]]; then
    curl -fsSL --retry 2 "$1" -o "$2.part"
    mv "$2.part" "$2"
  fi
}
fetch https://repo.maven.apache.org/maven2/io/noties/markwon/core/4.6.2/core-4.6.2.aar "$dep_dir/core.aar"
if [[ ! -s "$dep_dir/core.jar" ]]; then unzip -p "$dep_dir/core.aar" classes.jar > "$dep_dir/core.jar.part"; mv "$dep_dir/core.jar.part" "$dep_dir/core.jar"; fi
fetch https://repo.maven.apache.org/maven2/com/atlassian/commonmark/commonmark/0.13.0/commonmark-0.13.0.jar "$dep_dir/commonmark.jar"
fetch https://dl.google.com/dl/android/maven2/androidx/annotation/annotation/1.1.0/annotation-1.1.0.jar "$dep_dir/annotations.jar"
printf '%s:%s:%s\n' "$dep_dir/core.jar" "$dep_dir/commonmark.jar" "$dep_dir/annotations.jar"
