#!/usr/bin/env bash
#
# Writes the version into the project files (see write-version-files.sh) on a release or
# hotfix branch, and prints "commit=<sha>" for $GITHUB_OUTPUT: the commit to tag, which
# holds the built code and the written version.
#
#   Branch missing (button on dev)      →  branch created on the built commit, plus a version commit when needed
#   Branch on the built commit          →  version commit pushed when needed
#   Branch already on that version      →  kept: a re-run tags the commit pushed by the first attempt
#     commit (re-run)
#   Branch moved on during the run      →  refused when a version commit is needed: it would
#                                          sit on code that was not built
#
# The version commit uses the "chore" type, so it never changes the computed version.
#
# Run from a checkout of the built commit, with the full history and credentials that can push.
#
# Usage: commit-version-files.sh <branch> <version, for example "1.5.0">

set -o errexit -o nounset -o pipefail

SCRIPTS_DIRECTORY="$(cd "$(dirname "$0")" && pwd)"
readonly SCRIPTS_DIRECTORY

source "${SCRIPTS_DIRECTORY}/common.sh"

readonly COMMITTER_NAME='github-actions[bot]'
readonly COMMITTER_EMAIL='41898282+github-actions[bot]@users.noreply.github.com'

main() {
    local branch="$1"
    local version="$2"

    local built_commit
    built_commit=$(git rev-parse HEAD)

    local branch_commit
    branch_commit=$(fetch_branch_commit "${branch}")

    "${SCRIPTS_DIRECTORY}/write-version-files.sh" "${version}"

    if git diff --quiet; then
        echo "Les fichiers de version portent déjà ${version}." >&2
        if [ -z "${branch_commit}" ]; then
            push_branch "${built_commit}" "${branch}"
        fi

        echo "commit=${built_commit}"
        return
    fi

    local version_commit
    version_commit=$(create_version_commit "${version}")

    if [ -z "${branch_commit}" ] || [ "${branch_commit}" = "${built_commit}" ]; then
        push_branch "${version_commit}" "${branch}"
        echo "::notice title=Version écrite::${version} écrite dans les fichiers du projet, sur ${branch}." >&2
        echo "commit=${version_commit}"
        return
    fi

    if is_same_version_commit "${branch_commit}" "${version_commit}"; then
        echo "${branch} porte déjà le commit de version ${version}, il est conservé." >&2
        echo "commit=${branch_commit}"
        return
    fi

    fail 'Branche modifiée pendant le run' "${branch} a reçu des commits depuis le lancement du bouton : la version ne peut pas être écrite par-dessus du code qui n'a pas été construit. Relancez le bouton sur ${branch}."
}

#=========#
# Helpers #
#=========#

# Prints the commit the branch points at on the remote, or nothing when it does not exist.
# The commit is fetched, so it can be compared with the local ones.
fetch_branch_commit() {
    local branch="$1"
    local branch_commit
    branch_commit=$(git ls-remote --heads origin "refs/heads/${branch}" | cut -f 1)

    if [ -n "${branch_commit}" ]; then
        git fetch --quiet origin "refs/heads/${branch}"
    fi

    echo "${branch_commit}"
}

# Commits the written version files and prints the new commit.
create_version_commit() {
    local version="$1"

    git add --update
    git -c user.name="${COMMITTER_NAME}" -c user.email="${COMMITTER_EMAIL}" \
        commit --quiet --message "chore(release): v${version}"

    git rev-parse HEAD
}

push_branch() {
    local commit="$1"
    local branch="$2"

    git push --quiet origin "${commit}:refs/heads/${branch}"
}

# True when the branch commit was pushed by a previous attempt of the same run: same
# parent and same files as the version commit just created.
is_same_version_commit() {
    local branch_commit="$1"
    local version_commit="$2"

    [ "$(git rev-parse "${branch_commit}^")" = "$(git rev-parse "${version_commit}^")" ] \
        && [ "$(git rev-parse "${branch_commit}^{tree}")" = "$(git rev-parse "${version_commit}^{tree}")" ]
}

main "$@"
