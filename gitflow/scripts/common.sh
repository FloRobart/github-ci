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

# Prints the Android versionCode of an "X.Y.Z" version: X * 1000000 + Y * 1000 + Z, for
# example 1005002 for "1.5.2". Every new version gets a higher code, as Android and Google
# Play require. The code only depends on the version, so F-Droid, which rebuilds a version
# from its tag, finds the very same one in the committed pubspec.yaml.
compute_android_version_code() {
    local version="$1"

    if [[ ! "${version}" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
        fail 'Version invalide' "« ${version} » n'est pas une version X.Y.Z : son versionCode Android ne peut pas être calculé."
    fi

    # "10#" reads the numbers in base 10, even with a leading zero.
    local major=$((10#${BASH_REMATCH[1]}))
    local minor=$((10#${BASH_REMATCH[2]}))
    local patch=$((10#${BASH_REMATCH[3]}))

    # Android refuses a versionCode above 2100000000.
    if [ "${major}" -ge 2100 ] || [ "${minor}" -ge 1000 ] || [ "${patch}" -ge 1000 ]; then
        fail 'Version trop grande' "${version} : le versionCode Android (X × 1000000 + Y × 1000 + Z) demande X inférieur à 2100, Y et Z inférieurs à 1000."
    fi

    echo $((major * 1000000 + minor * 1000 + patch))
}

# Prints the "version:" value that pubspec.yaml carries for a version: the version followed
# by its Android versionCode as build number, for example "1.5.2+1005002".
format_pubspec_version() {
    local version="$1"
    local version_code

    # Explicit exit: a failure inside a command substitution does not stop the script by itself.
    version_code=$(compute_android_version_code "${version}") || exit 1

    echo "${version}+${version_code}"
}
