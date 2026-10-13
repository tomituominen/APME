#!/bin/sh
# Rebuild attack-path-map.skill (a zip) from skills/attack-path-map/.
# The unzipped folder is the source of truth; tests/specs/skill.spec.js
# fails if the committed .skill drifts from it.
set -e
cd "$(dirname "$0")"
rm -f ../attack-path-map.skill
zip -X -q -r ../attack-path-map.skill attack-path-map -x '*.DS_Store'
echo "built attack-path-map.skill:"
unzip -Z1 ../attack-path-map.skill
