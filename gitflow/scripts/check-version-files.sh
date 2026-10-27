#!/usr/bin/env bash
#
# Checks that the files of the project that carry a version (pubspec.yaml, package.json,
# package-lock.json) carry the given one. The files are read from a git reference, so the
# check sees the branch as it will be merged. A missing file is skipped.
#
# A pubspec.yaml build number ("+12" in "1.5.0+12") is ignored.
#
# Usage: check-version-files.sh <version, for example "1.5.0"> [git reference, "HEAD" by default]

set -o errexit -o nounset -o pipefail

SCRIPTS_DIRECTORY="$(cd "$(dirname "$0")" && pwd)"
readonly SCRIPTS_DIRECTORY

source "${SCRIPTS_DIRECTORY}/common.sh"

main() {
    local expected_version="$1"
    local reference="${2:-HEAD}"
    local wrong_versions
    wrong_versions=$(list_wrong_versions "${expected_version}" "${reference}")

    if [ -z "${wrong_versions}" ]; then
        echo "Les fichiers de version portent bien ${expected_version}."
        return
    fi

    echo 'Fichiers en retard :' >&2
    echo "${wrong_versions}" >&2
    fail 'Fichiers de version en retard' "Les fichiers de version doivent porter ${expected_version}. Lancez le bouton (Run workflow) sur la branche de la pull request : il écrit la version et la pousse sur la branche. Ou mettez-les à jour à la main : « npm version ${expected_version} --no-git-tag-version » pour package.json, « version: ${expected_version} » dans pubspec.yaml."
}

# Prints "<file> : <version found>" for every version that differs from the expected one.
list_wrong_versions() {
    local expected_version="$1"
    local reference="$2"

    if file_exists "${reference}" pubspec.yaml; then
        local pubspec_version
        pubspec_version=$(git show "${reference}:pubspec.yaml" | read_pubspec_version)
        report_when_wrong 'pubspec.yaml' "${pubspec_version%%+*}" "${expected_version}"
    fi

    if file_exists "${reference}" package.json; then
        report_when_wrong 'package.json' "$(read_json_field "${reference}" package.json '.version // ""')" "${expected_version}"
    fi

    if file_exists "${reference}" package-lock.json; then
        report_when_wrong 'package-lock.json' "$(read_json_field "${reference}" package-lock.json '.version // ""')" "${expected_version}"

        # Since lockfileVersion 2, the root package is written a second time, under packages[""].
        if [ "$(read_json_field "${reference}" package-lock.json '(.packages // {}) | has("")')" = 'true' ]; then
            report_when_wrong 'package-lock.json (packages[""])' "$(read_json_field "${reference}" package-lock.json '.packages[""].version // ""')" "${expected_version}"
        fi
    fi
}

#=========#
# Helpers #
#=========#

file_exists() {
    local reference="$1"
    local file_path="$2"

    git cat-file -e "${reference}:${file_path}" 2> /dev/null
}

read_json_field() {
    local reference="$1"
    local file_path="$2"
    local jq_filter="$3"

    git show "${reference}:${file_path}" | jq --raw-output "${jq_filter}"
}

report_when_wrong() {
    local file_label="$1"
    local found_version="$2"
    local expected_version="$3"

    if [ "${found_version}" != "${expected_version}" ]; then
        echo "${file_label} : ${found_version:-absente}"
    fi
}

main "$@"
