#!/usr/bin/env bash
#
# Checks that every commit of a pull request follows Conventional Commits:
#
#   <type>(<optional scope>)<optional !>: <description>
#   for example "feat(api): add the CSV export" or "fix!: drop the v1 routes"
#
# The version is computed from these messages (see compute-next-version.sh), so a
# message that does not follow the convention would be silently counted as a patch.
# Merge commits are skipped: git and GitHub write them, not a person.
#
# Usage: check-commit-messages.sh <base reference> <head reference>

set -o errexit -o nounset -o pipefail

SCRIPTS_DIRECTORY="$(cd "$(dirname "$0")" && pwd)"
readonly SCRIPTS_DIRECTORY

source "${SCRIPTS_DIRECTORY}/common.sh"

readonly ALLOWED_TYPES='build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test'
readonly CONVENTIONAL_SUBJECT_PATTERN="^(${ALLOWED_TYPES})(\([^()]+\))?!?: .+"

main() {
    local base_reference="$1"
    local head_reference="$2"
    local invalid_commits
    invalid_commits=$(list_invalid_commits "${base_reference}..${head_reference}")

    if [ -z "${invalid_commits}" ]; then
        echo 'Tous les commits respectent Conventional Commits.'
        return
    fi

    echo 'Commits refusés :' >&2
    echo "${invalid_commits}" >&2
    fail 'Message de commit invalide' "Les messages doivent suivre Conventional Commits, par exemple « feat(api): ajoute l'export CSV ». Types acceptés : ${ALLOWED_TYPES//|/, }. Corrigez-les avec « git rebase -i » puis poussez avec « git push --force-with-lease »."
}

# Prints "<short hash> <subject>" for every commit of the range that breaks the convention.
list_invalid_commits() {
    local commit_range="$1"
    local commit_hash
    local subject

    git log --no-merges --format='%h %s' "${commit_range}" | while read -r commit_hash subject; do
        if [[ ! "${subject}" =~ ${CONVENTIONAL_SUBJECT_PATTERN} ]]; then
            echo "${commit_hash} ${subject}"
        fi
    done
}

main "$@"
