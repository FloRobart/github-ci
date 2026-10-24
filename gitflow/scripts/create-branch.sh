#!/usr/bin/env bash
#
# Creates a branch on GitHub, pointing at the given commit. Nothing happens when the
# branch already exists, so a failed run can simply be re-run.
#
# Usage: create-branch.sh <branch> <commit>
# Needs GH_TOKEN and GH_REPO ("owner/repository").

set -o errexit -o nounset -o pipefail

main() {
    local branch="$1"
    local commit="$2"

    if gh api "repos/${GH_REPO}/git/ref/heads/${branch}" --silent 2> /dev/null; then
        echo "La branche ${branch} existe déjà, elle est conservée."
        return
    fi

    gh api --method POST "repos/${GH_REPO}/git/refs" \
        --field "ref=refs/heads/${branch}" \
        --field "sha=${commit}" \
        --silent

    echo "::notice title=Branche créée::${branch}"
}

main "$@"
