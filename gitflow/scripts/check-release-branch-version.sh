#!/usr/bin/env bash
#
# Checks that a release branch "release/vX.Y.Z" carries the version computed from
# its commits. The branch name announces the version, the commits decide it: they
# drift apart when a "feat" or a breaking change is pushed on the release branch
# after its creation.
#
# Usage: check-release-branch-version.sh <release branch> [git reference, "HEAD" by default]

set -o errexit -o nounset -o pipefail

SCRIPTS_DIRECTORY="$(cd "$(dirname "$0")" && pwd)"
readonly SCRIPTS_DIRECTORY

source "${SCRIPTS_DIRECTORY}/common.sh"

main() {
    local release_branch="$1"
    local reference="${2:-HEAD}"

    if [[ ! "${release_branch}" =~ ${RELEASE_BRANCH_PATTERN} ]]; then
        fail 'Branche de release invalide' "« ${release_branch} » doit s'appeler release/vX.Y.Z, par exemple release/v1.4.0."
    fi

    local branch_version="${release_branch#release/v}"
    local computed_version
    computed_version=$("${SCRIPTS_DIRECTORY}/compute-next-version.sh" "${reference}")

    if [ "${branch_version}" = "${computed_version}" ]; then
        echo "${release_branch} correspond bien à la version calculée depuis les commits."
        return
    fi

    fail 'Version incohérente' "La branche ${release_branch} annonce ${branch_version}, mais ses commits donnent ${computed_version}. Créez la branche release/v${computed_version} depuis celle-ci et ouvrez une nouvelle pull request."
}

main "$@"
