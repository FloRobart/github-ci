#!/usr/bin/env bash
#
# Checks that a pull request follows the gitflow:
#
#   feature/*, feat/*, bugfix/*, fix/*  →  dev
#   dependabot/* (dependency updates)   →  dev
#   main (back-merge)                   →  dev
#   release/vX.Y.Z, hotfix/*            →  main
#
# Pull requests towards any other branch are free: the gitflow only protects dev and main.
#
# Usage: check-pull-request-branches.sh <source branch> <target branch>

set -o errexit -o nounset -o pipefail

SCRIPTS_DIRECTORY="$(cd "$(dirname "$0")" && pwd)"
readonly SCRIPTS_DIRECTORY

source "${SCRIPTS_DIRECTORY}/common.sh"

readonly ALLOWED_SOURCES_FOR_DEV='^((feature|feat|bugfix|fix|dependabot)/.+|main)$'
readonly ALLOWED_SOURCES_FOR_DEV_DESCRIPTION='feature/*, feat/*, bugfix/*, fix/*, dependabot/* et main (back-merge)'

readonly ALLOWED_SOURCES_FOR_MAIN="^(release/v${VERSION_PATTERN}|hotfix/.+)$"
readonly ALLOWED_SOURCES_FOR_MAIN_DESCRIPTION='release/vX.Y.Z et hotfix/*'

main() {
    local source_branch="$1"
    local target_branch="$2"

    case "${target_branch}" in
        dev) check_source_branch "${source_branch}" "${target_branch}" "${ALLOWED_SOURCES_FOR_DEV}" "${ALLOWED_SOURCES_FOR_DEV_DESCRIPTION}" ;;
        main) check_source_branch "${source_branch}" "${target_branch}" "${ALLOWED_SOURCES_FOR_MAIN}" "${ALLOWED_SOURCES_FOR_MAIN_DESCRIPTION}" ;;
        *) echo "Aucune règle pour les pull requests vers ${target_branch}." ;;
    esac
}

check_source_branch() {
    local source_branch="$1"
    local target_branch="$2"
    local allowed_sources="$3"
    local allowed_sources_description="$4"

    if [[ "${source_branch}" =~ ${allowed_sources} ]]; then
        echo "${source_branch} → ${target_branch} : autorisé."
        return
    fi

    fail 'Branche refusée' "${source_branch} → ${target_branch} ne respecte pas le git flow. ${target_branch} n'accepte que : ${allowed_sources_description}."
}

main "$@"
