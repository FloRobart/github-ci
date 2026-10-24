#!/usr/bin/env bash
#
# Prints the name used for the Docker image and the release files of a repository:
# its name in lower case, where every run of characters other than a letter or a
# digit becomes a single hyphen.
#
#   "FlorAccess"     →  "floraccess"
#   "My_API.Server"  →  "my-api-server"
#   "--Odd  Name--"  →  "odd-name"
#
# Usage: to-image-name.sh <repository name>

set -o errexit -o nounset -o pipefail

readonly SCRIPTS_DIRECTORY="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPTS_DIRECTORY}/common.sh"

main() {
    local repository_name="$1"
    local image_name
    image_name=$(
        echo "${repository_name}" \
            | tr '[:upper:]' '[:lower:]' \
            | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'
    )

    if [ -z "${image_name}" ]; then
        fail 'Nom invalide' "Impossible de tirer un nom d'image de « ${repository_name} »."
    fi

    echo "${image_name}"
}

main "$@"
