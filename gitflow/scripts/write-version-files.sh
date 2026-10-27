#!/usr/bin/env bash
#
# Writes a version into the files of the project that carry one, so that they follow
# the published versions. Run from the root of the project. A missing file is skipped.
#
#   pubspec.yaml                      "version:" line, the "+N" build number is kept
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

# The build number ("+12" in "1.4.0+12") is the Android version code of a local build,
# not a part of the version: it is kept. The CI passes its own build number.
write_pubspec_version() {
    local version="$1"
    local current_version
    current_version=$(read_pubspec_version < pubspec.yaml)

    if [ -z "${current_version}" ]; then
        echo "version: ${version}" >> pubspec.yaml
        return
    fi

    local build_number_suffix=''
    if [[ "${current_version}" == *+* ]]; then
        build_number_suffix="+${current_version#*+}"
    fi

    sed --in-place --regexp-extended "s/^version:.*/version: ${version}${build_number_suffix}/" pubspec.yaml
}

# "npm version" keeps the indentation of package.json and also updates package-lock.json.
write_package_version() {
    local version="$1"

    npm version "${version}" --no-git-tag-version --allow-same-version --ignore-scripts > /dev/null
}

main "$@"
