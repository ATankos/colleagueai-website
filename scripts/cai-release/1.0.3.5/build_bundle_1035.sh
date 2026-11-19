#!/usr/bin/env bash
# Build the customer bundle CAI-L4-CI-001_1.0.3.5.zip.
#
#   scripts/cai-release/1.0.3.5/build_bundle_1035.sh <CAIContractIntelligence_1_0_3_5_managed.zip> <out-dir>
#
# Same as build-bundle.py with docs/cai-l4-ci-001/bundle as source, except that DOSSIER.pdf is the 1.0.3.5 dossier
# built here by build_dossier.py. The dossier on the website (public/docs/agents/contract-intelligence-and-register.pdf)
# describes the release that is on sale and changes only when 1.0.3.5 is released.
# Needs python3 with reportlab and pypdf, pandoc and wkhtmltopdf. Output is byte-for-byte reproducible.
set -euo pipefail
managed="$(realpath "$1")"
out="$(realpath -m "$2")"
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
src="$(mktemp -d)"
trap 'rm -rf "$src"' EXIT
cp "$repo/docs/cai-l4-ci-001/bundle/START-HERE.md" "$repo/docs/cai-l4-ci-001/bundle/LICENSE.txt" \
   "$repo/docs/cai-l4-ci-001/bundle/deploymentSettings.template.json" "$repo/docs/cai-l4-ci-001/bundle/MANIFEST.template.json" "$src/"
cp "$repo/docs/cai-l4-ci-001/INSTALL.md" "$src/INSTALL.md"
cp "$repo/scripts/check-cai-install-readiness.mjs" "$src/check-cai-install-readiness.mjs"
python3 -I "$here/build_dossier.py" "$src/DOSSIER.pdf"
mkdir -p "$out"
python3 -I "$repo/scripts/cai-release/build-bundle.py" "$managed" "$out" "$src"
