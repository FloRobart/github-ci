#!/usr/bin/env bash
#
# Set the DOCKERHUB_USERNAME secret on several GitHub repositories at once.
#
# Requirements:
#   - GitHub CLI installed and authenticated (`gh auth login`)
#
# Usage:
#   ./scripts/set-dockerhub-username.sh                  # uses the REPOSITORY_NAMES list below
#   ./scripts/set-dockerhub-username.sh repo-a repo-b    # uses the names given as arguments
#

set -euo pipefail


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

readonly GITHUB_OWNER="FloRobart"
readonly SECRET_NAME="DOCKERHUB_USERNAME"
readonly SECRET_VALUE="florobart"

# Secret stores to update on each repository (GitHub Actions and Dependabot)
readonly SECRET_APPLICATIONS=("actions" "dependabot")

# Repository names only (the part after https://github.com/FloRobart/)
DEFAULT_REPOSITORY_NAMES=(
    "econoris-api"
    "econoris-app"
    "econoris-database"
    "econoris-vitrine"
    "floraccess-api"
    "floraccess-app"
    "floraccess-database"
    "hollylist-api"
    "hollylist-app"
    "hollylist-database"
)


# ---------------------------------------------------------------------------
# Functions
# ---------------------------------------------------------------------------

check_github_cli_is_ready() {
    if ! command -v gh > /dev/null 2>&1; then
        echo "Error: GitHub CLI (gh) is not installed." >&2
        exit 1
    fi

    if ! gh auth status > /dev/null 2>&1; then
        echo "Error: GitHub CLI is not authenticated. Run 'gh auth login' first." >&2
        exit 1
    fi
}


set_secret_on_repository() {
    local repository_name="$1"
    local full_repository_name="${GITHUB_OWNER}/${repository_name}"
    local has_failed=false

    for secret_application in "${SECRET_APPLICATIONS[@]}"; do
        if gh secret set "$SECRET_NAME" \
            --repo "$full_repository_name" \
            --app "$secret_application" \
            --body "$SECRET_VALUE"; then
            echo "OK     ${full_repository_name} (${secret_application})"
        else
            echo "FAILED ${full_repository_name} (${secret_application})" >&2
            has_failed=true
        fi
    done

    if [ "$has_failed" = true ]; then
        return 1
    fi

    return 0
}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
    local repository_names=("$@")

    if [ "${#repository_names[@]}" -eq 0 ]; then
        repository_names=("${DEFAULT_REPOSITORY_NAMES[@]}")
    fi

    if [ "${#repository_names[@]}" -eq 0 ]; then
        echo "Error: no repository given. Pass names as arguments or fill DEFAULT_REPOSITORY_NAMES." >&2
        exit 1
    fi

    check_github_cli_is_ready

    local failure_count=0

    for repository_name in "${repository_names[@]}"; do
        set_secret_on_repository "$repository_name" || failure_count=$((failure_count + 1))
    done

    echo ""
    echo "Done: $(( ${#repository_names[@]} - failure_count )) succeeded, ${failure_count} failed."

    if [ "$failure_count" -gt 0 ]; then
        exit 1
    fi
}


main "$@"
