#!/usr/bin/env bash
#
# Prints the next version, for example "1.5.0", computed from the commit messages
# (Conventional Commits) added since the last final version tag.
#
#   breaking change ("feat!: ...", "fix(api)!: ...", "BREAKING CHANGE: ...")  →  major
#   new feature ("feat: ...", "feat(api): ...")                              →  minor
#   anything else ("fix: ...", "chore: ...", "docs: ...")                    →  patch
#
# A project without any version tag starts at 0.1.0: its history may predate the
# gitflow, so its messages are not read.
#
# Usage: compute-next-version.sh [git reference, "HEAD" by default]

set -o errexit -o nounset -o pipefail

readonly SCRIPTS_DIRECTORY="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPTS_DIRECTORY}/common.sh"

readonly FIRST_VERSION='0.1.0'
readonly BREAKING_CHANGE_SUBJECT_PATTERN='^[a-z]+(\([^()]+\))?!: '
readonly BREAKING_CHANGE_FOOTER_PATTERN='^BREAKING[ -]CHANGE: '
readonly FEATURE_SUBJECT_PATTERN='^feat(\([^()]+\))?: '

# Prints "major", "minor" or "patch": the strongest change found in the commit range.
find_bump_level() {
    local commit_range="$1"
    local subjects
    local bodies
    subjects=$(git log --no-merges --format='%s' "${commit_range}")
    bodies=$(git log --no-merges --format='%b' "${commit_range}")

    if grep -Eq "${BREAKING_CHANGE_SUBJECT_PATTERN}" <<< "${subjects}"; then
        echo 'major'
        return
    fi

    if grep -Eq "${BREAKING_CHANGE_FOOTER_PATTERN}" <<< "${bodies}"; then
        echo 'major'
        return
    fi

    if grep -Eq "${FEATURE_SUBJECT_PATTERN}" <<< "${subjects}"; then
        echo 'minor'
        return
    fi

    echo 'patch'
}

# Prints the version that follows "version" for the given bump level.
bump_version() {
    local version="$1"
    local bump_level="$2"
    local major
    local minor
    local patch
    IFS='.' read -r major minor patch <<< "${version}"

    case "${bump_level}" in
        major) echo "$((major + 1)).0.0" ;;
        minor) echo "${major}.$((minor + 1)).0" ;;
        patch) echo "${major}.${minor}.$((patch + 1))" ;;
    esac
}

main() {
    local reference="${1:-HEAD}"
    local last_version_tag
    last_version_tag=$(find_last_version_tag)

    if [ -z "${last_version_tag}" ]; then
        echo "${FIRST_VERSION}"
        return
    fi

    local commit_range="${last_version_tag}..${reference}"
    if [ -z "$(git rev-list --no-merges --max-count=1 "${commit_range}")" ]; then
        fail 'Rien à publier' "Aucun nouveau commit depuis ${last_version_tag} : il n'y a pas de nouvelle version à publier."
    fi

    local bump_level
    bump_level=$(find_bump_level "${commit_range}")
    bump_version "${last_version_tag#v}" "${bump_level}"
}

main "$@"
