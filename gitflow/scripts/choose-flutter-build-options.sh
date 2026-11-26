#!/usr/bin/env bash
#
# Prints the options of a release build of a Flutter application, as lines meant for
# $GITHUB_ENV, shared by its Android and Linux builds:
#
#   BUILD_OPTIONS     options of "flutter build apk", "appbundle" and "linux"
#   PUB_GET_OPTIONS   options of "flutter pub get"
#
# A final version is built from the committed pubspec.yaml, which carries its version and
# its Android versionCode (see write-version-files.sh): F-Droid rebuilds it the same way. A
# release candidate is built before its version commit, so it gets them as options: "X.Y.Z",
# without the "-rc.N" that stores refuse, and the versionCode of "X.Y.Z".
#
# With a pinned Flutter, the lockfile is enforced, as in the quality job: a new stable
# release would otherwise change the versions imposed by the SDK.
#
# Usage: choose-flutter-build-options.sh <"candidate" or "final"> <version, for example "1.5.0-rc.2"> [Flutter version, empty for the latest stable]

set -o errexit -o nounset -o pipefail

SCRIPTS_DIRECTORY="$(cd "$(dirname "$0")" && pwd)"
readonly SCRIPTS_DIRECTORY

source "${SCRIPTS_DIRECTORY}/common.sh"

main() {
    local release_kind="$1"
    local version="$2"
    local flutter_version="${3:-}"

    local build_options='--release'
    if [ "${release_kind}" = 'candidate' ]; then
        local build_name="${version%%-*}"
        local build_number
        build_number=$(compute_android_version_code "${build_name}") || exit 1
        build_options="${build_options} --build-name=${build_name} --build-number=${build_number}"
    fi

    local pub_get_options=''
    if [ -n "${flutter_version}" ]; then
        pub_get_options='--enforce-lockfile'
    fi

    echo "BUILD_OPTIONS=${build_options}"
    echo "PUB_GET_OPTIONS=${pub_get_options}"
}

main "$@"
