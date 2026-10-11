#!/bin/sh
set -eu
# Release tag resolves to commit 2a8dd5aa1346d77539bf8196061260f353ee8d75.
url=https://codeload.github.com/vinceliuice/Graphite-gtk-theme/tar.gz/refs/tags/2026-08-23
curl -fsSL "$url" -o /tmp/graphite.tar.gz
printf '%s\n' 'a46a5c4bd9562332221c504a58da0d6f4d729c8a74ab26e002b41516df52acb9  /tmp/graphite.tar.gz' | sha256sum -c -
mkdir /tmp/graphite
 tar -xzf /tmp/graphite.tar.gz -C /tmp/graphite --strip-components=1
bash /tmp/graphite/install.sh -d /usr/share/themes -c dark --round 4
# This desktop uses GTK and XFWM only; discard other shell and HiDPI variants.
rm -rf /usr/share/themes/Graphite-Dark/cinnamon /usr/share/themes/Graphite-Dark/gnome-shell /usr/share/themes/Graphite-Dark/metacity-1 /usr/share/themes/Graphite-Dark/plank /usr/share/themes/Graphite-Dark-hdpi /usr/share/themes/Graphite-Dark-xhdpi
rm -rf /tmp/graphite /tmp/graphite.tar.gz
