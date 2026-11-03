#!/usr/bin/env bash
#
# Tells which Flutter version a job must install, and prints it as a "version=<value>" line
# meant for $GITHUB_OUTPUT. Run from the root of the project.
#
# The rules are read from top to bottom, the first one that matches wins:
#
#   "flutter-version" input filled                 →  that value, as is
#   environment.flutter of pubspec.yaml is X.Y.Z   →  that version
#   anything else (no key, range such as ">=3.0.0")  →  empty, which subosito/flutter-action
#                                                       reads as the latest version of its
#                                                       channel, with a warning
#
# The "flutter-version-file" input of subosito/flutter-action cannot replace this script: it
# refuses to be combined with "flutter-version", and fails on a missing key or a range.
#
# Usage: resolve-flutter-version.sh <value of the "flutter-version" input, can be empty>

set -o errexit -o nounset -o pipefail

SCRIPTS_DIRECTORY="$(cd "$(dirname "$0")" && pwd)"
readonly SCRIPTS_DIRECTORY

source "${SCRIPTS_DIRECTORY}/common.sh"

main() {
    local requested_version="$1"

    if [ -n "${requested_version}" ]; then
        echo "version=${requested_version}"
        return
    fi

    local declared_version
    declared_version=$(read_declared_flutter_version)

    if [[ "${declared_version}" =~ ^${VERSION_PATTERN}$ ]]; then
        echo "version=${declared_version}"
        return
    fi

    warn_about_latest_stable_version "${declared_version}"
    echo 'version='
}

# Prints the "flutter:" value of the "environment:" block of pubspec.yaml, without quotes nor
# comment. Prints nothing when there is none. A pubspec.yaml has other "flutter:" keys (the
# top-level section, the SDK dependency): only the one of this block counts.
read_declared_flutter_version() {
    if [ ! -f pubspec.yaml ]; then
        return
    fi

    sed --quiet --regexp-extended \
        "/^environment:/,/^[^[:space:]#]/ { s/^[[:space:]]+flutter:[[:space:]]*['\"]?([^'\"#]*[^'\"#[:space:]])?.*/\1/p }" \
        pubspec.yaml
}

warn_about_latest_stable_version() {
    local declared_version="$1"

    local reason='environment.flutter est absent du pubspec.yaml'
    if [ -n "${declared_version}" ]; then
        reason="environment.flutter vaut « ${declared_version} » dans le pubspec.yaml, ce qui n'est pas une version exacte (X.Y.Z)"
    fi

    echo "::warning title=Version de Flutter non fixée::${reason} : ce job utilise la dernière version stable de Flutter. Pour fixer la version, déclarez « flutter: X.Y.Z » dans environment, ou renseignez l'option flutter-version." >&2
}

main "$@"
