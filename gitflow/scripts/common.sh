#!/usr/bin/env bash
#
# Helpers shared by the gitflow scripts. This file is sourced, never executed.

# The patterns below are used by the scripts that source this file, not by this file:
# shellcheck disable=SC2034

#==========#
# Patterns #
#==========#

# The "X.Y.Z" part of a version, for example "1.4.2".
readonly VERSION_PATTERN='[0-9]+\.[0-9]+\.[0-9]+'

# A final version tag, for example "v1.4.2". Release candidate tags ("v1.4.2-rc.1") do not match.
readonly FINAL_VERSION_TAG_PATTERN="^v${VERSION_PATTERN}$"

# A release branch, for example "release/v1.4.2".
readonly RELEASE_BRANCH_PATTERN="^release/v${VERSION_PATTERN}$"

#=========#
# Helpers #
#=========#

# Stops the script with an error that GitHub Actions shows as an annotation on the run.
fail() {
    local title="$1"
    local message="$2"

    echo "::error title=${title}::${message}" >&2
    exit 1
}

# Prints every final version tag, from the oldest to the newest.
list_final_version_tags() {
    git tag --list 'v*' | grep -E "${FINAL_VERSION_TAG_PATTERN}" | sort --version-sort || true
}

# Prints the newest final version tag, or nothing when the project has never been released.
find_last_version_tag() {
    list_final_version_tags | tail -n 1
}

# Prints the "version:" value of a pubspec.yaml read on the standard input, for example
# "1.4.0+12", without quotes nor comment. Prints nothing when there is no version line.
read_pubspec_version() {
    sed --quiet --regexp-extended "/^version:/ { s/^version:[[:space:]]*['\"]?([^'\"[:space:]#]*).*/\1/p; q }"
}
