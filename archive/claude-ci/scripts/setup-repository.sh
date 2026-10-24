#!/usr/bin/env bash
#
# Prepares a GitHub repository for the Git workflow:
#   1. merge options of the repository
#   2. integration branch, created from the production branch when it is missing
#   3. protection rulesets of the production and integration branches
#
# Usage:
#   scripts/setup-repository.sh <owner/repository> [production-branch] [integration-branch]
#
# Example:
#   scripts/setup-repository.sh FloRobart/Econoris_server main develop
#
# Requires the GitHub CLI (gh), signed in with an account that administers the
# repository. The script can be run again at any time: it updates what exists.
#
# Run it AFTER the workflow files are on the production branch. The rulesets
# require the "Policy" and "Quality" checks, which those files provide: without
# them, every pull request would stay blocked.

set -euo pipefail

SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

readonly RULESETS_DIRECTORY="${SCRIPT_DIRECTORY}/../rulesets"
readonly RULESET_PRODUCTION_BRANCH="main"
readonly RULESET_INTEGRATION_BRANCH="develop"

#==============================================================================#
# Section 1 : Messages                                                         #
#==============================================================================#

print_step() {
  echo
  echo "▶ $1"
}

print_success() {
  echo "  ✅ $1"
}

fail() {
  echo "  ❌ $1" >&2
  exit 1
}

print_usage() {
  echo "Usage : $(basename "$0") <owner/repository> [production-branch] [integration-branch]"
  echo "Exemple : $(basename "$0") FloRobart/Econoris_server main develop"
}

#==============================================================================#
# Section 2 : Checks                                                           #
#==============================================================================#

check_prerequisites() {
  if ! command -v gh > /dev/null; then
    fail "La GitHub CLI (gh) est introuvable. Installation : https://cli.github.com"
  fi

  if ! gh auth status > /dev/null 2>&1; then
    fail "La GitHub CLI n'est pas connectée. Lancez « gh auth login » puis relancez ce script."
  fi
}

branch_exists() {
  local repository="$1"
  local branch_name="$2"

  gh api "repos/${repository}/branches/${branch_name}" --silent > /dev/null 2>&1
}

#==============================================================================#
# Section 3 : Repository settings                                              #
#==============================================================================#

# Merge commits keep the history of production reachable from the integration
# branch; squash keeps one commit per pull request on the integration branch.
configure_merge_options() {
  local repository="$1"

  gh api --method PATCH "repos/${repository}" --silent \
    --field allow_merge_commit=true \
    --field allow_squash_merge=true \
    --field allow_rebase_merge=false \
    --field allow_auto_merge=true \
    --field delete_branch_on_merge=true \
    --raw-field squash_merge_commit_title=PR_TITLE \
    --raw-field squash_merge_commit_message=PR_BODY

  print_success "Options de merge configurées (merge commit, squash, auto-merge, suppression des branches mergées)."
}

create_integration_branch_if_missing() {
  local repository="$1"
  local production_branch="$2"
  local integration_branch="$3"

  if branch_exists "${repository}" "${integration_branch}"; then
    print_success "La branche « ${integration_branch} » existe déjà."
    return
  fi

  local production_commit
  production_commit="$(gh api "repos/${repository}/git/ref/heads/${production_branch}" --jq '.object.sha')"

  gh api --method POST "repos/${repository}/git/refs" --silent \
    --raw-field ref="refs/heads/${integration_branch}" \
    --raw-field sha="${production_commit}"

  print_success "Branche « ${integration_branch} » créée à partir de « ${production_branch} »."
}

#==============================================================================#
# Section 4 : Rulesets                                                         #
#==============================================================================#

read_ruleset_name() {
  local ruleset_file="$1"

  grep --max-count=1 '"name"' "${ruleset_file}" | sed -E 's/.*"name": "([^"]+)".*/\1/'
}

find_ruleset_identifier() {
  local repository="$1"
  local ruleset_name="$2"

  gh api "repos/${repository}/rulesets" --jq ".[] | select(.name == \"${ruleset_name}\") | .id"
}

# The ruleset files target "main" and "develop": the branch name is replaced on
# the fly for repositories that use other names.
apply_ruleset() {
  local repository="$1"
  local ruleset_file="$2"
  local ruleset_branch="$3"
  local repository_branch="$4"

  local ruleset_name
  ruleset_name="$(read_ruleset_name "${ruleset_file}")"

  local ruleset_identifier
  ruleset_identifier="$(find_ruleset_identifier "${repository}" "${ruleset_name}")"

  local method="POST"
  local endpoint="repos/${repository}/rulesets"

  if [ -n "${ruleset_identifier}" ]; then
    method="PUT"
    endpoint="repos/${repository}/rulesets/${ruleset_identifier}"
  fi

  sed "s|refs/heads/${ruleset_branch}|refs/heads/${repository_branch}|" "${ruleset_file}" \
    | gh api --method "${method}" "${endpoint}" --silent --input -

  print_success "Ruleset « ${ruleset_name} » appliqué à la branche « ${repository_branch} »."
}

#==============================================================================#
# Section 5 : Main                                                             #
#==============================================================================#

main() {
  if [ "$#" -lt 1 ] || [ "$#" -gt 3 ]; then
    print_usage
    exit 1
  fi

  local repository="$1"
  local production_branch="${2:-${RULESET_PRODUCTION_BRANCH}}"
  local integration_branch="${3:-${RULESET_INTEGRATION_BRANCH}}"

  check_prerequisites

  if ! branch_exists "${repository}" "${production_branch}"; then
    fail "La branche « ${production_branch} » est introuvable sur ${repository}. Vérifiez le nom du dépôt et celui de la branche de production."
  fi

  print_step "Options de merge de ${repository}"
  configure_merge_options "${repository}"

  print_step "Branche d'intégration"
  create_integration_branch_if_missing "${repository}" "${production_branch}" "${integration_branch}"

  print_step "Protection des branches"
  apply_ruleset "${repository}" "${RULESETS_DIRECTORY}/production-branch.json" "${RULESET_PRODUCTION_BRANCH}" "${production_branch}"
  apply_ruleset "${repository}" "${RULESETS_DIRECTORY}/integration-branch.json" "${RULESET_INTEGRATION_BRANCH}" "${integration_branch}"

  echo
  echo "✅ ${repository} est prêt pour le Git workflow."
}

main "$@"
