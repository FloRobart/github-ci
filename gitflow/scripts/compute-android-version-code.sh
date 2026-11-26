#!/usr/bin/env bash
#
# Prints the Android versionCode of a version, for example "1005002" for "1.5.2": see
# compute_android_version_code in common.sh. The same code is written in pubspec.yaml by
# write-version-files.sh, so a build given this code matches a build of the committed files.
#
# Usage: compute-android-version-code.sh <version, for example "1.5.2">

set -o errexit -o nounset -o pipefail

SCRIPTS_DIRECTORY="$(cd "$(dirname "$0")" && pwd)"
readonly SCRIPTS_DIRECTORY

source "${SCRIPTS_DIRECTORY}/common.sh"

compute_android_version_code "$1"
