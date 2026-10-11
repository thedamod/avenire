#!/bin/sh
# Xfce creates monitor keys after its desktop process starts. Retry briefly on first login.
wallpaper=/usr/share/backgrounds/avenire/wallpaper.png
attempt=0
while [ "$attempt" -lt 20 ]; do
  if command -v xfconf-query >/dev/null 2>&1; then
    properties=$(xfconf-query -c xfce4-desktop -lv 2>/dev/null | awk '$1 ~ /\/last-image$/ { print $1 }')
    if [ -n "$properties" ]; then
      printf '%s\n' "$properties" | while IFS= read -r property; do
        xfconf-query -c xfce4-desktop -p "$property" -s "$wallpaper" >/dev/null 2>&1 || true
      done
      exit 0
    fi
  fi
  attempt=$((attempt + 1))
  sleep 1
done
# Some first sessions expose no keys yet; a harmless default is available for next login.
xfconf-query -c xfce4-desktop -p /backdrop/screen0/monitor0/workspace0/last-image \
  --create -t string -s "$wallpaper" >/dev/null 2>&1 || true
exit 0
