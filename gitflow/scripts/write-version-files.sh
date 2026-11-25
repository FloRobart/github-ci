#!/usr/bin/env bash
#
# Writes a version into the files of the project that carry one, so that they follow
# the published versions. Run from the root of the project. A missing file is skipped.
#
#   pubspec.yaml                      "version:" line, with the Android versionCode as build
#                                     number: "1.5.0+1005000", see format_pubspec_version
#   package.json, package-lock.json   "version" field, through "npm version"
#
# Usage: write-version-files.sh <version, for example "1.5.0">

set -o errexit -o nounset -o pipefail

SCRIPTS_DIRECTORY="$(cd "$(dirname "$0")" && pwd)"
readonly SCRIPTS_DIRECTORY

source "${SCRIPTS_DIRECTORY}/common.sh"

main() {
    local version="$1"

    if [ -f pubspec.yaml ]; then
        write_pubspec_version "${version}"
    fi

    if [ -f package.json ]; then
        write_package_version "${version}"
    fi
}

# The build number ("+1005000" in "1.5.0+1005000") is the Android versionCode, computed from
# the version: the committed pubspec.yaml then builds exactly the APK of the release, as
# F-Droid does when it rebuilds a version from its tag. pub.dev drops it from a library.
write_pubspec_version() {
    local version="$1"
    local pubspec_version
    pubspec_version=$(format_pubspec_version "${version}")

    if grep --quiet '^version:' pubspec.yaml; then
        sed --in-place --regexp-extended "s/^version:.*/version: ${pubspec_version}/" pubspec.yaml
        return
    fi

    echo "version: ${pubspec_version}" >> pubspec.yaml
}

# "npm version" keeps the indentation of package.json and also updates package-lock.json.
write_package_version() {
    local version="$1"

    npm version "${version}" --no-git-tag-version --allow-same-version --ignore-scripts > /dev/null
}

main "$@"
