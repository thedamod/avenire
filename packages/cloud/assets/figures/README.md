# Pinned Anatomy toolchain

Upstream: https://github.com/wheresryan22/anatomy
Commit: dbf697a527bbf7d358668e1557cb1e35ff725d46
License: MIT, copyright Ryan, wheresryan22 (see LICENSE).

Copied from the read-only context/anatomy checkout. SKILL.md, LICENSE, all kit,
scripts, references and all eight examples' source files are adapted for a neutral figure namespace. Generated HTML is excluded; rebuild it with Node. MANIFEST.json records
SHA-256 hashes of the adapted source files. Installed root-owned and read-only at
/opt/avenire/figures in avenire-sandbox-v6. CHROME_PATH=/usr/local/bin/avenire-figure-chromium, a Debian Chromium
launcher adding --no-sandbox because container user namespaces are unavailable.

Copy the kit/scripts and closest example into a writable workspace preserving
relative paths before building. React examples are source references; chat
figures use Node builds and inline runtime. No external packages are needed.

Local adaptations replace project branding and CSS token names with the figure
namespace. Original MIT copyright and license text are preserved. Upstream commit
identifies provenance; MANIFEST.json hashes the installed, adapted files.
