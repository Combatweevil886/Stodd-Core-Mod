#!/bin/sh
# Offline type-check of the whole mod (no Minecraft download needed): generates compile-only models of the Minecraft / Forge
# classes the mod uses (tools/gen_stubs.py) and compiles everything against them with every warning as an error.
# The real build is ./gradlew build; this only catches mistakes in STODD's own code.
set -e
cd "$(dirname "$0")/.."
rm -rf build/stubs build/typecheck
python3 tools/gen_stubs.py build/stubs
javac --release 17 -Xlint:all,-processing,-serial -Werror -d build/typecheck $(find build/stubs src/main/java src/test/java -name '*.java')
echo "typecheck OK"
