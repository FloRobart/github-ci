#!/usr/bin/env bash
#
# Creates the git tag and the GitHub Release of a version, with release notes
# generated from the pull requests merged since the previous final version.
# A release candidate is marked as a pre-release. Every file of the assets
# directory, when given, is attached to the release.
#
# Nothing happens when the release already exists, so a failed run can simply be re-run.
#
# Usage: create-github-release.sh <tag> <kind> <previous tag or ""> [assets directory]
# Needs GH_TOKEN, GH_REPO ("owner/repository") and GITHUB_SHA (the commit to tag).

set -o errexit -o nounset -o pipefail

main() {
    local tag="$1"
    local kind="$2"
    local previous_tag="$3"
    local assets_directory="${4:-}"

    if gh release view "${tag}" > /dev/null 2>&1; then
        echo "::notice title=Release déjà créée::${tag} existe déjà, elle est conservée."
        return
    fi

    local release_options=(--target "${GITHUB_SHA}" --title "${GH_REPO#*/} ${tag}" --generate-notes)

    if [ -n "${previous_tag}" ]; then
        release_options+=(--notes-start-tag "${previous_tag}")
    fi

    if [ "${kind}" = 'candidate' ]; then
        release_options+=(--prerelease)
    fi

    local asset_files=()
    if [ -n "${assets_directory}" ]; then
        mapfile -t asset_files < <(find "${assets_directory}" -type f | sort)
    fi

    gh release create "${tag}" "${release_options[@]}" "${asset_files[@]}"

    echo "::notice title=Release créée::${tag}"
}

main "$@"
