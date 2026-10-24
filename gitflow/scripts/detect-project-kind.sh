#!/usr/bin/env bash
#
# Tells whether the project is an application or a library, and prints it as
# "key=value" lines meant for $GITHUB_OUTPUT. Run from the root of the project.
#
#   Name ending with "-app"           →  application
#   Name ending with "-lib"           →  library, which must not have a Dockerfile
#   Any other name, with a Dockerfile →  application (a warning asks for a suffix)
#   Any other name, no Dockerfile     →  library (a warning asks for a suffix)
#
# Printed keys:
#
#   kind            "application" or "library"
#   has-dockerfile  "true" when a Dockerfile exists at the root, "false" otherwise
#
# Usage: detect-project-kind.sh <project name, as printed by to-image-name.sh>

set -o errexit -o nounset -o pipefail

SCRIPTS_DIRECTORY="$(cd "$(dirname "$0")" && pwd)"
readonly SCRIPTS_DIRECTORY

source "${SCRIPTS_DIRECTORY}/common.sh"

readonly APPLICATION_SUFFIX='-app'
readonly LIBRARY_SUFFIX='-lib'

main() {
    local project_name="$1"

    local has_dockerfile='false'
    if [ -f Dockerfile ]; then
        has_dockerfile='true'
    fi

    local kind
    kind=$(detect_kind "${project_name}" "${has_dockerfile}")

    echo "kind=${kind}"
    echo "has-dockerfile=${has_dockerfile}"
}

detect_kind() {
    local project_name="$1"
    local has_dockerfile="$2"

    case "${project_name}" in
        *"${APPLICATION_SUFFIX}")
            echo 'application'
            ;;

        *"${LIBRARY_SUFFIX}")
            if [ "${has_dockerfile}" = 'true' ]; then
                fail 'Librairie avec un Dockerfile' "${project_name} se termine par ${LIBRARY_SUFFIX} mais a un Dockerfile : une librairie ne publie pas d'image. Supprimez le Dockerfile, ou renommez le dépôt en *${APPLICATION_SUFFIX}."
            fi
            echo 'library'
            ;;

        *)
            detect_kind_from_dockerfile "${project_name}" "${has_dockerfile}"
            ;;
    esac
}

# Fallback for the projects named before the "-app" / "-lib" convention.
detect_kind_from_dockerfile() {
    local project_name="$1"
    local has_dockerfile="$2"

    if [ "${has_dockerfile}" = 'true' ]; then
        echo "::warning title=Nom sans suffixe::${project_name} ne se termine ni par ${APPLICATION_SUFFIX} ni par ${LIBRARY_SUFFIX} : il a un Dockerfile, il est donc traité comme une application." >&2
        echo 'application'
        return
    fi

    echo "::warning title=Nom sans suffixe::${project_name} ne se termine ni par ${APPLICATION_SUFFIX} ni par ${LIBRARY_SUFFIX} : il n'a pas de Dockerfile, il est donc traité comme une librairie." >&2
    echo 'library'
}

main "$@"
