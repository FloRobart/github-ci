#!/usr/bin/env bash
#
# Decides what the current run publishes, and prints it as "key=value" lines meant
# for $GITHUB_OUTPUT. Nothing is written: this script only reads the git history.
#
#   Button on dev             →  first release candidate, and the release/vX.Y.Z branch to create
#   Button on release/vX.Y.Z  →  next release candidate of that release
#   Button on hotfix/*        →  next release candidate of the hotfix
#   Push on main              →  final version
#
# Printed keys:
#
#   kind                "candidate" or "final"
#   version             "1.5.0-rc.2" for a release candidate, "1.5.0" for a final version
#   tag                 the version prefixed with "v"
#   previous-tag        the last final version tag before this one, empty for a first release
#   new-release-branch  "release/v1.5.0" when the button was used on dev, empty otherwise
#
# Usage: EVENT_NAME=<github event> BRANCH_NAME=<branch> plan-release.sh
# The remote branches ("origin/...") and every tag must have been fetched.

set -o errexit -o nounset -o pipefail

SCRIPTS_DIRECTORY="$(cd "$(dirname "$0")" && pwd)"
readonly SCRIPTS_DIRECTORY

source "${SCRIPTS_DIRECTORY}/common.sh"

main() {
    if [ "${EVENT_NAME}" = 'push' ] && [ "${BRANCH_NAME}" = 'main' ]; then
        plan_final_release
        return
    fi

    if [ "${EVENT_NAME}" != 'workflow_dispatch' ]; then
        fail 'Événement non géré' "Une release se publie avec le bouton (workflow_dispatch) ou par un merge sur main, pas sur « ${EVENT_NAME} » de ${BRANCH_NAME}."
    fi

    case "${BRANCH_NAME}" in
        dev) plan_candidate_from_dev ;;
        release/*) plan_candidate_from_release_branch ;;
        hotfix/*) plan_candidate_from_hotfix_branch ;;
        *) fail 'Bouton refusé' "Le bouton ne fonctionne que sur dev, release/vX.Y.Z et hotfix/*, pas sur ${BRANCH_NAME}." ;;
    esac
}

#=========#
# Release #
#=========#

plan_final_release() {
    local version
    version=$(find_version_tagged_on_head)

    # A re-run keeps the version published by the first run, instead of computing the next one.
    if [ -z "${version}" ]; then
        version=$("${SCRIPTS_DIRECTORY}/compute-next-version.sh")
    fi

    print_plan 'final' "${version}" ''
}

#====================#
# Release candidates #
#====================#

plan_candidate_from_dev() {
    refuse_when_main_is_not_merged_into_dev
    refuse_when_a_release_is_in_progress

    local version
    version=$("${SCRIPTS_DIRECTORY}/compute-next-version.sh")

    print_plan 'candidate' "$(next_candidate_version "${version}")" "release/v${version}"
}

plan_candidate_from_release_branch() {
    "${SCRIPTS_DIRECTORY}/check-release-branch-version.sh" "${BRANCH_NAME}" > /dev/null

    local version="${BRANCH_NAME#release/v}"

    print_plan 'candidate' "$(next_candidate_version "${version}")" ''
}

plan_candidate_from_hotfix_branch() {
    local version
    version=$("${SCRIPTS_DIRECTORY}/compute-next-version.sh")

    print_plan 'candidate' "$(next_candidate_version "${version}")" ''
}

# Prints "1.5.0-rc.N", where N follows the last release candidate already tagged for 1.5.0.
next_candidate_version() {
    local version="$1"
    local last_candidate_number
    last_candidate_number=$(
        git tag --list "v${version}-rc.*" \
            | sed 's/.*-rc\.//' \
            | sort --numeric-sort \
            | tail -n 1
    )

    echo "${version}-rc.$((${last_candidate_number:-0} + 1))"
}

#===============#
# Gitflow rules #
#===============#

# A release branch starts from dev: dev must already contain everything published on main
# (previous version, hotfixes), or the release pull request would conflict with main.
refuse_when_main_is_not_merged_into_dev() {
    if git merge-base --is-ancestor origin/main HEAD; then
        return
    fi

    fail 'main non mergée dans dev' "main contient des commits absents de dev (version publiée ou hotfix). Mergez d'abord la pull request de back-merge main → dev, puis relancez le bouton."
}

# Only one release at a time: two releases opened together could be published in any
# order, and "latest" would go backwards. A release branch whose version is already
# tagged is a leftover that was not deleted: it is ignored.
refuse_when_a_release_is_in_progress() {
    local release_branch
    for release_branch in $(git branch --remotes --list 'origin/release/*' --format='%(refname:lstrip=3)'); do
        if git rev-parse --quiet --verify "refs/tags/${release_branch#release/}" > /dev/null; then
            continue
        fi

        fail 'Release déjà en cours' "${release_branch} n'est pas encore publiée. Mergez sa pull request dans main, ou supprimez la branche pour l'abandonner. Pour publier une nouvelle release candidate de cette version, lancez le bouton sur ${release_branch}."
    done
}

#=========#
# Helpers #
#=========#

# Prints the final version already tagged on HEAD, for example "1.5.0", or nothing.
find_version_tagged_on_head() {
    local version_tag
    version_tag=$(git tag --points-at HEAD | grep -E "${FINAL_VERSION_TAG_PATTERN}" | sort --version-sort | tail -n 1 || true)

    echo "${version_tag#v}"
}

# Prints the last final version tag published before "version_tag".
find_previous_version_tag() {
    local version_tag="$1"

    list_final_version_tags | grep --invert-match --line-regexp --fixed-strings "${version_tag}" | tail -n 1 || true
}

print_plan() {
    local kind="$1"
    local version="$2"
    local new_release_branch="$3"
    local final_version_tag="v${version%%-*}"

    echo "kind=${kind}"
    echo "version=${version}"
    echo "tag=v${version}"
    echo "previous-tag=$(find_previous_version_tag "${final_version_tag}")"
    echo "new-release-branch=${new_release_branch}"
}

main "$@"
