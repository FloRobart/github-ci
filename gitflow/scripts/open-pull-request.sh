#!/usr/bin/env bash
#
# Opens a pull request, unless one is already open between the same branches, or
# unless the base branch already contains every commit of the head branch. A failed
# run can therefore simply be re-run.
#
# Usage: open-pull-request.sh <head branch> <base branch> <title> <body>
# Needs GH_TOKEN and GH_REPO ("owner/repository").

set -o errexit -o nounset -o pipefail

main() {
    local head_branch="$1"
    local base_branch="$2"
    local title="$3"
    local body="$4"

    local open_pull_request_count
    open_pull_request_count=$(gh pr list --head "${head_branch}" --base "${base_branch}" --state open --json number --jq 'length')

    if [ "${open_pull_request_count}" -gt 0 ]; then
        echo "Une pull request ${head_branch} → ${base_branch} est déjà ouverte."
        return
    fi

    local missing_commit_count
    missing_commit_count=$(gh api "repos/${GH_REPO}/compare/${base_branch}...${head_branch}" --jq '.ahead_by')

    if [ "${missing_commit_count}" -eq 0 ]; then
        echo "${base_branch} contient déjà tout ${head_branch} : aucune pull request à ouvrir."
        return
    fi

    gh pr create --head "${head_branch}" --base "${base_branch}" --title "${title}" --body "${body}"
}

main "$@"
