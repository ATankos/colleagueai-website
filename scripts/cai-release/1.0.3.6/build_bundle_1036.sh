#!/usr/bin/env bash
# Build the customer bundle CAI-L4-CI-001_1.0.3.6.zip.
#
#   scripts/cai-release/1.0.3.6/build_bundle_1036.sh <CAIContractIntelligence_1_0_3_6_managed.zip> <out-dir>
#
# Same as build-bundle.py with docs/cai-l4-ci-001/bundle as source, except that DOSSIER.pdf is the 1.0.3.6 dossier
# built here by build_dossier.py.
# Before anything is built, the managed solution is unpacked and checked with scripts/check-cai-solution-package.mjs
# (C1-C9, version 1.0.3.6). C8 fails when a cloud flow is exported Off, for example Daily recompute left Off in an
# idle authoring environment: a package that fails any check is never bundled.
# Needs python3 with reportlab and pypdf, pandoc, wkhtmltopdf, node and unzip. Output is byte-for-byte reproducible.
set -euo pipefail
managed="$(realpath "$1")"
out="$(realpath -m "$2")"
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir "$work/unpacked" "$work/src"
unzip -q "$managed" -d "$work/unpacked"
node "$repo/scripts/check-cai-solution-package.mjs" "$work/unpacked" --expect-version 1.0.3.6
src="$work/src"
cp "$repo/docs/cai-l4-ci-001/bundle/START-HERE.md" "$repo/docs/cai-l4-ci-001/bundle/LICENSE.txt" \
   "$repo/docs/cai-l4-ci-001/bundle/deploymentSettings.template.json" "$repo/docs/cai-l4-ci-001/bundle/MANIFEST.template.json" "$src/"
cp "$repo/docs/cai-l4-ci-001/INSTALL.md" "$src/INSTALL.md"
cp "$repo/scripts/check-cai-install-readiness.mjs" "$src/check-cai-install-readiness.mjs"
python3 -I "$here/build_dossier.py" "$src/DOSSIER.pdf"
mkdir -p "$out"
python3 -I "$repo/scripts/cai-release/build-bundle.py" "$managed" "$out" "$src"
